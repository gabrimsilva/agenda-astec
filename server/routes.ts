import type { Express } from "express";
import { createServer, type Server } from "http";
import express from "express";
import multer from "multer";
import * as fs from "fs";
import * as path from "path";
import archiver from "archiver";
import { generatePdfFromHtml, getBrowserStats } from "./browser-pool";
import { RENNER_LOGO_BASE64 } from "./logo-base64";
import { storage } from "./storage";
import { db } from "./db";
import { eq, and, gte, lte, lt, not, ne, sql, desc, inArray, or } from "drizzle-orm";
import { hashPassword, comparePassword, generateToken, verifyToken } from "./auth";
import { authMiddleware, roleMiddleware, agendaScopeMiddleware, reportsScopeMiddleware, type AuthRequest } from "./middleware";
import { insertUserSchema, insertTechnicianSchema, insertClientSchema, insertClientSiteSchema, insertActivityTypeSchema, insertSegmentSchema, insertRegionSchema, insertActivitySchema, insertApprovalSchema, insertDayMarkerSchema, insertAgendaBlockSchema, loginSchema, updateUserSchema, updateTechnicianSchema, updateUserAndTechnicianSchema, updateClientSchema, updateClientSiteSchema, updateActivityTypeSchema, updateSegmentSchema, updateRegionSchema, updateActivitySchema, updateApprovalSchema, createUserAndTechnicianSchema, insertTechnicianLocationSchema, insertTimeEntrySchema, insertNotificationSchema, insertUserPushSubscriptionSchema, insertRatSchema, createRatSchema, updateRatSchema, technicians, timeEntries, activityTypes, auditLogs, rats, activityTravelTimes, activityTimeRecords, activityReschedules, activityDayStatus, activities, users, travelSegments, approvals, activityAttachments, type InsertUser, type InsertTechnician } from "@shared/schema";
import { seedActivityTypes, seedDefaultAdmin } from "./seed";
import { parseGoogleMapsUrl, isValidCoordinates } from "./utils/geo";
import { parseExcelData, EXPECTED_COLUMNS } from "./utils/excel";
import { broadcastLocationUpdate, broadcastActivityUpdate } from "./ws";
import { geocodeAddress, reverseGeocode, reverseGeocodeDetailed } from "./services/geocoding";
import { calculateRoute, calculateOptimizedRoute, generateNavigationLinks, type Waypoint } from "./services/routing";

// Cache simples de reverse geocoding por coordenada (evita repetir chamadas
// para a mesma localização entre polls do Painel TV). Chave: lat,lng arredondados.
const reverseGeoCache = new Map<string, { city: string | null; state: string | null }>();

// Configure multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

const SERVER_BUILD_ID = Date.now().toString();

// ── RATs in-memory cache (stale-while-revalidate) ─────────────────────────────
// Prevents Replit gateway 500 errors caused by slow Neon DB cold-start queries.
// Serves cached data in <5ms; refreshes the cache in the background after TTL.
const _ratsCache = new Map<string, { data: any[]; ts: number }>();
const _ratsRefreshing = new Set<string>();
const RATS_CACHE_TTL = 10 * 60 * 1000; // 10 minutes - aumentado para manter cache quente mais tempo

// ── Technicians in-memory cache (stale-while-revalidate) ──────────────────────
// Prevents slow Neon DB queries for technicians list (called by multiple endpoints).
const _techniciansCache = { data: null as any[] | null, ts: 0 };
const TECHNICIANS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Small cache: userId → technicianId (survives until server restart).
// Eliminates a DB round-trip on every GET /api/rats for "assistente" users.
const _userTechCache = new Map<string, string>();

// Minimal column set for the RAT list view — heavy blobs excluded.
// applicationNote can be many KB per RAT × 150+ rows = several MB of payload.
// All heavy fields (formData, photoSections, technicianSignature, etc.) are
// loaded on-demand by the individual RAT dialogs via GET /api/rats/:id.
function getRatsLightSelect() {
  return {
    id: rats.id,
    reportNumber: rats.reportNumber,
    reportNumberManual: rats.reportNumberManual,
    activityId: rats.activityId,
    technicianId: rats.technicianId,
    clientName: rats.clientName,
    status: rats.status,
    openDate: rats.openDate,
    sentAt: rats.sentAt,
    importedPdfUrl: rats.importedPdfUrl,
    importedPdfFilename: rats.importedPdfFilename,
    isSimplified: rats.isSimplified,
    createdAt: rats.createdAt,
    hasFormData: sql<boolean>`(form_data IS NOT NULL)`.as("has_form_data"),
    hasSignature: sql<boolean>`(technician_signature IS NOT NULL)`.as("has_signature"),
    hasPhotos: sql<boolean>`(photo_sections IS NOT NULL OR photos IS NOT NULL)`.as("has_photos"),
  };
}

// Full invalidation — only for bulk ops (fix-pending) where many rows change at once.
// For individual mutations, prefer the surgical helpers below.
function invalidateRatsCache(technicianId?: string | null) {
  _ratsCache.delete("admin");
  if (technicianId) {
    _ratsCache.delete(`tech:${technicianId}`);
  } else {
    for (const k of _ratsCache.keys()) {
      if (k.startsWith("tech:")) _ratsCache.delete(k);
    }
  }
  console.log(`[RATs cache] full-invalidated (technicianId=${technicianId ?? "all"})`);
}

// Surgical patch — updates one RAT's light fields in every cache entry without clearing.
// Call this after any PUT/PATCH/send/pdf-upload/pdf-delete so admin stays warm.
function patchRatInCache(ratId: string, fields: Record<string, any>) {
  for (const entry of _ratsCache.values()) {
    const idx = entry.data.findIndex((r: any) => r.id === ratId);
    if (idx !== -1) {
      entry.data[idx] = { ...entry.data[idx], ...fields };
    }
  }
}

// Add a newly created RAT to existing cache entries (no full flush).
function addRatToCache(lightRat: Record<string, any>) {
  const adminEntry = _ratsCache.get("admin");
  if (adminEntry) adminEntry.data.unshift(lightRat);
  const techKey = `tech:${lightRat.technicianId}`;
  const techEntry = _ratsCache.get(techKey);
  if (techEntry) techEntry.data.unshift(lightRat);
}

// Remove a deleted RAT from every cache entry without clearing.
function removeRatFromCache(ratId: string) {
  for (const entry of _ratsCache.values()) {
    const idx = entry.data.findIndex((r: any) => r.id === ratId);
    if (idx !== -1) entry.data.splice(idx, 1);
  }
}

async function _bgRefreshRatsCache(key: string, queryFn: () => Promise<any[]>) {
  if (_ratsRefreshing.has(key)) return;
  _ratsRefreshing.add(key);
  try {
    const data = await queryFn();
    _ratsCache.set(key, { data, ts: Date.now() });
    console.log(`[RATs cache] refreshed key="${key}" (${data.length} items)`);
  } catch (err: any) {
    console.error(`[RATs cache] background refresh failed key="${key}":`, err.message);
  } finally {
    _ratsRefreshing.delete(key);
  }
}

// ── Technicians cache refresh helper
async function _bgRefreshTechniciansCache() {
  try {
    const data = await storage.getAllTechnicians();
    _techniciansCache.data = data;
    _techniciansCache.ts = Date.now();
    console.log(`[Technicians cache] refreshed (${data.length} items)`);
  } catch (err: any) {
    console.error("[Technicians cache] background refresh failed:", err.message);
  }
}

// Invalidate technicians cache when they change
function invalidateTechniciansCache() {
  _techniciansCache.data = null;
  _techniciansCache.ts = 0;
  console.log("[Technicians cache] invalidated");
}
// ──────────────────────────────────────────────────────────────────────────────

export async function registerRoutes(app: Express): Promise<Server> {
  // Create DB index for rats.created_at once on startup (idempotent — no-op if already exists).
  // Without this index, ORDER BY created_at DESC requires a full sequential scan of the rats
  // table, which gets slower as rows accumulate.
  db.execute(sql`CREATE INDEX IF NOT EXISTS idx_rats_created_at ON rats(created_at DESC)`)
    .then(() => console.log("[DB] idx_rats_created_at ready"))
    .catch((e: any) => console.warn("[DB] index creation skipped:", e.message));

  // Index for the per-technician RAT list query (WHERE technician_id = ... ORDER BY created_at DESC).
  db.execute(sql`CREATE INDEX IF NOT EXISTS idx_rats_technician_created ON rats(technician_id, created_at DESC)`)
    .then(() => console.log("[DB] idx_rats_technician_created ready"))
    .catch((e: any) => console.warn("[DB] index creation skipped:", e.message));

  // Health check endpoint for Autoscale deployments
  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "healthy", timestamp: new Date().toISOString() });
  });

  // DB warmup endpoint — makes a real DB round-trip so Neon connection pool stays alive
  app.get("/api/warmup", async (_req, res) => {
    try {
      await db.execute(sql`SELECT 1`);
      res.json({ status: "warm", ts: Date.now() });
    } catch (err: any) {
      console.warn("[warmup] DB ping failed:", err.message);
      res.status(500).json({ status: "cold", error: err.message });
    }
  });

  app.get("/api/version", (_req, res) => {
    res.json({ buildId: SERVER_BUILD_ID });
  });

  // Seed initial data (skip if already done in index.ts)
  try {
    await seedDefaultAdmin();
  } catch (error: any) {
    console.error("⚠️  Database seeding in routes failed:", error.message);
  }

  // Auth routes - Registration is restricted to admin users only
  app.post("/api/auth/register", authMiddleware, roleMiddleware(["admin"]), async (req: AuthRequest, res) => {
    try {
      const { email, password, role, name } = insertUserSchema.parse(req.body);

      const existingEmail = await storage.getUserByEmail(email);
      if (existingEmail) {
        return res.status(400).json({ error: "Este email já está cadastrado no sistema." });
      }

      const hashedPassword = await hashPassword(password);
      const user = await storage.createUser({
        email,
        password: hashedPassword,
        role: role || "assistente",
        name,
      });

      const { password: _, ...userWithoutPassword } = user;

      res.status(201).json({ user: userWithoutPassword });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = loginSchema.parse(req.body);

      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ error: "Email ou senha incorretos. Verifique e tente novamente." });
      }

      const isValidPassword = await comparePassword(password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ error: "Email ou senha incorretos. Verifique e tente novamente." });
      }

      const token = generateToken(user);
      const { password: _, ...userWithoutPassword } = user;

      res.json({ user: userWithoutPassword, token });
    } catch (error: any) {
      res.status(401).json({ error: "Não foi possível fazer login. Verifique suas credenciais." });
    }
  });

  // Login via Datasul (ERP TOTVS). Valida as credenciais no ERP (Basic Auth) e,
  // se válidas, autentica o usuário do ASTEC cujo "Perfil Datasul" corresponde
  // ao usuário informado — herdando o papel (admin/assistente) já cadastrado.
  app.post("/api/auth/datasul-login", async (req, res) => {
    try {
      const { username, password, host } = (req.body || {}) as {
        username?: string;
        password?: string;
        host?: string;
      };
      if (!username || !password) {
        return res.status(400).json({ error: "Informe usuário e senha do Datasul." });
      }

      const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;

      let erpRes: Response;
      try {
        erpRes = await datasulFetch(host, "1,1", authHeader);
      } catch (err: any) {
        if (err?.name === "AbortError") {
          return res.status(504).json({ error: "Tempo de conexão esgotado ao acessar o Datasul." });
        }
        return res.status(502).json({ error: "Não foi possível conectar ao Datasul. Verifique a rede/host." });
      }

      if (erpRes.status === 401 || erpRes.status === 403) {
        return res.status(401).json({ error: "Usuário ou senha do Datasul inválidos." });
      }
      if (!erpRes.ok) {
        return res.status(502).json({ error: `Falha ao conectar no Datasul (HTTP ${erpRes.status}).` });
      }

      // Credenciais válidas no ERP → localiza o usuário do ASTEC pelo perfil Datasul.
      const user = await storage.getUserByDatasulUsername(String(username).trim());
      if (!user) {
        return res.status(403).json({
          error:
            "Login no Datasul validado, mas nenhum usuário do ASTEC está associado a este perfil Datasul. Contate o administrador.",
        });
      }

      const token = generateToken(user);
      const { password: _, ...userWithoutPassword } = user;
      res.json({
        user: userWithoutPassword,
        token,
        datasulToken: authHeader, // token Basic p/ buscas Datasul na sessão (ex.: clientes no agendamento)
        datasulHost: resolveDatasulHost(host),
      });
    } catch (error: any) {
      res.status(401).json({ error: "Não foi possível fazer login via Datasul." });
    }
  });

  app.get("/api/auth/me", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const user = await storage.getUser(req.user!.userId);
      if (!user) {
        return res.status(404).json({ error: "Usuário não encontrado." });
      }

      const { password: _, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Users routes (admin only)
  app.get("/api/users", authMiddleware, roleMiddleware(["admin"]), async (req: AuthRequest, res) => {
    try {
      const allUsers = await storage.getAllUsers();
      const usersWithoutPassword = allUsers.map(({ password: _, ...user }) => user);
      res.json(usersWithoutPassword);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/users", authMiddleware, roleMiddleware(["admin"]), async (req: AuthRequest, res) => {
    try {
      const { email, password, role, name } = insertUserSchema.parse(req.body);

      const existingEmail = await storage.getUserByEmail(email);
      if (existingEmail) {
        return res.status(400).json({ error: "Este email já está cadastrado no sistema." });
      }

      const hashedPassword = await hashPassword(password);
      const user = await storage.createUser({
        email,
        password: hashedPassword,
        role: role || "assistente",
        name,
      });

      const { password: _, ...userWithoutPassword } = user;
      res.status(201).json(userWithoutPassword);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.put("/api/users/:id", authMiddleware, roleMiddleware(["admin"]), async (req: AuthRequest, res) => {
    try {
      // If password is provided, hash it separately
      let updateData: any = updateUserSchema.parse(req.body);
      
      // Only hash if password is provided, non-empty, and not already a bcrypt hash
      if (req.body.password && typeof req.body.password === 'string' && req.body.password.trim().length > 0) {
        // Bcrypt hashes start with $2, $2a, $2b, or $2y
        const isBcryptHash = req.body.password.startsWith('$2');
        if (!isBcryptHash) {
          const hashedPassword = await hashPassword(req.body.password);
          updateData = { ...updateData, password: hashedPassword };
        }
      } else if (!req.body.password || req.body.password.trim().length === 0) {
        // Remove password from update if empty/undefined
        delete updateData.password;
      }
      
      const user = await storage.updateUser(req.params.id, updateData);
      const { password: _, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/users/:id", authMiddleware, roleMiddleware(["admin"]), async (req: AuthRequest, res) => {
    try {
      await storage.deleteUser(req.params.id);
      res.status(204).send();
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Upload avatar for user (user can update their own avatar)
  app.post("/api/users/:id/avatar", authMiddleware, upload.single("avatar"), async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      
      // Users can only update their own avatar unless admin
      if (req.user!.role !== "admin" && req.user!.userId !== id) {
        return res.status(403).json({ error: "Você só pode atualizar seu próprio avatar" });
      }
      
      if (!req.file) {
        return res.status(400).json({ error: "Nenhuma imagem enviada" });
      }
      
      // Validate file type
      const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
      if (!allowedTypes.includes(req.file.mimetype)) {
        return res.status(400).json({ error: "Tipo de arquivo não suportado. Use JPEG, PNG, GIF ou WebP." });
      }
      
      // Convert to base64 data URL
      const base64 = req.file.buffer.toString("base64");
      const avatarUrl = `data:${req.file.mimetype};base64,${base64}`;
      
      // Update user's avatarUrl
      const user = await storage.updateUser(id, { avatarUrl });
      
      // Also update technician's avatarUrl if exists
      const technician = await storage.getTechnicianByUserId(id);
      if (technician) {
        await storage.updateTechnician(technician.id, { avatarUrl });
      }
      
      const { password: _, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error: any) {
      console.error("Upload avatar error:", error);
      res.status(400).json({ error: error.message });
    }
  });

  // Delete avatar for user
  app.delete("/api/users/:id/avatar", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      
      // Users can only update their own avatar unless admin
      if (req.user!.role !== "admin" && req.user!.userId !== id) {
        return res.status(403).json({ error: "Você só pode atualizar seu próprio avatar" });
      }
      
      // Update user's avatarUrl to null
      const user = await storage.updateUser(id, { avatarUrl: null });
      
      // Also update technician's avatarUrl if exists
      const technician = await storage.getTechnicianByUserId(id);
      if (technician) {
        await storage.updateTechnician(technician.id, { avatarUrl: null });
      }
      
      const { password: _, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error: any) {
      console.error("Delete avatar error:", error);
      res.status(400).json({ error: error.message });
    }
  });

  // Create user + technician atomically
  app.post("/api/users-with-technician", authMiddleware, roleMiddleware(["admin"]), async (req: AuthRequest, res) => {
    try {
      const data = createUserAndTechnicianSchema.parse(req.body);
      
      // Check if email already exists
      const existingEmail = await storage.getUserByEmail(data.email);
      if (existingEmail) {
        return res.status(400).json({ error: "Email já está em uso" });
      }
      
      const bcrypt = await import("bcrypt");
      
      // Hash password
      const hashedPassword = await bcrypt.hash(data.password, 10);
      
      // Split data into user and technician parts
      const userData: InsertUser = {
        email: data.email,
        password: hashedPassword,
        role: data.role,
        name: data.name,
        datasulUsername: data.datasulUsername || null,
      };
      
      const technicianData: Omit<InsertTechnician, 'userId'> = {
        name: data.name,
        email: data.email,
        phone: data.phone,
        team: data.team,
        baseCity: data.baseCity,
        color: data.color,
        avatarUrl: data.avatarUrl,
        vehicleInfo: data.vehicleInfo,
        licenseNumber: data.licenseNumber,
        workHoursPerDay: data.workHoursPerDay,
        baseAddress: data.baseAddress,
        baseNumero: data.baseNumero,
        baseBairro: data.baseBairro,
        baseState: data.baseState,
        baseLatitude: data.baseLatitude,
        baseLongitude: data.baseLongitude,
      };
      
      const result = await storage.createUserAndTechnician({ user: userData, technician: technicianData });
      res.status(201).json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Technicians routes
  app.get("/api/technicians", authMiddleware, async (req: AuthRequest, res) => {
    try {
      // ── Stale-while-revalidate for technicians ────────────────────────
      if (_techniciansCache.data) {
        // Always serve cached data immediately
        res.json(_techniciansCache.data);
        // Trigger background refresh only if TTL has expired
        const age = Date.now() - _techniciansCache.ts;
        if (age > TECHNICIANS_CACHE_TTL) {
          _bgRefreshTechniciansCache().catch(() => {});
        }
        return;
      }
      // ─────────────────────────────────────────────────────────────────

      // No cache yet — run the query (first load after server restart)
      // Retry up to 3 times to absorb Neon cold-start delays
      let technicians: any[] | null = null;
      let lastError: any = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          technicians = await storage.getAllTechnicians();
          break;
        } catch (dbErr: any) {
          lastError = dbErr;
          console.error(`[Technicians] DB query attempt ${attempt + 1}/3 failed:`, dbErr.message);
          if (attempt < 2) await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt)));
        }
      }
      if (technicians === null) throw lastError;

      _techniciansCache.data = technicians;
      _techniciansCache.ts = Date.now();
      console.log(`[Technicians cache] cold-populated (${technicians.length} items)`);
      res.json(technicians);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Status route MUST come before :id route to avoid "status" being treated as an ID
  app.get("/api/technicians/status", authMiddleware, roleMiddleware(["admin"]), async (req: AuthRequest, res) => {
    try {
      const { reverseGeocodeDetailed } = await import("./services/geocoding");
      const allTechnicians = await storage.getAllTechnicians();
      
      // Filter to show only field technicians (assistente role), not admins
      const fieldTechnicians = await Promise.all(
        allTechnicians.map(async (technician) => {
          const user = await storage.getUser(technician.userId);
          return { technician, user };
        })
      );
      
      const assistenteTechnicians = fieldTechnicians
        .filter(({ user }) => user?.role === "assistente")
        .map(({ technician }) => technician);
      
      // Get today's activities to determine current activity status
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const allActivities = await storage.getActivitiesByDateRange(today, tomorrow);
      
      // Process technicians sequentially to respect rate limit (1 req/sec for Nominatim)
      const techniciansWithStatus = [];
      for (const technician of assistenteTechnicians) {
        const lastLocation = await storage.getLastTechnicianLocation(technician.id);
        
        // Find current activity status for this technician
        const technicianActivities = allActivities.filter((a: any) => 
          a.technicianId === technician.id
        );
        
        // Priority: emExecucao > aCaminho > planejado
        let currentActivityStatus: string | null = null;
        const activeActivity = technicianActivities.find((a: any) => a.status === "emExecucao");
        if (activeActivity) {
          currentActivityStatus = "emExecucao";
        } else {
          const enRouteActivity = technicianActivities.find((a: any) => a.status === "aCaminho");
          if (enRouteActivity) {
            currentActivityStatus = "aCaminho";
          }
        }
        
        // Considera registro como inativo se tiver mais de 5 minutos
        const LOCATION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutos
        const isLocationStale = lastLocation && lastLocation.updatedAt 
          ? (Date.now() - new Date(lastLocation.updatedAt).getTime()) > LOCATION_TIMEOUT_MS
          : true;
        
        // Se o registro é muito antigo, força status como inativo
        const effectiveGpsStatus = (lastLocation && !isLocationStale) 
          ? lastLocation.gpsStatus 
          : "inativo";
        const effectiveConnectionStatus = (lastLocation && !isLocationStale) 
          ? lastLocation.connectionStatus 
          : "offline";
        
        // If we have coordinates but no address, do reverse geocoding
        let address = lastLocation?.address || null;
        let city: string | null = null;
        
        if (lastLocation && lastLocation.latitude && lastLocation.longitude && !address) {
          try {
            const lat = parseFloat(lastLocation.latitude);
            const lon = parseFloat(lastLocation.longitude);
            if (!isNaN(lat) && !isNaN(lon)) {
              const geocodeResult = await reverseGeocodeDetailed(lat, lon);
              if (geocodeResult.found) {
                address = geocodeResult.address;
                city = geocodeResult.city;
              }
            }
          } catch (error) {
            console.error(`[Geocoding] Error for technician ${technician.id}:`, error);
          }
        }
        
        techniciansWithStatus.push({
          technicianId: technician.id,
          name: technician.name,
          email: technician.email,
          team: technician.team,
          color: technician.color,
          baseCity: technician.baseCity,
          baseAddress: technician.baseAddress,
          status: effectiveConnectionStatus,
          gpsStatus: effectiveGpsStatus,
          currentActivityStatus: currentActivityStatus,
          lastLocation: lastLocation ? {
            latitude: lastLocation.latitude,
            longitude: lastLocation.longitude,
            accuracy: lastLocation.accuracy,
            address: address,
            city: city,
            updatedAt: lastLocation.updatedAt,
          } : null,
          battery: lastLocation?.battery,
          device: lastLocation?.deviceModel,
          androidVersion: lastLocation?.androidVersion,
          appVersion: lastLocation?.appVersion,
        });
      }
      
      res.json(techniciansWithStatus);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Nearby technicians route (MUST come before :id route)
  app.get("/api/technicians/nearby", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { lat, lng } = req.query;
      
      if (!lat || !lng) {
        return res.status(400).json({ error: "Localização (latitude e longitude) é obrigatória." });
      }
      
      const searchLat = parseFloat(lat as string);
      const searchLng = parseFloat(lng as string);
      
      if (isNaN(searchLat) || isNaN(searchLng)) {
        return res.status(400).json({ error: "Coordenadas inválidas." });
      }
      
      // Get all technicians with GPS data
      const allTechnicians = await storage.getAllTechnicians();
      const { calculateDistance } = await import("./utils/geo");
      const { calculateRoute } = await import("./services/routing");
      
      // Filter to show only field technicians (assistente role)
      const fieldTechnicians = await Promise.all(
        allTechnicians.map(async (technician) => {
          const user = await storage.getUser(technician.userId);
          return { technician, user };
        })
      );
      
      const assistenteTechnicians = fieldTechnicians
        .filter(({ user }) => user?.role === "assistente")
        .map(({ technician }) => technician);
      
      // Get technicians with last known GPS location (even if offline)
      const techniciansNearby = await Promise.all(
        assistenteTechnicians.map(async (technician) => {
          const lastLocation = await storage.getLastTechnicianLocation(technician.id);
          
          // Only include technicians with a last known location (within 24 hours)
          const LOCATION_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 hours
          const isLocationStale = lastLocation && lastLocation.updatedAt 
            ? (Date.now() - new Date(lastLocation.updatedAt).getTime()) > LOCATION_TIMEOUT_MS
            : true;
          
          // Show all technicians with last known location, regardless of GPS status
          if (!lastLocation || isLocationStale) {
            return null;
          }
          
          const techLat = parseFloat(lastLocation.latitude);
          const techLng = parseFloat(lastLocation.longitude);
          
          // Calculate route distance using Mapbox (real driving distance, not straight-line)
          let distanceKm = calculateDistance(techLat, techLng, searchLat, searchLng); // Fallback
          let estimatedTimeMin = Math.round(distanceKm * 2); // Fallback: ~30km/h average
          
          try {
            const route = await calculateRoute([
              { latitude: techLat, longitude: techLng },
              { latitude: searchLat, longitude: searchLng }
            ]);
            if (route.success) {
              distanceKm = route.distanceKm; // Use real route distance
              estimatedTimeMin = route.durationMinutes;
            }
          } catch {
            // Keep fallback values
          }
          
          // Get today's activities to check availability
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const tomorrow = new Date(today);
          tomorrow.setDate(tomorrow.getDate() + 1);
          
          const allActivities = await storage.getActivitiesByDateRange(
            today,
            tomorrow
          );
          
          // Filter activities for this technician
          const activities = allActivities.filter(a => a.technicianId === technician.id);
          
          // Calculate free time windows (simplified)
          const busyHours = activities
            .filter(a => a.status !== "cancelado")
            .map(a => ({
              start: a.startTime,
              end: a.endTime,
            }));
          
          // Check if technician has availability (no activities or has gaps)
          const hasAvailability = busyHours.length === 0 || busyHours.length < 6; // Simplified check
          
          // Generate availability description
          let availabilityText = "";
          if (busyHours.length === 0) {
            availabilityText = "Livre o dia todo";
          } else if (busyHours.length < 3) {
            availabilityText = "Parcialmente livre";
          } else {
            availabilityText = "Agenda ocupada";
          }
          
          return {
            id: technician.id,
            name: technician.name,
            email: technician.email,
            team: technician.team,
            color: technician.color,
            distanceKm: Math.round(distanceKm * 10) / 10, // Round to 1 decimal
            estimatedTimeMin,
            currentLocation: {
              latitude: lastLocation.latitude,
              longitude: lastLocation.longitude,
              address: lastLocation.address,
            },
            availability: {
              hasAvailability,
              description: availabilityText,
              busySlots: busyHours.length,
            },
            lastUpdate: lastLocation.updatedAt,
          };
        })
      );
      
      // Filter out null results and sort by distance
      const validTechnicians = techniciansNearby
        .filter(t => t !== null)
        .sort((a, b) => a!.distanceKm - b!.distanceKm);
      
      // Disable cache to ensure fresh GPS data
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      
      res.json(validTechnicians);
    } catch (error: any) {
      console.error("Error finding nearby technicians:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get activities for map visualization (filtered by technicians and date range)
  app.get("/api/map/activities", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { technicianIds, startDate, endDate } = req.query;
      
      // Parse technician IDs (can be comma-separated or array)
      let techIds: string[] = [];
      if (technicianIds) {
        if (Array.isArray(technicianIds)) {
          techIds = technicianIds as string[];
        } else {
          techIds = (technicianIds as string).split(",").filter(Boolean);
        }
      }
      
      // Parse date range (default to today)
      const start = startDate ? new Date(startDate as string) : new Date();
      start.setHours(0, 0, 0, 0);
      
      const end = endDate ? new Date(endDate as string) : new Date();
      end.setHours(23, 59, 59, 999);
      
      // Get activities in date range (already includes client, technician, and activityType via JOIN)
      const allActivities = await storage.getActivitiesByDateRange(start, end);
      
      // Filter by technician IDs if specified
      const filteredActivities = techIds.length > 0
        ? allActivities.filter(a => techIds.includes(a.technicianId))
        : allActivities;
      
      // Map to the expected format using already-joined data
      const enrichedActivities = filteredActivities.map(activity => {
        return {
          id: activity.id,
          title: activity.title,
          clientName: activity.client?.name || activity.clientName || "Cliente Desconhecido",
          address: activity.address || "",
          latitude: parseFloat(activity.latitude || "0"),
          longitude: parseFloat(activity.longitude || "0"),
          scheduledDate: activity.scheduledDate,
          scheduledTime: activity.startTime,
          endTime: activity.endTime,
          status: activity.status,
          activityTypeName: activity.activityType?.name || "Atividade",
          // Local da visita: prioriza cidade/UF da própria atividade; cai para o
          // cadastro do cliente apenas quando a atividade não tiver.
          clientCity: (activity as any).city || activity.client?.city || null,
          clientState: (activity as any).state || activity.client?.state || null,
          technicianId: activity.technicianId,
          technicianName: activity.technician?.name || "Técnico",
          technicianColor: activity.technician?.color || "#3b82f6",
        };
      });

      // Quando solicitado (Painel TV), resolve cidade/UF faltante via reverse
      // geocoding das coordenadas da atividade, usando cache por coordenada.
      if (req.query.resolveCity === "1") {
        for (const act of enrichedActivities) {
          if ((act.clientCity && act.clientState) || !act.latitude || !act.longitude) continue;
          if (Math.abs(act.latitude) < 0.5 && Math.abs(act.longitude) < 0.5) continue;
          const key = `${act.latitude.toFixed(4)},${act.longitude.toFixed(4)}`;
          let resolved = reverseGeoCache.get(key);
          if (!resolved) {
            try {
              const geo = await reverseGeocodeDetailed(act.latitude, act.longitude);
              resolved = { city: geo.city, state: geo.state };
              reverseGeoCache.set(key, resolved);
            } catch {
              resolved = { city: null, state: null };
            }
          }
          act.clientCity = act.clientCity || resolved.city;
          act.clientState = act.clientState || resolved.state;
        }
      }

      res.json(enrichedActivities);
    } catch (error: any) {
      console.error("Error fetching map activities:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ===================================================================
  // Integração TOTVS Datasul (ERP Renner) — consulta de clientes
  // Autenticação: HTTP Basic Auth com login do Datasul (mesmo do ERP).
  // ===================================================================
  const DATASUL_DEFAULT_HOST = process.env.DATASUL_HOST || "erp.renner.com.br";
  const DATASUL_ALLOWED_HOSTS = [
    "erp.renner.com.br",
    "erp-homol.renner.com.br",
    "erp-desenv.renner.com.br",
  ];

  function resolveDatasulHost(host?: string): string {
    const h = (host || DATASUL_DEFAULT_HOST).trim().toLowerCase();
    return DATASUL_ALLOWED_HOSTS.includes(h) ? h : DATASUL_DEFAULT_HOST;
  }

  function datasulClientesUrl(host: string | undefined, params: string): string {
    return `https://${resolveDatasulHost(host)}/api/renner/rest/rcoa/ped/v1/rhpd4000api/clientes-lista/${params}`;
  }

  // Faz a requisição ao ERP com Basic Auth e timeout.
  async function datasulFetch(host: string | undefined, params: string, authHeader: string) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      return await fetch(datasulClientesUrl(host, params), {
        headers: { Authorization: authHeader, Accept: "application/json" },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  // Extrai o header Authorization Basic do request (enviado pelo cliente) ou
  // monta a partir de username/senha no corpo.
  function getDatasulAuthHeader(req: AuthRequest): string | null {
    const incoming = req.headers["x-datasul-auth"] || req.headers["authorization-datasul"];
    if (typeof incoming === "string" && incoming.toLowerCase().startsWith("basic ")) {
      return incoming;
    }
    const { username, password } = (req.body || {}) as { username?: string; password?: string };
    if (username && password) {
      return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
    }
    return null;
  }

  // Nota: A busca é feita diretamente no ERP, que já suporta busca em múltiplos campos.
  // Não usamos cache de clientes em memória para evitar carregar 30k+ registros.

  // Login/validação das credenciais do Datasul.
  // Não persiste a senha: apenas valida e devolve o token Basic para o cliente
  // reutilizar nas próximas chamadas (mantido em memória no navegador).
  app.post("/api/datasul/login", authMiddleware, roleMiddleware(["admin"]), async (req: AuthRequest, res) => {
    try {
      const { username, password, host, grupo } = (req.body || {}) as {
        username?: string;
        password?: string;
        host?: string;
        grupo?: string;
      };
      if (!username || !password) {
        return res.status(400).json({ error: "Informe usuário e senha do Datasul." });
      }

      const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
      const resolvedHost = resolveDatasulHost(host);

      // params: pagina,tamanho,busca,grupo,todos. Slot 5 (todos=1) ativa o
      // MODO CADASTRO COMPLETO (toda a base, sem teto de 400). Busca vazia;
      // grupo opcional (ex.: 71 = Coatings). Ex.: "1,50,,71,1" ou "1,50,,,1".
      const grupoTrim = (grupo || "").trim();
      const params = `1,50,,${grupoTrim ? encodeURIComponent(grupoTrim) : ""},1`;

      let erpRes: Response;
      try {
        erpRes = await datasulFetch(host, params, authHeader);
      } catch (err: any) {
        if (err?.name === "AbortError") {
          return res.status(504).json({ error: "Tempo de conexão esgotado ao acessar o Datasul." });
        }
        console.error("[Datasul] erro de rede no login:", err?.message);
        return res.status(502).json({ error: "Não foi possível conectar ao Datasul. Verifique a rede/host." });
      }

      if (erpRes.status === 401 || erpRes.status === 403) {
        return res.status(401).json({ error: "Usuário ou senha do Datasul inválidos." });
      }
      if (!erpRes.ok) {
        return res.status(502).json({ error: `Falha ao conectar no Datasul (HTTP ${erpRes.status}).` });
      }

      const data: any = await erpRes.json().catch(() => null);
      const meta = Array.isArray(data?.items)
        ? data.items.find((i: any) => i?._meta === "SIM")
        : null;

      return res.json({
        ok: true,
        host: resolvedHost,
        token: authHeader, // o cliente guarda em memória para as próximas chamadas
        grupo: grupoTrim || null,
        total: meta?.total ? parseInt(meta.total, 10) : null,
      });
    } catch (error: any) {
      console.error("[Datasul] login error:", error?.message);
      return res.status(500).json({ error: "Erro inesperado ao validar credenciais do Datasul." });
    }
  });

  // Lista de clientes do Datasul com busca expandida.
  // Suporta grupos 71 (Coatings) e 88 (Alumínio).
  // Busca é feita DIRETAMENTE no ERP (sem cache de clientes em memória).
  // Auth: header "x-datasul-auth: Basic <base64>" (token devolvido no login).
  app.get("/api/datasul/clientes", authMiddleware, roleMiddleware(["admin"]), async (req: AuthRequest, res) => {
    try {
      const authHeader = getDatasulAuthHeader(req);
      if (!authHeader) {
        return res.status(401).json({ error: "Sessão do Datasul não encontrada. Conecte-se novamente." });
      }

      const pagina = parseInt((req.query.pagina as string) || "1", 10) || 1;
      const tamanho = Math.min(parseInt((req.query.tamanho as string) || "50", 10) || 50, 200);
      const termo = ((req.query.busca as string) || "").trim();
      let grupoReq = ((req.query.grupo as string) || "").trim();
      const host = req.query.host as string | undefined;

      // Se nenhum grupo foi especificado e há um termo de busca, busca em AMBOS os grupos (71 e 88)
      // concatenando os resultados (sem paginação entre grupos)
      if (termo.length > 0 && !grupoReq) {
        // Busca em paralelo nos dois grupos
        const params71 = [
          String(pagina),
          String(tamanho),
          encodeURIComponent(termo),
          encodeURIComponent("71"),
          "1",
        ].join(",");

        const params88 = [
          String(pagina),
          String(tamanho),
          encodeURIComponent(termo),
          encodeURIComponent("88"),
          "1",
        ].join(",");

        let erpRes71: Response;
        let erpRes88: Response;
        
        try {
          [erpRes71, erpRes88] = await Promise.all([
            datasulFetch(host, params71, authHeader),
            datasulFetch(host, params88, authHeader),
          ]);
        } catch (err: any) {
          if (err?.name === "AbortError") {
            return res.status(504).json({ error: "Tempo de conexão esgotado ao acessar o Datasul." });
          }
          return res.status(502).json({ error: "Não foi possível conectar ao Datasul." });
        }

        // Processa resposta do grupo 71
        if (!erpRes71.ok) {
          return res.status(502).json({ error: `Falha ao consultar clientes grupo 71 (HTTP ${erpRes71.status}).` });
        }

        const data71: any = await erpRes71.json().catch(() => null);
        const items71: any[] = Array.isArray(data71?.items) ? data71.items : [];
        const clientes71 = items71.filter((i) => i?._meta !== "SIM");
        const meta71 = items71.find((i) => i?._meta === "SIM");

        // Processa resposta do grupo 88
        if (!erpRes88.ok) {
          console.warn(`[Datasul] Aviso: grupo 88 retornou HTTP ${erpRes88.status}, usando apenas grupo 71`);
          return res.json({
            meta: meta71
              ? {
                  total: meta71.total ? parseInt(meta71.total, 10) : null,
                  pagina: meta71.pagina ? parseInt(meta71.pagina, 10) : pagina,
                  tamPag: meta71["tam-pag"] ? parseInt(meta71["tam-pag"], 10) : tamanho,
                  paginas: meta71.paginas ? parseInt(meta71.paginas, 10) : null,
                  grupo: "71",
                }
              : { total: null, pagina, tamPag: tamanho, paginas: null, grupo: "71" },
            clientes: clientes71,
          });
        }

        const data88: any = await erpRes88.json().catch(() => null);
        const items88: any[] = Array.isArray(data88?.items) ? data88.items : [];
        const clientes88 = items88.filter((i) => i?._meta !== "SIM");
        const meta88 = items88.find((i) => i?._meta === "SIM");

        // Merge dos resultados
        const allClientes = [...clientes71, ...clientes88];
        const totalCombined = (meta71?.total ? parseInt(meta71.total, 10) : 0) +
                              (meta88?.total ? parseInt(meta88.total, 10) : 0);

        return res.json({
          meta: {
            total: totalCombined,
            pagina,
            tamPag: tamanho,
            paginas: Math.ceil(totalCombined / tamanho),
            grupo: "71,88", // Indica que buscou em ambos
          },
          clientes: allClientes,
        });
      }

      // Fallback: busca em um grupo específico (ou sem termo)
      const params = [
        String(pagina),
        String(tamanho),
        encodeURIComponent(termo),
        encodeURIComponent(grupoReq || "71"), // Padrão: grupo 71
        "1",
      ].join(",");

      let erpRes: Response;
      try {
        erpRes = await datasulFetch(host, params, authHeader);
      } catch (err: any) {
        if (err?.name === "AbortError") {
          return res.status(504).json({ error: "Tempo de conexão esgotado ao acessar o Datasul." });
        }
        return res.status(502).json({ error: "Não foi possível conectar ao Datasul." });
      }

      if (erpRes.status === 401 || erpRes.status === 403) {
        return res.status(401).json({ error: "Sessão do Datasul expirada. Conecte-se novamente." });
      }
      if (!erpRes.ok) {
        return res.status(502).json({ error: `Falha ao consultar clientes (HTTP ${erpRes.status}).` });
      }

      const data: any = await erpRes.json().catch(() => null);
      const items: any[] = Array.isArray(data?.items) ? data.items : [];
      const meta = items.find((i) => i?._meta === "SIM") || null;
      const clientes = items.filter((i) => i?._meta !== "SIM");

      return res.json({
        meta: meta
          ? {
              total: meta.total ? parseInt(meta.total, 10) : null,
              pagina: meta.pagina ? parseInt(meta.pagina, 10) : pagina,
              tamPag: meta["tam-pag"] ? parseInt(meta["tam-pag"], 10) : tamanho,
              paginas: meta.paginas ? parseInt(meta.paginas, 10) : null,
              grupo: meta["cod-gr-cli"] ?? grupoReq ?? "71",
            }
          : { total: null, pagina, tamPag: tamanho, paginas: null, grupo: grupoReq || "71" },
        clientes,
      });
    } catch (error: any) {
      console.error("[Datasul] clientes error:", error?.message);
      return res.status(500).json({ error: "Erro inesperado ao consultar clientes do Datasul." });
    }
  });

  // Importa TODOS os clientes do Datasul (percorre as páginas) para o cadastro
  // do ASTEC. Faz upsert usando o código do cliente (cod-emitente) como chave.
  app.post("/api/datasul/import", authMiddleware, roleMiddleware(["admin"]), async (req: AuthRequest, res) => {
    try {
      const authHeader = getDatasulAuthHeader(req);
      if (!authHeader) {
        return res.status(401).json({ error: "Sessão do Datasul não encontrada. Conecte-se novamente." });
      }

      const { host, grupo } = (req.body || {}) as { host?: string; grupo?: string };
      const grupoTrim = (grupo || "").trim();
      const PAGE = 200;

      // Carrega clientes existentes para dedupe (por código interno e por CNPJ).
      const existing = await storage.getAllClients();
      const byInternal = new Map<string, typeof existing[number]>();
      const byCnpj = new Map<string, typeof existing[number]>();
      const onlyDigits = (s?: string | null) => (s || "").replace(/\D/g, "");
      for (const c of existing) {
        if (c.internalCode) byInternal.set(c.internalCode.trim(), c);
        const dig = onlyDigits(c.cnpj);
        if (dig) byCnpj.set(dig, c);
      }

      let created = 0;
      let updated = 0;
      let processed = 0;
      let pagina = 1;
      const MAX_PAGINAS = 2000; // trava de segurança

      // Com o MODO CADASTRO COMPLETO (todos=1) o meta.total/paginas vem real,
      // mas mantemos a paginação até uma página vir vazia (ou menor que o tamanho)
      // por robustez.
      while (pagina <= MAX_PAGINAS) {
        // path: pagina,tamanho,busca,grupo,todos (todos=1 => base completa)
        const params = [
          String(pagina),
          String(PAGE),
          "",
          grupoTrim ? encodeURIComponent(grupoTrim) : "",
          "1",
        ].join(",");

        const erpRes = await datasulFetch(host, params, authHeader);
        if (erpRes.status === 401 || erpRes.status === 403) {
          return res.status(401).json({ error: "Sessão do Datasul expirada. Conecte-se novamente." });
        }
        if (!erpRes.ok) {
          return res.status(502).json({ error: `Falha ao consultar clientes (HTTP ${erpRes.status}).` });
        }

        const data: any = await erpRes.json().catch(() => null);
        const items: any[] = Array.isArray(data?.items) ? data.items : [];
        const lote = items.filter((i) => i?._meta !== "SIM");

        if (lote.length === 0) break;

        for (const c of lote) {
          processed++;
          const internalCode = String(c["cod-emitente"] || "").trim();
          const companyName = String(c["nome-emit"] || c["nome-abrev"] || "").trim();
          if (!companyName) continue; // sem nome não cadastra

          const cnpjDigits = onlyDigits(c["cgc"]);
          const payload = {
            companyName,
            cnpj: c["cgc"] || null,
            internalCode: internalCode || null,
            city: c["cidade"] || null,
            state: c["estado"] || null,
            contactPhone: c["telefone"] || null,
            contactEmail: c["e-mail"] || null,
            country: "Brasil",
            active: true,
          };

          // Procura existente por código interno, depois por CNPJ.
          const match =
            (internalCode && byInternal.get(internalCode)) ||
            (cnpjDigits && byCnpj.get(cnpjDigits)) ||
            null;

          if (match) {
            await storage.updateClient(match.id, payload);
            updated++;
          } else {
            const novo = await storage.createClient(payload as any);
            created++;
            if (internalCode) byInternal.set(internalCode, novo);
            if (cnpjDigits) byCnpj.set(cnpjDigits, novo);
          }
        }

        // Se a página veio com menos registros que o tamanho, é a última.
        if (lote.length < PAGE) break;
        pagina++;
      }

      console.log(`[Datasul] import concluído: processados=${processed} criados=${created} atualizados=${updated}`);
      return res.json({ ok: true, processed, created, updated });
    } catch (error: any) {
      console.error("[Datasul] import error:", error?.message);
      return res.status(500).json({ error: "Erro ao importar clientes do Datasul." });
    }
  });

  // Importa uma lista específica de clientes do Datasul (ex.: resultados de uma
  // busca), permitindo trazer clientes que estão além do teto de 400 da listagem.
  app.post("/api/datasul/import-clientes", authMiddleware, roleMiddleware(["admin"]), async (req: AuthRequest, res) => {
    try {
      const { clientes } = (req.body || {}) as { clientes?: any[] };
      if (!Array.isArray(clientes) || clientes.length === 0) {
        return res.status(400).json({ error: "Nenhum cliente informado para importar." });
      }

      const existing = await storage.getAllClients();
      const byInternal = new Map<string, typeof existing[number]>();
      const byCnpj = new Map<string, typeof existing[number]>();
      const onlyDigits = (s?: string | null) => (s || "").replace(/\D/g, "");
      for (const c of existing) {
        if (c.internalCode) byInternal.set(c.internalCode.trim(), c);
        const dig = onlyDigits(c.cnpj);
        if (dig) byCnpj.set(dig, c);
      }

      let created = 0;
      let updated = 0;
      let processed = 0;

      for (const c of clientes) {
        processed++;
        const internalCode = String(c["cod-emitente"] || "").trim();
        const companyName = String(c["nome-emit"] || c["nome-abrev"] || "").trim();
        if (!companyName) continue;

        const cnpjDigits = onlyDigits(c["cgc"]);
        const payload = {
          companyName,
          cnpj: c["cgc"] || null,
          internalCode: internalCode || null,
          city: c["cidade"] || null,
          state: c["estado"] || null,
          contactPhone: c["telefone"] || null,
          contactEmail: c["e-mail"] || null,
          country: "Brasil",
          active: true,
        };

        const match =
          (internalCode && byInternal.get(internalCode)) ||
          (cnpjDigits && byCnpj.get(cnpjDigits)) ||
          null;

        if (match) {
          await storage.updateClient(match.id, payload);
          updated++;
        } else {
          const novo = await storage.createClient(payload as any);
          created++;
          if (internalCode) byInternal.set(internalCode, novo);
          if (cnpjDigits) byCnpj.set(cnpjDigits, novo);
        }
      }

      return res.json({ ok: true, processed, created, updated });
    } catch (error: any) {
      console.error("[Datasul] import-clientes error:", error?.message);
      return res.status(500).json({ error: "Erro ao importar clientes selecionados." });
    }
  });

  // Enhanced nearby technicians with location source option
  app.post("/api/technicians/nearby/search", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { 
        destinationLat, 
        destinationLng, 
        destinationCep,
        technicianIds, 
        locationSource, // "gps" | "base" | "activity"
        baseCity,
        dateRange 
      } = req.body;
      
      // Geocode CEP if provided instead of coordinates
      let searchLat = destinationLat;
      let searchLng = destinationLng;
      
      if (destinationCep && (!searchLat || !searchLng)) {
        const geocoded = await geocodeAddress(`${destinationCep}, Brasil`);
        if (geocoded.found) {
          searchLat = geocoded.latitude;
          searchLng = geocoded.longitude;
        } else {
          return res.status(400).json({ error: "CEP não encontrado" });
        }
      }
      
      if (!searchLat || !searchLng) {
        return res.status(400).json({ error: "Coordenadas de destino são obrigatórias" });
      }
      
      const { calculateDistance } = await import("./utils/geo");
      const { calculateRoute } = await import("./services/routing");
      
      // Get all technicians
      const allTechnicians = await storage.getAllTechnicians();
      
      // Filter by technician IDs if provided
      let filteredTechnicians = technicianIds && technicianIds.length > 0
        ? allTechnicians.filter(t => technicianIds.includes(t.id))
        : allTechnicians;
      
      // Filter by base city if provided
      if (baseCity) {
        filteredTechnicians = filteredTechnicians.filter(t => 
          t.baseCity?.toLowerCase().includes(baseCity.toLowerCase())
        );
      }
      
      // Filter to show only field technicians (assistente role)
      const fieldTechnicians = await Promise.all(
        filteredTechnicians.map(async (technician) => {
          const user = await storage.getUser(technician.userId);
          return { technician, user };
        })
      );
      
      const assistenteTechnicians = fieldTechnicians
        .filter(({ user }) => user?.role === "assistente")
        .map(({ technician }) => technician);
      
      // Get activities for the date range (for "activity" location source)
      let activitiesByTechnician: Map<string, any[]> = new Map();
      if (locationSource === "activity" && dateRange) {
        // Parse dates ensuring we get local midnight, not UTC
        const startParts = dateRange.start.split('-').map(Number);
        const endParts = dateRange.end.split('-').map(Number);
        
        // Start date: beginning of day (00:00:00)
        const start = new Date(startParts[0], startParts[1] - 1, startParts[2], 0, 0, 0, 0);
        // End date: end of day (23:59:59.999) to include all activities on that day
        const end = new Date(endParts[0], endParts[1] - 1, endParts[2], 23, 59, 59, 999);
        
        console.log(`[NearbySearch] Date range: ${start.toISOString()} to ${end.toISOString()}`);
        
        const activities = await storage.getActivitiesByDateRange(start, end);
        
        // Get activity types for enrichment
        const allActivityTypes = await storage.getAllActivityTypes();
        const activityTypesMap = new Map(allActivityTypes.map(t => [t.id, t]));
        
        for (const activity of activities) {
          if (!activitiesByTechnician.has(activity.technicianId)) {
            activitiesByTechnician.set(activity.technicianId, []);
          }
          // Enrich activity with type name
          const enrichedActivity = {
            ...activity,
            activityTypeName: activity.activityTypeId 
              ? activityTypesMap.get(activity.activityTypeId)?.name 
              : null
          };
          activitiesByTechnician.get(activity.technicianId)!.push(enrichedActivity);
        }
      }
      
      // Calculate distances for each technician
      const techniciansWithDistance = await Promise.all(
        assistenteTechnicians.map(async (technician) => {
          let techLat: number | null = null;
          let techLng: number | null = null;
          let locationDescription = "";
          let allActivitiesWithDistance: any[] = [];
          let closestActivity: any = null;
          
          if (locationSource === "base") {
            // Use technician's base location
            const baseLat = technician.baseLatitude ? parseFloat(technician.baseLatitude) : null;
            const baseLng = technician.baseLongitude ? parseFloat(technician.baseLongitude) : null;
            
            if (baseLat && baseLng && !isNaN(baseLat) && !isNaN(baseLng)) {
              techLat = baseLat;
              techLng = baseLng;
              locationDescription = `Base: ${technician.baseCity || technician.baseAddress || "Configurada"}`;
            }
          } else if (locationSource === "activity") {
            // Calculate distance for ALL activities in the period
            const techActivities = activitiesByTechnician.get(technician.id) || [];
            const validActivities = techActivities.filter(a => 
              a.latitude && a.longitude && a.status !== "cancelado"
            );
            
            if (validActivities.length === 0) {
              return null; // No activities in the period
            }
            
            // Calculate distance and time for EACH activity
            const activitiesWithRouteInfo = await Promise.all(
              validActivities.map(async (activity) => {
                const actLat = parseFloat(activity.latitude);
                const actLng = parseFloat(activity.longitude);
                
                if (isNaN(actLat) || isNaN(actLng)) {
                  return null;
                }
                
                // Calculate route distance using Mapbox (not straight-line)
                let distanceKm = calculateDistance(actLat, actLng, searchLat, searchLng); // Fallback
                let estimatedTimeMin = Math.round(distanceKm * 2); // Fallback
                
                try {
                  const route = await calculateRoute([
                    { latitude: actLat, longitude: actLng },
                    { latitude: searchLat, longitude: searchLng }
                  ]);
                  if (route.success) {
                    distanceKm = route.distanceKm; // Use real route distance
                    estimatedTimeMin = route.durationMinutes;
                  }
                } catch {}
                
                // Format date as DD/MM/YYYY
                const activityDate = new Date(activity.scheduledDate);
                const formattedDate = `${String(activityDate.getDate()).padStart(2, '0')}/${String(activityDate.getMonth() + 1).padStart(2, '0')}/${activityDate.getFullYear()}`;
                const formattedTime = activity.startTime ? activity.startTime.slice(0, 5) : "";
                
                return {
                  id: activity.id,
                  scheduledDate: activity.scheduledDate,
                  formattedDate,
                  startTime: formattedTime,
                  endTime: activity.endTime ? activity.endTime.slice(0, 5) : "",
                  clientName: activity.clientName || activity.description || "Atividade",
                  clientId: activity.clientId,
                  address: activity.address || "",
                  city: activity.city || "",
                  activityType: activity.activityTypeName || activity.description || "",
                  status: activity.status,
                  latitude: actLat,
                  longitude: actLng,
                  distanceKm: Math.round(distanceKm * 10) / 10,
                  estimatedTimeMin,
                };
              })
            );
            
            // Filter nulls and sort by distance (closest first)
            allActivitiesWithDistance = activitiesWithRouteInfo
              .filter(a => a !== null)
              .sort((a, b) => a!.distanceKm - b!.distanceKm) as any[];
            
            if (allActivitiesWithDistance.length === 0) {
              return null;
            }
            
            // The closest activity determines the technician's position
            closestActivity = allActivitiesWithDistance[0];
            techLat = closestActivity.latitude;
            techLng = closestActivity.longitude;
            locationDescription = `Atividade mais próxima: ${closestActivity.clientName} (${closestActivity.formattedDate} às ${closestActivity.startTime})`;
          } else {
            // Default: Use last GPS location
            const lastLocation = await storage.getLastTechnicianLocation(technician.id);
            const LOCATION_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 hours
            
            if (lastLocation) {
              const isLocationStale = (Date.now() - new Date(lastLocation.updatedAt).getTime()) > LOCATION_TIMEOUT_MS;
              if (!isLocationStale) {
                techLat = parseFloat(lastLocation.latitude);
                techLng = parseFloat(lastLocation.longitude);
                locationDescription = lastLocation.address || "Localização GPS";
              }
            }
          }
          
          if (!techLat || !techLng || isNaN(techLat) || isNaN(techLng)) {
            return null;
          }
          
          // Calculate overall distance using route (for non-activity modes)
          let distanceKm = closestActivity?.distanceKm || calculateDistance(techLat, techLng, searchLat, searchLng);
          let estimatedTimeMin = closestActivity?.estimatedTimeMin || Math.round(distanceKm * 2);
          
          if (!closestActivity) {
            // Calculate route distance and time for non-activity modes (GPS/Base)
            try {
              const route = await calculateRoute([
                { latitude: techLat, longitude: techLng },
                { latitude: searchLat, longitude: searchLng }
              ]);
              if (route.success) {
                distanceKm = route.distanceKm; // Use real route distance
                estimatedTimeMin = route.durationMinutes;
              }
            } catch {}
          }
          
          return {
            id: technician.id,
            name: technician.name,
            email: technician.email,
            team: technician.team,
            color: technician.color,
            baseCity: technician.baseCity,
            distanceKm: Math.round(distanceKm * 10) / 10,
            estimatedTimeMin,
            location: {
              latitude: techLat,
              longitude: techLng,
              description: locationDescription,
            },
            locationSource,
            // New: Include all activities with distance info when searching by activity
            closestActivity: closestActivity || null,
            allActivities: allActivitiesWithDistance.length > 0 ? allActivitiesWithDistance : undefined,
            totalActivitiesInPeriod: allActivitiesWithDistance.length,
          };
        })
      );
      
      // Filter nulls and sort by distance (closest activity)
      const validTechnicians = techniciansWithDistance
        .filter(t => t !== null)
        .sort((a, b) => a!.distanceKm - b!.distanceKm);
      
      res.json({
        destination: { lat: searchLat, lng: searchLng },
        technicians: validTechnicians,
      });
    } catch (error: any) {
      console.error("Error in nearby technicians search:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get unique base cities for filtering
  app.get("/api/technicians/bases", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const allTechnicians = await storage.getAllTechnicians();
      const baseCitiesSet = new Set<string>();
      allTechnicians.forEach(t => {
        if (t.baseCity) baseCitiesSet.add(t.baseCity);
      });
      const baseCities = Array.from(baseCitiesSet).sort();
      
      res.json(baseCities);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/technicians/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const technician = await storage.getTechnician(req.params.id);
      if (!technician) {
        return res.status(404).json({ error: "Técnico não encontrado." });
      }
      res.json(technician);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/technicians", authMiddleware, roleMiddleware(["admin"]), async (req: AuthRequest, res) => {
    try {
      const data = insertTechnicianSchema.parse(req.body);
      const technician = await storage.createTechnician(data);
      invalidateTechniciansCache();
      res.status(201).json(technician);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.put("/api/technicians/:id", authMiddleware, roleMiddleware(["admin"]), async (req: AuthRequest, res) => {
    try {
      const data = updateUserAndTechnicianSchema.parse(req.body);
      const result = await storage.updateUserAndTechnician(req.params.id, data);
      invalidateTechniciansCache();
      res.json(result.technician);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Minimal endpoint just for the Datasul profile (tiny body avoids corporate WAF blocking large PUTs).
  // Uses POST because the corporate WAF blocks PUT/PATCH methods.
  app.post("/api/technicians/:id/datasul-profile", authMiddleware, roleMiddleware(["admin"]), async (req: AuthRequest, res) => {
    try {
      const raw = req.body?.datasulUsername;
      const datasulUsername = raw === undefined || raw === null || raw === "" ? null : String(raw).trim();
      const user = await storage.updateTechnicianDatasulProfile(req.params.id, datasulUsername);
      invalidateTechniciansCache();
      res.json({ datasulUsername: user.datasulUsername });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // POST alias for updating a technician (corporate WAF blocks PUT), same logic as the PUT above.
  app.post("/api/technicians/:id/update", authMiddleware, roleMiddleware(["admin"]), async (req: AuthRequest, res) => {
    try {
      const data = updateUserAndTechnicianSchema.parse(req.body);
      const result = await storage.updateUserAndTechnician(req.params.id, data);
      invalidateTechniciansCache();
      res.json(result.technician);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/technicians/:id", authMiddleware, roleMiddleware(["admin"]), async (req: AuthRequest, res) => {
    try {
      const activitiesCount = await storage.countActivitiesByTechnicianId(req.params.id);
      
      if (activitiesCount > 0) {
        console.log(`Deleting technician ${req.params.id} with ${activitiesCount} activities (cascade delete)`);
      }
      
      await storage.deleteTechnician(req.params.id);
      invalidateTechniciansCache();
      res.status(204).send();
    } catch (error: any) {
      console.error("Error deleting technician:", error);
      
      // Verificar se é erro de constraint de foreign key (registros de horas vinculados)
      if (error.code === '23503' && error.table === 'time_entries') {
        return res.status(400).json({ 
          error: "Não é possível excluir este técnico porque existem registros de horas vinculados às suas atividades. Para excluir, primeiro você precisa remover os registros de horas associados."
        });
      }
      
      res.status(400).json({ error: error.message });
    }
  });

  // Note: Clients routes moved to M4 section below (with pagination support)

  app.put("/api/sites/:id", authMiddleware, roleMiddleware(["admin"]), async (req: AuthRequest, res) => {
    try {
      const data = updateClientSiteSchema.parse(req.body);
      const site = await storage.updateClientSite(req.params.id, data);
      res.json(site);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/sites/:id", authMiddleware, roleMiddleware(["admin"]), async (req: AuthRequest, res) => {
    try {
      await storage.deleteClientSite(req.params.id);
      res.status(204).send();
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Activity types routes
  app.get("/api/activity-types", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const types = await storage.getAllActivityTypes();
      res.json(types);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Endpoint hierárquico para tipos de atividade com subcategorias
  app.get("/api/activity-types/tree", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const types = await storage.getAllActivityTypes();
      
      // Separar categorias principais e subcategorias
      const mainCategories = types.filter((t: any) => !t.parentId);
      const subcategories = types.filter((t: any) => t.parentId);
      
      // Montar estrutura hierárquica
      const tree = mainCategories.map((main: any) => ({
        ...main,
        children: subcategories.filter((sub: any) => sub.parentId === main.id)
      }));
      
      res.json(tree);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/activity-types", authMiddleware, roleMiddleware(["admin"]), async (req: AuthRequest, res) => {
    try {
      const data = insertActivityTypeSchema.parse(req.body);
      const type = await storage.createActivityType(data);
      res.status(201).json(type);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.put("/api/activity-types/:id", authMiddleware, roleMiddleware(["admin"]), async (req: AuthRequest, res) => {
    try {
      const data = updateActivityTypeSchema.parse(req.body);
      const type = await storage.updateActivityType(req.params.id, data);
      res.json(type);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/activity-types/:id", authMiddleware, roleMiddleware(["admin"]), async (req: AuthRequest, res) => {
    try {
      await storage.deleteActivityType(req.params.id);
      res.status(204).send();
    } catch (error: any) {
      // Check if it's a foreign key constraint error
      if (error.message?.includes('foreign key constraint') || error.code === '23503') {
        return res.status(400).json({ 
          error: "Não é possível excluir este tipo de atividade porque existem atividades vinculadas a ele. Remova ou altere as atividades primeiro." 
        });
      }
      res.status(400).json({ error: error.message });
    }
  });

  // Segments routes
  app.get("/api/segments", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const segments = await storage.getAllSegments();
      res.json(segments);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/segments", authMiddleware, roleMiddleware(["admin"]), async (req: AuthRequest, res) => {
    try {
      const data = insertSegmentSchema.parse(req.body);
      const segment = await storage.createSegment(data);
      res.status(201).json(segment);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.put("/api/segments/:id", authMiddleware, roleMiddleware(["admin"]), async (req: AuthRequest, res) => {
    try {
      const data = updateSegmentSchema.parse(req.body);
      const segment = await storage.updateSegment(req.params.id, data);
      res.json(segment);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/segments/:id", authMiddleware, roleMiddleware(["admin"]), async (req: AuthRequest, res) => {
    try {
      await storage.deleteSegment(req.params.id);
      res.status(204).send();
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Regions routes
  app.get("/api/regions", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const regions = await storage.getAllRegions();
      res.json(regions);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/regions", authMiddleware, roleMiddleware(["admin"]), async (req: AuthRequest, res) => {
    try {
      const data = insertRegionSchema.parse(req.body);
      const region = await storage.createRegion(data);
      res.status(201).json(region);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.put("/api/regions/:id", authMiddleware, roleMiddleware(["admin"]), async (req: AuthRequest, res) => {
    try {
      const data = updateRegionSchema.parse(req.body);
      const region = await storage.updateRegion(req.params.id, data);
      res.json(region);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/regions/:id", authMiddleware, roleMiddleware(["admin"]), async (req: AuthRequest, res) => {
    try {
      await storage.deleteRegion(req.params.id);
      res.status(204).send();
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Activities routes
  app.get("/api/activities", authMiddleware, agendaScopeMiddleware, async (req: AuthRequest, res) => {
    try {
      const { startDate, endDate, technicianId, userId } = req.query;
      
      let activities: any[] = [];
      
      // If userId is set by agendaScopeMiddleware (for assistente role), use it
      if (userId) {
        // Find technician by userId
        const technicians = await storage.getAllTechnicians();
        const technician = technicians.find(t => t.userId === userId);
        if (technician) {
          activities = await storage.getActivitiesByTechnicianId(technician.id);
        } else {
          activities = [];
        }
      } else if (startDate && endDate) {
        activities = await storage.getActivitiesByDateRange(
          new Date(startDate as string),
          new Date(endDate as string)
        );
      } else if (technicianId) {
        activities = await storage.getActivitiesByTechnicianId(technicianId as string);
      } else {
        // Default to current month
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        // Importante: incluir o último dia do mês inteiro (até 23:59:59.999),
        // senão atividades do último dia após a meia-noite ficam de fora.
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        activities = await storage.getActivitiesByDateRange(startOfMonth, endOfMonth);
      }
      
      res.json(activities);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/activities/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const activity = await storage.getActivity(req.params.id);
      if (!activity) {
        return res.status(404).json({ error: "Activity not found" });
      }
      res.json(activity);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/activities", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const data = insertActivitySchema.parse(req.body);
      
      // Helper function to extract date string (YYYY-MM-DD) from various formats
      const getDateString = (date: any): string => {
        if (!date) return '';
        if (date instanceof Date) {
          return date.toISOString().split('T')[0];
        }
        const dateStr = String(date);
        return dateStr.split('T')[0].split(' ')[0];
      };
      
      // Validate that end time is after start time
      if (data.startTime && data.endTime && data.endTime <= data.startTime) {
        return res.status(400).json({
          error: `Horário inválido: o horário de término (${data.endTime}) deve ser posterior ao horário de início (${data.startTime})`
        });
      }

      // Bloqueio de agenda:
      //  - Férias: bloqueio RÍGIDO (não permite agendar, sem override).
      //  - Compromisso: aviso (pode confirmar com ignoreBlock=true).
      const ignoreBlock = req.body?.ignoreBlock === true;
      if (data.technicianId && data.scheduledDate) {
        const bStart = new Date(data.scheduledDate);
        bStart.setHours(0, 0, 0, 0);
        const bEnd = data.endDate ? new Date(data.endDate) : new Date(data.scheduledDate);
        bEnd.setHours(23, 59, 59, 999);
        const overlapBlocks = await storage.getAgendaBlocksByDateRange(bStart, bEnd);
        const techBlocks = overlapBlocks.filter((b) => b.technicianId === data.technicianId);
        const toMin = (t?: string | null) => {
          if (!t) return null;
          const m = t.match(/^(\d{1,2}):(\d{2})/);
          return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
        };

        // Férias: bloqueio rígido (mesmo com ignoreBlock).
        const feriasHit = techBlocks.find((b) => b.blockType === "ferias");
        if (feriasHit) {
          return res.status(409).json({
            code: "AGENDA_BLOCK_FERIAS",
            error: "O técnico está de férias neste período. Não é possível agendar.",
          });
        }

        // Compromisso: aviso (pode ser ignorado).
        if (!ignoreBlock) {
          const compHit = techBlocks.find((b) => {
            if (b.blockType !== "compromisso") return false;
            const bs = toMin(b.startTime);
            const be = toMin(b.endTime);
            const as = toMin(data.startTime);
            const ae = toMin(data.endTime || data.startTime);
            if (bs === null || be === null || as === null || ae === null) return true;
            return as < be && ae > bs;
          });
          if (compHit) {
            return res.status(409).json({
              code: "AGENDA_BLOCK",
              blockType: "compromisso",
              error: "O técnico tem um compromisso pessoal neste horário.",
            });
          }
        }
      }
      
      // Check for scheduling conflicts (aplica-se a todos os tipos de atividade)
      if (data.technicianId && data.scheduledDate && data.startTime) {
        {
          const scheduledDate = new Date(data.scheduledDate);
          const newScheduledDateStr = getDateString(data.scheduledDate);
          const newEndDateStr = data.endDate ? getDateString(data.endDate) : newScheduledDateStr;
          
          const rangeStart = new Date(scheduledDate);
          rangeStart.setHours(0, 0, 0, 0);
          const rangeEnd = data.endDate ? new Date(data.endDate) : new Date(scheduledDate);
          rangeEnd.setHours(23, 59, 59, 999);
          
          const existingActivities = await storage.getActivitiesByDateRange(rangeStart, rangeEnd);
          const technicianActivities = existingActivities.filter(
            a => a.technicianId === data.technicianId && 
                 a.status !== "cancelado"
          );
          
          const newStart = data.startTime;
          const newEnd = data.endTime || data.startTime;
          
          const getDaysInRange = (start: string, end: string): string[] => {
            const days: string[] = [];
            const d = new Date(start + "T00:00:00");
            const last = new Date(end + "T00:00:00");
            while (d <= last) {
              days.push(d.toISOString().split('T')[0]);
              d.setDate(d.getDate() + 1);
            }
            return days;
          };
          
          const newDays = getDaysInRange(newScheduledDateStr, newEndDateStr);
          
          for (const existing of technicianActivities) {
            const existingStart = existing.startTime;
            const existingEnd = existing.endTime || existing.startTime;
            const existingDateStr = getDateString(existing.scheduledDate);
            const existingEndDateStr = existing.endDate ? getDateString(existing.endDate) : existingDateStr;
            const existingDays = getDaysInRange(existingDateStr, existingEndDateStr);
            
            const overlappingDays = newDays.filter(d => existingDays.includes(d));
            if (overlappingDays.length === 0) continue;
            
            const hasTimeOverlap = (newStart < existingEnd && newEnd > existingStart) ||
                              (newStart === existingStart);
            
            if (hasTimeOverlap) {
              const conflictDay = overlappingDays[0];
              const [cy, cm, cd] = conflictDay.split('-');
              const formattedDate = `${cd}/${cm}/${cy}`;
              return res.status(409).json({ 
                error: `Conflito de horário: já existe uma atividade agendada para este técnico em ${formattedDate} das ${existingStart} às ${existingEnd} (${existing.clientName || existing.description || 'Atividade existente'})` 
              });
            }
          }
        }
      }
      
      // Auto-geocode if address is provided but no coordinates
      if (!data.latitude && !data.longitude && data.address) {
        const fullAddress = [
          data.address,
          data.numero,
          data.bairro,
          data.city,
          data.state,
          data.country || "Brasil"
        ].filter(Boolean).join(", ");
        
        try {
          const geocoded = await geocodeAddress(fullAddress);
          if (geocoded.found) {
            (data as any).latitude = geocoded.latitude.toString();
            (data as any).longitude = geocoded.longitude.toString();
            console.log(`📍 Auto-geocoded activity address: ${fullAddress} -> (${geocoded.latitude}, ${geocoded.longitude})`);
          }
        } catch (geoError) {
          console.error("Failed to geocode activity address:", geoError);
        }
      }
      
      const activity = await storage.createActivity(data);
      
      // Create audit log
      await storage.createAuditLog({
        userId: req.user!.userId,
        action: "CREATE",
        entityType: "activity",
        entityId: activity.id,
        changes: JSON.stringify(data),
      });
      
      // Send notification to technician (non-blocking)
      const { sendActivityCreatedNotification } = await import("./services/notifications");
      sendActivityCreatedNotification(activity.id, req.user!.userId).catch(err => {
        console.error("Failed to send activity creation notification:", err);
      });
      
      // Broadcast activity creation to all connected clients
      broadcastActivityUpdate(activity, "created");
      
      res.status(201).json(activity);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.put("/api/activities/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      console.log("[PUT /api/activities/:id] Request body:", JSON.stringify(req.body, null, 2));
      const data = updateActivitySchema.parse(req.body);
      console.log("[PUT /api/activities/:id] Parsed data:", JSON.stringify(data, null, 2));
      const activityId = req.params.id;
      
      // Helper function to extract date string (YYYY-MM-DD) from various formats
      const getDateString = (date: any): string => {
        if (!date) return '';
        if (date instanceof Date) {
          return date.toISOString().split('T')[0];
        }
        const dateStr = String(date);
        return dateStr.split('T')[0].split(' ')[0];
      };
      
      // Check for scheduling conflicts when updating date/time
      const currentActivity = await storage.getActivity(activityId);
      if (currentActivity) {
        const technicianId = data.technicianId || currentActivity.technicianId;
        const scheduledDateInput = data.scheduledDate || currentActivity.scheduledDate;
        const startTime = data.startTime || currentActivity.startTime;
        const endTime = data.endTime || currentActivity.endTime;
        const endDateInput = data.endDate !== undefined ? data.endDate : currentActivity.endDate;
        
        if (startTime && endTime && endTime <= startTime) {
          return res.status(400).json({
            error: `Horário inválido: o horário de término (${endTime}) deve ser posterior ao horário de início (${startTime})`
          });
        }

        // Bloqueio de agenda na edição: férias = rígido; compromisso = aviso.
        const ignoreBlockPut = req.body?.ignoreBlock === true;
        if (technicianId && scheduledDateInput) {
          const bStart = new Date(scheduledDateInput as any);
          bStart.setHours(0, 0, 0, 0);
          const bEnd = endDateInput ? new Date(endDateInput as any) : new Date(scheduledDateInput as any);
          bEnd.setHours(23, 59, 59, 999);
          const overlapBlocks = await storage.getAgendaBlocksByDateRange(bStart, bEnd);
          const techBlocks = overlapBlocks.filter((b) => b.technicianId === technicianId);
          const toMin = (t?: string | null) => {
            if (!t) return null;
            const m = t.match(/^(\d{1,2}):(\d{2})/);
            return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
          };

          const feriasHit = techBlocks.find((b) => b.blockType === "ferias");
          if (feriasHit) {
            return res.status(409).json({
              code: "AGENDA_BLOCK_FERIAS",
              error: "O técnico está de férias neste período. Não é possível agendar.",
            });
          }

          if (!ignoreBlockPut) {
            const compHit = techBlocks.find((b) => {
              if (b.blockType !== "compromisso") return false;
              const bs = toMin(b.startTime);
              const be = toMin(b.endTime);
              const as = toMin(startTime);
              const ae = toMin(endTime || startTime);
              if (bs === null || be === null || as === null || ae === null) return true;
              return as < be && ae > bs;
            });
            if (compHit) {
              return res.status(409).json({
                code: "AGENDA_BLOCK",
                blockType: "compromisso",
                error: "O técnico tem um compromisso pessoal neste horário.",
              });
            }
          }
        }
        
        if (technicianId && scheduledDateInput && startTime) {
          const activityTypeId = data.activityTypeId || currentActivity.activityTypeId;
          let skipConflictCheck = false;
          if (activityTypeId) {
            const activityType = await storage.getActivityType(activityTypeId);
            if (activityType && activityType.category === "adicional") {
              skipConflictCheck = true;
            }
          }
          
          if (!skipConflictCheck) {
            const scheduledDate = new Date(scheduledDateInput as any);
            const newScheduledDateStr = getDateString(scheduledDateInput);
            const newEndDateStr = endDateInput ? getDateString(endDateInput) : newScheduledDateStr;
            
            const rangeStart = new Date(scheduledDate);
            rangeStart.setHours(0, 0, 0, 0);
            const rangeEnd = endDateInput ? new Date(endDateInput as any) : new Date(scheduledDate);
            rangeEnd.setHours(23, 59, 59, 999);
            
            const existingActivities = await storage.getActivitiesByDateRange(rangeStart, rangeEnd);
            const technicianActivities = existingActivities.filter(
              a => a.technicianId === technicianId && 
                   a.status !== "cancelado" &&
                   a.id !== activityId
            );
            
            const newStart = startTime;
            const newEnd = endTime || startTime;
            
            const getDaysInRange = (start: string, end: string): string[] => {
              const days: string[] = [];
              const d = new Date(start + "T00:00:00");
              const last = new Date(end + "T00:00:00");
              while (d <= last) {
                days.push(d.toISOString().split('T')[0]);
                d.setDate(d.getDate() + 1);
              }
              return days;
            };
            
            const newDays = getDaysInRange(newScheduledDateStr, newEndDateStr);
            
            for (const existing of technicianActivities) {
              const existingStart = existing.startTime;
              const existingEnd = existing.endTime || existing.startTime;
              const existingDateStr = getDateString(existing.scheduledDate);
              const existingEndDateStr = existing.endDate ? getDateString(existing.endDate) : existingDateStr;
              const existingDays = getDaysInRange(existingDateStr, existingEndDateStr);
              
              const overlappingDays = newDays.filter(d => existingDays.includes(d));
              if (overlappingDays.length === 0) continue;
              
              const hasTimeOverlap = (newStart < existingEnd && newEnd > existingStart) ||
                                (newStart === existingStart);
              
              if (hasTimeOverlap) {
                const conflictDay = overlappingDays[0];
                const [cy, cm, cd] = conflictDay.split('-');
                const formattedDate = `${cd}/${cm}/${cy}`;
                return res.status(409).json({ 
                  error: `Conflito de horário: já existe uma atividade agendada para este técnico em ${formattedDate} das ${existingStart} às ${existingEnd} (${existing.clientName || existing.description || 'Atividade existente'})` 
                });
              }
            }
          }
        }
      }
      
      // Auto-geocode if address is provided but no coordinates
      if (!data.latitude && !data.longitude && data.address) {
        const fullAddress = [
          data.address,
          data.numero,
          data.bairro,
          data.city,
          data.state,
          data.country || "Brasil"
        ].filter(Boolean).join(", ");
        
        try {
          const geocoded = await geocodeAddress(fullAddress);
          if (geocoded.found) {
            (data as any).latitude = geocoded.latitude.toString();
            (data as any).longitude = geocoded.longitude.toString();
            console.log(`📍 Auto-geocoded updated activity address: ${fullAddress} -> (${geocoded.latitude}, ${geocoded.longitude})`);
          }
        } catch (geoError) {
          console.error("Failed to geocode activity address:", geoError);
        }
      }
      
      // If status is changing to "aCaminho", automatically set navigationStartTime
      if (data.status === "aCaminho") {
        const existingActivity = await storage.getActivity(req.params.id);
        // Only set navigationStartTime if not already set (avoid overwriting on re-navigation)
        if (existingActivity && !existingActivity.navigationStartTime) {
          (data as any).navigationStartTime = new Date();
          console.log(`🚗 NAVIGATION START - Activity ${req.params.id}, Time: ${new Date().toISOString()}`);
        }
      }
      
      const activity = await storage.updateActivity(req.params.id, data);
      
      // Create audit log
      await storage.createAuditLog({
        userId: req.user!.userId,
        action: "UPDATE",
        entityType: "activity",
        entityId: activity.id,
        changes: JSON.stringify(data),
      });
      
      // Broadcast activity update to all connected clients
      broadcastActivityUpdate(activity, "updated");
      
      res.json(activity);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/activities/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const activity = await storage.getActivity(req.params.id);
      
      if (!activity) {
        return res.status(404).json({ error: "Atividade não encontrada" });
      }
      
      // Verificar permissões: apenas admin ou técnico dono pode deletar
      const user = await storage.getUser(req.user!.userId);
      if (!user) {
        return res.status(403).json({ error: "Usuário não autorizado" });
      }
      
      const isAdmin = user.role === "admin";
      const isOwner = activity.technicianId && (await storage.getTechnicianByUserId(user.id))?.id === activity.technicianId;
      
      if (!isAdmin && !isOwner) {
        return res.status(403).json({ error: "Você não tem permissão para excluir esta atividade" });
      }
      
      // Não permitir exclusão de atividades concluídas ou canceladas
      if (activity.status === "concluido" || activity.status === "cancelado") {
        return res.status(400).json({ 
          error: `Não é possível excluir atividades com status "${activity.status}". Apenas atividades planejadas, a caminho ou em execução podem ser excluídas.` 
        });
      }
      
      const actId = req.params.id;

      // Limpa registros sem ON DELETE CASCADE antes de excluir a atividade
      await db.update(timeEntries)
        .set({ agendaActivityId: null })
        .where(eq(timeEntries.agendaActivityId, actId));

      await db.update(travelSegments)
        .set({ agendaActivityId: null })
        .where(eq(travelSegments.agendaActivityId, actId));

      await db.delete(approvals)
        .where(eq(approvals.activityId, actId));

      await db.delete(activityAttachments)
        .where(eq(activityAttachments.activityId, actId));

      await storage.deleteActivity(actId);
      
      // Create audit log
      await storage.createAuditLog({
        userId: req.user!.userId,
        action: "DELETE",
        entityType: "activity",
        entityId: req.params.id,
        changes: null,
      });
      
      // Broadcast activity deletion to all connected clients
      broadcastActivityUpdate(activity, "deleted");
      
      res.status(204).send();
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Approvals routes
  app.get("/api/approvals", authMiddleware, roleMiddleware(["admin"]), async (req: AuthRequest, res) => {
    try {
      const { status } = req.query;
      
      if (status === "pendente") {
        const approvals = await storage.getPendingApprovals();
        res.json(approvals);
      } else {
        const approvals = await storage.getPendingApprovals();
        res.json(approvals);
      }
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/approvals", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const data = insertApprovalSchema.parse({
        ...req.body,
        submittedBy: req.user!.userId,
      });
      const approval = await storage.createApproval(data);
      res.status(201).json(approval);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.put("/api/approvals/:id", authMiddleware, roleMiddleware(["admin"]), async (req: AuthRequest, res) => {
    try {
      const data = updateApprovalSchema.parse(req.body);
      const approval = await storage.updateApproval(req.params.id, {
        ...data,
        reviewedBy: req.user!.userId,
        reviewedAt: new Date(),
      });
      res.json(approval);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Day markers routes
  app.get("/api/day-markers", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { startDate, endDate, technicianId } = req.query;
      
      let markers: any[] = [];
      if (startDate && endDate) {
        markers = await storage.getDayMarkersByDateRange(
          new Date(startDate as string),
          new Date(endDate as string)
        );
      } else if (technicianId) {
        markers = await storage.getDayMarkersByTechnicianId(technicianId as string);
      }
      
      res.json(markers);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/day-markers", authMiddleware, roleMiddleware(["admin"]), async (req: AuthRequest, res) => {
    try {
      const data = insertDayMarkerSchema.parse(req.body);
      const marker = await storage.createDayMarker(data);
      res.status(201).json(marker);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/day-markers/:id", authMiddleware, roleMiddleware(["admin"]), async (req: AuthRequest, res) => {
    try {
      await storage.deleteDayMarker(req.params.id);
      res.status(204).send();
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ===================================================================
  // Bloqueios de agenda (indisponibilidade: férias / compromissos)
  // Técnico tem autonomia: cria/exclui os próprios bloqueios.
  // Admin pode criar/excluir para qualquer técnico.
  // ===================================================================
  app.get("/api/agenda-blocks", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { startDate, endDate, technicianId } = req.query;
      let blocks: any[] = [];
      if (startDate && endDate) {
        // Trata data-only (YYYY-MM-DD) como horário LOCAL para não perder
        // bloqueios por diferença de fuso. Cobre o dia inteiro.
        const dateOnly = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
        const startStr = startDate as string;
        const endStr = endDate as string;
        const start = dateOnly(startStr) ? new Date(`${startStr}T00:00:00`) : (() => { const d = new Date(startStr); d.setHours(0, 0, 0, 0); return d; })();
        const end = dateOnly(endStr) ? new Date(`${endStr}T23:59:59.999`) : (() => { const d = new Date(endStr); d.setHours(23, 59, 59, 999); return d; })();
        blocks = await storage.getAgendaBlocksByDateRange(start, end);
      } else if (technicianId) {
        blocks = await storage.getAgendaBlocksByTechnicianId(technicianId as string);
      }
      res.json(blocks);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/agenda-blocks", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const data = insertAgendaBlockSchema.parse(req.body);

      // Assistente só pode criar bloqueio para si mesmo.
      if (req.user!.role === "assistente") {
        const tech = await storage.getTechnicianByUserId(req.user!.userId);
        if (!tech) {
          return res.status(400).json({ error: "Técnico não encontrado para este usuário." });
        }
        data.technicianId = tech.id;
      } else if (!data.technicianId) {
        return res.status(400).json({ error: "Selecione o técnico." });
      }

      data.createdBy = req.user!.userId;

      const block = await storage.createAgendaBlock(data as any);
      res.status(201).json(block);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/agenda-blocks/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const block = await storage.getAgendaBlock(req.params.id);
      if (!block) {
        return res.status(404).json({ error: "Bloqueio não encontrado." });
      }
      // Assistente só pode excluir os próprios bloqueios.
      if (req.user!.role === "assistente") {
        const tech = await storage.getTechnicianByUserId(req.user!.userId);
        if (!tech || block.technicianId !== tech.id) {
          return res.status(403).json({ error: "Não autorizado a excluir este bloqueio." });
        }
      }
      await storage.deleteAgendaBlock(req.params.id);
      res.status(204).send();
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // KPI/Analytics routes
  app.get("/api/analytics/kpis", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { startDate, endDate, technicianId } = req.query;
      
      // Get activities for the period
      const activities = await storage.getActivitiesByDateRange(
        new Date(startDate as string || new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
        new Date(endDate as string || new Date())
      );

      // TODO: Implement KPI calculations
      // For now, return mock data structure
      res.json({
        totalHours: 0,
        efetivoPct: 0,
        adicionalPct: 0,
        perdaPct: 0,
        activitiesCount: activities.length,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Technician Location routes (F-003) - /status route moved above to avoid route conflict

  app.get("/api/technicians/:id/last-location", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const location = await storage.getLastTechnicianLocation(req.params.id);
      
      if (!location) {
        return res.status(404).json({ error: "No location found for this technician" });
      }
      
      res.json(location);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/technicians/:id/location", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const data = insertTechnicianLocationSchema.parse({
        ...req.body,
        technicianId: req.params.id,
      });
      
      const location = await storage.createTechnicianLocation(data);
      res.status(201).json(location);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Update GPS status without coordinates (fallback when GPS unavailable)
  app.patch("/api/technicians/:id/gps-status", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { gpsStatus, connectionStatus } = req.body;
      
      if (!gpsStatus || !connectionStatus) {
        return res.status(400).json({ error: "gpsStatus and connectionStatus are required" });
      }

      // Authorization: only admin or the technician's own user can update
      const technician = await storage.getTechnician(req.params.id);
      if (!technician) {
        return res.status(404).json({ error: "Técnico não encontrado." });
      }

      // Check authorization: must be admin OR the user linked to this technician
      if (req.user!.role !== "admin" && req.user!.userId !== technician.userId) {
        return res.status(403).json({ error: "Unauthorized: you can only update your own GPS status" });
      }

      // Get last known location
      const lastLocation = await storage.getLastTechnicianLocation(req.params.id);
      
      if (!lastLocation) {
        return res.status(404).json({ error: "No previous location found for this technician" });
      }

      // Update with same coordinates but new status
      const data = insertTechnicianLocationSchema.parse({
        technicianId: req.params.id,
        latitude: lastLocation.latitude,
        longitude: lastLocation.longitude,
        accuracy: lastLocation.accuracy || 0,
        battery: lastLocation.battery || 0,
        gpsStatus,
        connectionStatus,
        deviceModel: lastLocation.deviceModel || "",
      });
      
      const location = await storage.createTechnicianLocation(data);
      
      // Broadcast via WebSocket
      broadcastLocationUpdate({
        technicianId: req.params.id,
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy,
        battery: location.battery,
        gpsStatus: location.gpsStatus,
        connectionStatus: location.connectionStatus,
        deviceModel: location.deviceModel,
      });
      
      res.json(location);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Map routes (F-004)
  app.get("/api/map/clients", authMiddleware, roleMiddleware(["admin"]), async (req: AuthRequest, res) => {
    try {
      const { region, segment, search } = req.query;
      
      const clients = await storage.getClientsForMap({
        region: region as string | undefined,
        segment: segment as string | undefined,
        search: search as string | undefined,
      });
      
      res.json(clients);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get unique regions and segments for filter dropdowns
  app.get("/api/map/filters/options", authMiddleware, roleMiddleware(["admin"]), async (req: AuthRequest, res) => {
    try {
      const allClients = await storage.getClientsForMap({});
      
      const regions = Array.from(new Set(allClients.map(c => c.region).filter(Boolean))).sort();
      const segments = Array.from(new Set(allClients.map(c => c.segment).filter(Boolean))).sort();
      
      res.json({ regions, segments });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Proxy para ViaCEP - evita problemas de rede/CORS no mobile
  app.get("/api/cep/:cep", async (req, res) => {
    try {
      const cleanCep = req.params.cep.replace(/\D/g, "");
      if (cleanCep.length !== 8) {
        return res.status(400).json({ error: "CEP deve ter 8 dígitos" });
      }
      const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      console.error("Erro ao buscar CEP:", error);
      res.status(500).json({ error: "Erro ao buscar CEP" });
    }
  });

  // Clients CRUD routes (M4 - F-005)
  // List clients with pagination and filters
  app.get("/api/clients", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { page, limit, search, region, segment, active } = req.query;
      
      // Validate and cap pagination params
      const parsedPage = page ? parseInt(page as string) : 1;
      const parsedLimit = limit ? parseInt(limit as string) : 50;
      
      if (isNaN(parsedPage) || parsedPage < 1) {
        return res.status(400).json({ error: "Invalid page number" });
      }
      
      if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 10000) {
        return res.status(400).json({ error: "Limit must be between 1 and 10000" });
      }
      
      const result = await storage.listClients({
        page: parsedPage,
        limit: parsedLimit,
        search: search as string | undefined,
        region: region as string | undefined,
        segment: segment as string | undefined,
        active: active !== undefined ? active === "true" : undefined,
      });
      
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get geocoding status - how many clients need geocoding
  // IMPORTANT: This route must be before /api/clients/:id to avoid "geocode-status" being treated as an ID
  app.get("/api/clients/geocode-status", authMiddleware, roleMiddleware(["admin"]), async (req: AuthRequest, res) => {
    try {
      const allClients = await storage.getAllClients();
      const withCoords = allClients.filter(
        (c) => c.latitude && c.longitude && c.latitude !== "" && c.longitude !== ""
      );
      const withoutCoords = allClients.filter(
        (c) => !c.latitude || !c.longitude || c.latitude === "" || c.longitude === ""
      );
      
      res.json({
        total: allClients.length,
        withCoordinates: withCoords.length,
        withoutCoordinates: withoutCoords.length
      });
    } catch (error: any) {
      console.error("Geocode status error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Batch geocode clients without coordinates - processes 100 at a time (faster with Mapbox)
  // IMPORTANT: This route must be before /api/clients/:id to avoid "geocode-batch" being treated as an ID
  app.post("/api/clients/geocode-batch", authMiddleware, roleMiddleware(["admin"]), async (req: AuthRequest, res) => {
    try {
      // Mapbox allows 600 req/min, so we can process 100 clients per batch (~20 seconds)
      const BATCH_SIZE = 100;
      
      // Get all clients without coordinates
      const allClients = await storage.getAllClients();
      const clientsWithoutCoords = allClients.filter(
        (c) => !c.latitude || !c.longitude || c.latitude === "" || c.longitude === ""
      );
      
      const totalWithoutCoords = clientsWithoutCoords.length;
      const totalWithCoords = allClients.length - totalWithoutCoords;
      
      if (clientsWithoutCoords.length === 0) {
        return res.json({ 
          message: "Todos os clientes já possuem coordenadas",
          processed: 0,
          success: 0,
          failed: 0,
          remaining: 0,
          totalClients: allClients.length,
          totalWithCoordinates: totalWithCoords,
          isComplete: true
        });
      }

      // Take only first BATCH_SIZE clients
      const batchToProcess = clientsWithoutCoords.slice(0, BATCH_SIZE);
      
      let successCount = 0;
      let failedCount = 0;
      let mapboxCount = 0;
      let nominatimCount = 0;
      const results: { clientId: string; companyName: string; success: boolean; error?: string; source?: string }[] = [];

      console.log(`[Geocode Batch] Processing ${batchToProcess.length} of ${totalWithoutCoords} clients (using Mapbox primary)`);

      for (const client of batchToProcess) {
        try {
          const addressParts = [
            client.address,
            client.numero,
            client.bairro,
            client.city,
            client.state,
            "Brasil"
          ].filter(Boolean);

          if (addressParts.length < 2) {
            results.push({
              clientId: client.id,
              companyName: client.companyName,
              success: false,
              error: "Endereço insuficiente"
            });
            failedCount++;
            continue;
          }

          const geocodeResult = await geocodeAddress(
            client.address || "",
            client.numero || "",
            client.bairro || "",
            client.city || "",
            client.state || "",
            "Brasil"
          );

          if (geocodeResult.found && geocodeResult.latitude && geocodeResult.longitude) {
            await storage.updateClient(client.id, {
              latitude: geocodeResult.latitude.toString(),
              longitude: geocodeResult.longitude.toString()
            });
            
            results.push({
              clientId: client.id,
              companyName: client.companyName,
              success: true,
              source: geocodeResult.source
            });
            successCount++;
            if (geocodeResult.source === "mapbox") mapboxCount++;
            if (geocodeResult.source === "nominatim") nominatimCount++;
            console.log(`[Geocode Batch] ✓ ${client.companyName} (${geocodeResult.source})`);
          } else {
            results.push({
              clientId: client.id,
              companyName: client.companyName,
              success: false,
              error: "Coordenadas não encontradas"
            });
            failedCount++;
            console.log(`[Geocode Batch] ✗ ${client.companyName} - não encontrado`);
          }

          // Small delay to respect Mapbox rate limits (100ms = 600 req/min max)
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error: any) {
          results.push({
            clientId: client.id,
            companyName: client.companyName,
            success: false,
            error: error.message
          });
          failedCount++;
          console.log(`[Geocode Batch] ✗ ${client.companyName} - erro: ${error.message}`);
        }
      }

      const remaining = totalWithoutCoords - batchToProcess.length;
      const newTotalWithCoords = totalWithCoords + successCount;
      
      console.log(`[Geocode Batch] Completed: ${successCount} success (Mapbox: ${mapboxCount}, Nominatim: ${nominatimCount}), ${failedCount} failed, ${remaining} remaining`);

      res.json({
        message: remaining > 0 
          ? `Lote processado (Mapbox: ${mapboxCount}, Nominatim: ${nominatimCount}). Clique novamente para continuar.`
          : `Geocodificação concluída!`,
        processed: batchToProcess.length,
        success: successCount,
        failed: failedCount,
        remaining: remaining,
        totalClients: allClients.length,
        totalWithCoordinates: newTotalWithCoords,
        isComplete: remaining === 0,
        mapboxCount,
        nominatimCount,
        results
      });
    } catch (error: any) {
      console.error("Batch geocoding error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get single client by ID
  app.get("/api/clients/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const client = await storage.getClient(req.params.id);
      
      if (!client) {
        return res.status(404).json({ error: "Cliente não encontrado" });
      }
      
      res.json(client);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Create new client (with auto-geocoding)
  app.post("/api/clients", authMiddleware, roleMiddleware(["admin"]), async (req: AuthRequest, res) => {
    try {
      const data = insertClientSchema.parse(req.body);
      
      // Auto-geocode if address is provided but no coordinates
      if ((data.address || data.city) && (!data.latitude || !data.longitude)) {
        try {
          const geocodeResult = await geocodeAddress(
            data.address || "",
            data.numero || "",
            data.bairro || "",
            data.city || "",
            data.state || "",
            data.country || "Brasil"
          );
          
          if (geocodeResult.found && geocodeResult.latitude && geocodeResult.longitude) {
            data.latitude = geocodeResult.latitude.toString();
            data.longitude = geocodeResult.longitude.toString();
            console.log(`[Auto-Geocode] Cliente geocodificado: ${data.companyName}`);
          }
        } catch (geoError) {
          console.log(`[Auto-Geocode] Falha ao geocodificar: ${data.companyName}`, geoError);
        }
      }
      
      const client = await storage.createClient(data);
      
      res.status(201).json(client);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Update client (with auto-geocoding when address changes)
  app.put("/api/clients/:id", authMiddleware, roleMiddleware(["admin"]), async (req: AuthRequest, res) => {
    try {
      const data = updateClientSchema.parse(req.body);
      
      // Auto-geocode if address fields changed and no coordinates provided
      const addressChanged = data.address !== undefined || data.numero !== undefined || 
                            data.bairro !== undefined || data.city !== undefined || 
                            data.state !== undefined;
      const noCoordinates = !data.latitude || !data.longitude;
      
      if (addressChanged && noCoordinates) {
        // Get current client to merge address data
        const currentClient = await storage.getClient(req.params.id);
        if (currentClient) {
          const address = data.address ?? currentClient.address;
          const city = data.city ?? currentClient.city;
          
          if (address || city) {
            try {
              const geocodeResult = await geocodeAddress(
                address || "",
                (data.numero ?? currentClient.numero) || "",
                (data.bairro ?? currentClient.bairro) || "",
                city || "",
                (data.state ?? currentClient.state) || "",
                (data.country ?? currentClient.country) || "Brasil"
              );
              
              if (geocodeResult.found && geocodeResult.latitude && geocodeResult.longitude) {
                data.latitude = geocodeResult.latitude.toString();
                data.longitude = geocodeResult.longitude.toString();
                console.log(`[Auto-Geocode] Cliente atualizado geocodificado: ${currentClient.companyName}`);
              }
            } catch (geoError) {
              console.log(`[Auto-Geocode] Falha ao geocodificar atualização`, geoError);
            }
          }
        }
      }
      
      const client = await storage.updateClient(req.params.id, data);
      
      res.json(client);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Re-geocode a client (update coordinates based on current address)
  app.post("/api/clients/:id/regeocode", authMiddleware, roleMiddleware(["admin"]), async (req: AuthRequest, res) => {
    try {
      const client = await storage.getClient(req.params.id);
      
      if (!client) {
        return res.status(404).json({ error: "Cliente não encontrado" });
      }

      // Attempt geocoding with current address data
      if (client.address || client.city) {
        const geocodeResult = await geocodeAddress(
          client.address || "",
          client.numero || "",
          client.bairro || "",
          client.city || "",
          client.state || "",
          client.country || "Brasil"
        );

        if (geocodeResult.found) {
          // Update client with new coordinates
          const updatedClient = await storage.updateClient(req.params.id, {
            latitude: geocodeResult.latitude.toString(),
            longitude: geocodeResult.longitude.toString(),
          });

          res.json({
            success: true,
            message: "Localização atualizada com sucesso",
            client: updatedClient,
            geocode: geocodeResult,
          });
        } else {
          res.status(400).json({
            success: false,
            message: "Não foi possível encontrar coordenadas para este endereço",
          });
        }
      } else {
        res.status(400).json({
          success: false,
          message: "Cliente não possui endereço cadastrado",
        });
      }
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Delete client
  app.delete("/api/clients/:id", authMiddleware, roleMiddleware(["admin"]), async (req: AuthRequest, res) => {
    try {
      await storage.deleteClient(req.params.id);
      res.status(204).send();
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get client sites
  app.get("/api/clients/:id/sites", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const sites = await storage.getClientSitesByClientId(req.params.id);
      res.json(sites);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Create client site
  app.post("/api/clients/:id/sites", authMiddleware, roleMiddleware(["admin"]), async (req: AuthRequest, res) => {
    try {
      const data = insertClientSiteSchema.parse({
        ...req.body,
        clientId: req.params.id,
      });
      const site = await storage.createClientSite(data);
      
      res.status(201).json(site);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Update client site
  app.put("/api/sites/:id", authMiddleware, roleMiddleware(["admin"]), async (req: AuthRequest, res) => {
    try {
      const data = updateClientSiteSchema.parse(req.body);
      const site = await storage.updateClientSite(req.params.id, data);
      
      res.json(site);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Delete client site
  app.delete("/api/sites/:id", authMiddleware, roleMiddleware(["admin"]), async (req: AuthRequest, res) => {
    try {
      await storage.deleteClientSite(req.params.id);
      res.status(204).send();
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Client import route (F-005)
  app.post("/api/clients/import", authMiddleware, roleMiddleware(["admin"]), upload.single("file"), async (req: AuthRequest, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      // Parse JSON data from request body (assume frontend has already parsed Excel to JSON)
      const jsonData = JSON.parse(req.body.data || "[]");
      
      // Map Portuguese column names to database field names (accept multiple variations - case insensitive)
      const getField = (row: any, ...keys: string[]) => {
        for (const key of keys) {
          if (row[key] !== undefined && row[key] !== null && row[key] !== "") return row[key];
          // Try uppercase/lowercase variations
          if (row[key.toUpperCase()] !== undefined && row[key.toUpperCase()] !== null && row[key.toUpperCase()] !== "") return row[key.toUpperCase()];
          if (row[key.toLowerCase()] !== undefined && row[key.toLowerCase()] !== null && row[key.toLowerCase()] !== "") return row[key.toLowerCase()];
        }
        return "";
      };
      
      // Convert any value to string (handles numbers from Excel)
      const toString = (val: any): string => {
        if (val === undefined || val === null || val === "") return "";
        return String(val);
      };
      
      const mapExcelRow = (row: any) => {
        return {
          companyName: toString(getField(row, "Nome da Empresa", "Cliente", "Razão Social", "Empresa", "Nome", "NOME", "companyName")),
          cnpj: toString(getField(row, "CNPJ", "CPF/CNPJ", "cnpj")),
          internalCode: toString(getField(row, "CODIGO", "Codigo", "Código", "Cod", "COD", "CàDIGO", "internalCode")),
          region: toString(getField(row, "Região", "Regiao", "REGIÃO", "REGIAO", "region")),
          segment: toString(getField(row, "Negócio", "Negocio", "Segmento", "SEGMENTO", "segment")),
          contactName: toString(getField(row, "Nome do Contato", "Contato", "CONTATO", "Responsável", "Responsavel", "contactName")),
          contactPhone: toString(getField(row, "Telefone do Contato", "Telefone", "TELEFONE", "Fone", "Tel", "contactPhone")),
          contactEmail: toString(getField(row, "Email do Contato", "Email", "EMAIL", "E-mail", "contactEmail")),
          zipCode: toString(getField(row, "CEP", "Cep", "cep", "Código Postal", "zipCode")),
          address: toString(getField(row, "Endereço", "Endereco", "Logradouro", "Rua", "RUA", "address")),
          numero: toString(getField(row, "Número", "Numero", "número", "numero", "NUMERO", "Nº", "N°")),
          bairro: toString(getField(row, "Bairro", "BAIRRO")),
          city: toString(getField(row, "Cidade", "CIDADE", "Municipio", "Município", "city")),
          state: toString(getField(row, "Estado", "ESTADO", "UF", "state")),
          country: toString(getField(row, "País", "Pais", "PAIS", "PAÍS", "PAÖS", "country")) || "Brasil",
          active: true,
        };
      };
      
      // Get existing clients to check for duplicates (by CNPJ or externalCode)
      const existingClients = await storage.getAllClients();
      const existingByCnpj = new Map<string, string>();
      const existingByCode = new Map<string, string>();
      
      existingClients.forEach(c => {
        if (c.cnpj) existingByCnpj.set(c.cnpj.replace(/\D/g, ''), c.id);
        if (c.internalCode) existingByCode.set(c.internalCode, c.id);
      });
      
      // Validate and import/update each row
      const importedClients = [];
      const updatedClients = [];
      const invalidRows: { row: number; errors: string[] }[] = [];
      const skippedRows: { row: number; reason: string }[] = [];
      
      for (let i = 0; i < jsonData.length; i++) {
        try {
          const mappedData = mapExcelRow(jsonData[i]);
          const validatedData = insertClientSchema.parse(mappedData);
          
          // Check for duplicate by CNPJ or internalCode
          const cnpjClean = validatedData.cnpj ? validatedData.cnpj.replace(/\D/g, '') : '';
          const existingIdByCnpj = cnpjClean ? existingByCnpj.get(cnpjClean) : undefined;
          const existingIdByCode = validatedData.internalCode ? existingByCode.get(validatedData.internalCode) : undefined;
          const existingId = existingIdByCnpj || existingIdByCode;
          
          if (existingId) {
            // Update existing client
            const client = await storage.updateClient(existingId, validatedData);
            updatedClients.push(client);
          } else {
            // Create new client
            const client = await storage.createClient(validatedData);
            importedClients.push(client);
            // Add to maps to prevent duplicates within same import
            if (cnpjClean) existingByCnpj.set(cnpjClean, client.id);
            if (validatedData.internalCode) existingByCode.set(validatedData.internalCode, client.id);
          }
        } catch (error: any) {
          const errors = error.errors?.map((e: any) => `${e.path.join('.')}: ${e.message}`) || [error.message];
          invalidRows.push({
            row: i + 2, // Excel row number (1 = header, 2 = first data row)
            errors,
          });
        }
      }
      
      res.json({
        imported: importedClients.length,
        updated: updatedClients.length,
        total: jsonData.length,
        invalidRows,
        skippedRows,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Geo/Maps utility route (F-005)
  app.post("/api/geo/parse-maps-url", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { url } = req.body;
      
      if (!url || typeof url !== "string") {
        return res.status(400).json({ error: "URL is required" });
      }
      
      const parsed = parseGoogleMapsUrl(url);
      
      if (!parsed.latitude || !parsed.longitude) {
        return res.status(400).json({ error: "Could not extract coordinates from URL" });
      }
      
      if (!isValidCoordinates(parsed.latitude, parsed.longitude)) {
        return res.status(400).json({ error: "Coordenadas inválidas." });
      }
      
      res.json(parsed);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // TEST ENDPOINT: Simular atualização de GPS (dev only)
  if (process.env.NODE_ENV === "development") {
    app.post("/api/test/update-gps", async (req, res) => {
      try {
        // Buscar todos os técnicos via query direta
        const allTechs = await db.select().from(technicians);
        if (allTechs.length === 0) {
          return res.status(404).json({ error: "Nenhum técnico encontrado" });
        }

        const tech = allTechs[0];
        
        // Simular movimento aleatório em São Paulo (pequeno deslocamento)
        const baseLat = -23.5505;
        const baseLng = -46.6333;
        const randomLat = baseLat + (Math.random() - 0.5) * 0.01;
        const randomLng = baseLng + (Math.random() - 0.5) * 0.01;

        const location = await storage.createTechnicianLocation({
          technicianId: tech.id,
          latitude: randomLat.toString(),
          longitude: randomLng.toString(),
          accuracy: Math.floor(Math.random() * 20) + 5,
          battery: Math.floor(Math.random() * 30) + 70,
          gpsStatus: "ativo",
          connectionStatus: "online",
          deviceModel: "Samsung Galaxy S21 (Teste)",
          androidVersion: "13",
          appVersion: "1.0.0",
          address: `Teste - São Paulo, SP (${randomLat.toFixed(4)}, ${randomLng.toFixed(4)})`,
        });

        // Broadcast para todos os clientes WebSocket conectados
        broadcastLocationUpdate(location);
        console.log(`[Test GPS] Localização broadcast via WebSocket para ${tech.name}`);

        res.json({ 
          success: true, 
          message: "Localização GPS simulada atualizada",
          location 
        });
      } catch (error: any) {
        console.error("Erro ao simular GPS:", error);
        res.status(500).json({ error: error.message });
      }
    });
  }

  // Geocoding endpoint - Convert address to coordinates
  app.post("/api/geocode", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { address, numero, bairro, city, state, country } = req.body;
      
      if (!address && !city) {
        return res.status(400).json({ error: "Address or city is required" });
      }
      
      const result = await geocodeAddress(address, numero, bairro, city, state, country);
      
      res.json(result);
    } catch (error: any) {
      console.error("Geocoding error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Reverse geocoding endpoint - Convert coordinates to address
  app.post("/api/geocode/reverse", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { latitude, longitude } = req.body;
      
      if (!latitude || !longitude) {
        return res.status(400).json({ error: "Localização (latitude e longitude) é obrigatória." });
      }
      
      const result = await reverseGeocode(
        parseFloat(latitude),
        parseFloat(longitude)
      );
      
      res.json(result);
    } catch (error: any) {
      console.error("Reverse geocoding error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Calculate route between multiple waypoints
  app.post("/api/routes/calculate", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { waypoints, profile = "car" } = req.body;
      
      if (!waypoints || !Array.isArray(waypoints) || waypoints.length < 2) {
        return res.status(400).json({ 
          error: "At least 2 waypoints are required" 
        });
      }
      
      // Validate waypoints
      const validWaypoints: Waypoint[] = waypoints.map((wp: any, index: number) => {
        if (!wp.latitude || !wp.longitude) {
          throw new Error(`Waypoint ${index} missing coordinates`);
        }
        return {
          latitude: parseFloat(wp.latitude),
          longitude: parseFloat(wp.longitude),
          name: wp.name,
        };
      });
      
      const result = await calculateRoute(validWaypoints, profile);
      
      if (!result.success) {
        return res.status(400).json({ 
          error: "Failed to calculate route" 
        });
      }
      
      res.json(result);
    } catch (error: any) {
      console.error("Route calculation error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Calculate optimized route (TSP)
  app.post("/api/routes/optimize", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { origin, waypoints, profile = "car" } = req.body;
      
      // Se origin é fornecido, prepend aos waypoints
      let allWaypoints: Waypoint[];
      
      if (origin) {
        // Validar origem
        if (!origin.latitude || !origin.longitude) {
          return res.status(400).json({ 
            error: "Origin must have latitude and longitude" 
          });
        }
        
        // Validar destinos
        if (!waypoints || !Array.isArray(waypoints) || waypoints.length < 1) {
          return res.status(400).json({ 
            error: "At least 1 destination waypoint is required when using origin" 
          });
        }
        
        const originWaypoint: Waypoint = {
          latitude: parseFloat(origin.latitude),
          longitude: parseFloat(origin.longitude),
          name: origin.name || "Origem",
        };
        
        const destinationWaypoints: Waypoint[] = waypoints.map((wp: any, index: number) => {
          if (!wp.latitude || !wp.longitude) {
            throw new Error(`Waypoint ${index} missing coordinates`);
          }
          return {
            latitude: parseFloat(wp.latitude),
            longitude: parseFloat(wp.longitude),
            name: wp.name,
          };
        });
        
        // Prepend origin aos waypoints
        allWaypoints = [originWaypoint, ...destinationWaypoints];
      } else {
        // Modo antigo: sem origem específica
        if (!waypoints || !Array.isArray(waypoints) || waypoints.length < 2) {
          return res.status(400).json({ 
            error: "At least 2 waypoints are required" 
          });
        }
        
        allWaypoints = waypoints.map((wp: any, index: number) => {
          if (!wp.latitude || !wp.longitude) {
            throw new Error(`Waypoint ${index} missing coordinates`);
          }
          return {
            latitude: parseFloat(wp.latitude),
            longitude: parseFloat(wp.longitude),
            name: wp.name,
          };
        });
      }
      
      const result = await calculateOptimizedRoute(allWaypoints, profile, origin ? { fixedStart: true } : {});
      
      if (!result.success) {
        return res.status(400).json({ 
          error: "Failed to optimize route" 
        });
      }
      
      // Transform result to match frontend expectations
      const response = {
        waypoints: result.waypoints.map((wp, idx) => ({
          waypoint_index: result.waypointOrder[idx],
          trips_index: 0,
          location: wp.location,
        })),
        trips: [{
          legs: result.legs,
          distance: result.distance,
          duration: result.duration,
          geometry: result.geometry,
        }],
      };
      
      res.json(response);
    } catch (error: any) {
      console.error("Route optimization error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Generate navigation app deep links
  app.post("/api/routes/navigation-links", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { origin, destination, waypoints } = req.body;
      
      if (!origin || !destination) {
        return res.status(400).json({ 
          error: "Origin and destination are required" 
        });
      }
      
      if (!origin.latitude || !origin.longitude || !destination.latitude || !destination.longitude) {
        return res.status(400).json({ 
          error: "Invalid coordinates" 
        });
      }
      
      const links = generateNavigationLinks(
        {
          latitude: parseFloat(origin.latitude),
          longitude: parseFloat(origin.longitude),
        },
        {
          latitude: parseFloat(destination.latitude),
          longitude: parseFloat(destination.longitude),
        },
        waypoints
      );
      
      res.json(links);
    } catch (error: any) {
      console.error("Navigation links error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Time Tracking - Get available activity types
  app.get("/api/time-activities", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const activities = await db
        .select()
        .from(activityTypes)
        .orderBy(activityTypes.displayOrder);
      
      res.json(activities);
    } catch (error: any) {
      console.error("Get time activities error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Time Tracking - CRUD for time entries
  app.get("/api/time-entries", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { technicianId, startDate, endDate } = req.query;
      
      const conditions = [];
      
      // RBAC: Assistentes can only see their own entries
      if (req.user!.role === "assistente") {
        const tech = await db.select().from(technicians).where(eq(technicians.userId, req.user!.userId)).limit(1);
        if (tech[0]) {
          conditions.push(eq(timeEntries.technicianId, tech[0].id));
        } else {
          // If assistente has no technician profile, return empty
          return res.json([]);
        }
      } else if (technicianId) {
        // Admin can filter by any technician
        conditions.push(eq(timeEntries.technicianId, technicianId as string));
      }
      
      if (startDate) {
        conditions.push(gte(timeEntries.workDate, new Date(startDate as string)));
      }
      if (endDate) {
        conditions.push(lte(timeEntries.workDate, new Date(endDate as string)));
      }
      
      const query = db
        .select({
          id: timeEntries.id,
          technicianId: timeEntries.technicianId,
          activityTypeId: timeEntries.activityTypeId,
          workDate: timeEntries.workDate,
          minutes: timeEntries.minutes,
          source: timeEntries.source,
          notes: timeEntries.notes,
          activityName: activityTypes.name,
          category: activityTypes.category,
          color: activityTypes.color,
        })
        .from(timeEntries)
        .innerJoin(activityTypes, eq(timeEntries.activityTypeId, activityTypes.id))
        .$dynamic();
      
      if (conditions.length > 0) {
        query.where(and(...conditions));
      }
      
      const entries = await query.orderBy(timeEntries.workDate);
      res.json(entries);
    } catch (error: any) {
      console.error("Get time entries error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/time-entries", authMiddleware, async (req: AuthRequest, res) => {
    try {
      let data = insertTimeEntrySchema.parse(req.body);
      
      // RBAC: Assistentes can only create entries for themselves
      if (req.user!.role === "assistente") {
        const tech = await db.select().from(technicians).where(eq(technicians.userId, req.user!.userId)).limit(1);
        if (!tech[0]) {
          return res.status(403).json({ error: "Technician profile not found" });
        }
        // Force technicianId to authenticated user's technician
        data = { ...data, technicianId: tech[0].id };
      }
      
      // Validate daily total doesn't exceed 1440 minutes (24 hours)
      const dayTotal = await db
        .select({
          total: sql<number>`COALESCE(SUM(${timeEntries.minutes}), 0)`,
        })
        .from(timeEntries)
        .where(
          and(
            eq(timeEntries.technicianId, data.technicianId),
            eq(timeEntries.workDate, data.workDate)
          )
        );
      
      if ((dayTotal[0]?.total || 0) + data.minutes > 1440) {
        return res.status(400).json({ 
          error: "Daily total cannot exceed 1440 minutes (24 hours)" 
        });
      }
      
      const [entry] = await db.insert(timeEntries).values(data).returning();
      res.status(201).json(entry);
    } catch (error: any) {
      console.error("Create time entry error:", error);
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/time-entries/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      let updates = insertTimeEntrySchema.partial().parse(req.body);
      
      // Get existing entry
      const [existing] = await db
        .select()
        .from(timeEntries)
        .where(eq(timeEntries.id, id))
        .limit(1);
      
      if (!existing) {
        return res.status(404).json({ error: "Time entry not found" });
      }
      
      // RBAC: Assistentes can only update their own entries
      if (req.user!.role === "assistente") {
        const tech = await db.select().from(technicians).where(eq(technicians.userId, req.user!.userId)).limit(1);
        if (!tech[0] || existing.technicianId !== tech[0].id) {
          return res.status(403).json({ error: "Access denied" });
        }
        // Prevent changing technicianId by creating new object without it
        const { technicianId, ...safeUpdates } = updates;
        updates = safeUpdates as typeof updates;
      }
      
      // If updating minutes or date, validate daily total
      if (updates.minutes !== undefined || updates.workDate !== undefined) {
        const targetDate = updates.workDate || existing.workDate;
        const targetTechId = updates.technicianId || existing.technicianId;
        const newMinutes = updates.minutes ?? existing.minutes;
        
        const dayTotal = await db
          .select({
            total: sql<number>`COALESCE(SUM(${timeEntries.minutes}), 0)`,
          })
          .from(timeEntries)
          .where(
            and(
              eq(timeEntries.technicianId, targetTechId),
              eq(timeEntries.workDate, targetDate),
              not(eq(timeEntries.id, id))
            )
          );
        
        if ((dayTotal[0]?.total || 0) + newMinutes > 1440) {
          return res.status(400).json({ 
            error: "Daily total cannot exceed 1440 minutes (24 hours)" 
          });
        }
      }
      
      const [updated] = await db
        .update(timeEntries)
        .set(updates)
        .where(eq(timeEntries.id, id))
        .returning();
      
      res.json(updated);
    } catch (error: any) {
      console.error("Update time entry error:", error);
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/time-entries/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      
      // Get existing entry for RBAC check
      const [existing] = await db
        .select()
        .from(timeEntries)
        .where(eq(timeEntries.id, id))
        .limit(1);
      
      if (!existing) {
        return res.status(404).json({ error: "Time entry not found" });
      }
      
      // RBAC: Assistentes can only delete their own entries
      if (req.user!.role === "assistente") {
        const tech = await db.select().from(technicians).where(eq(technicians.userId, req.user!.userId)).limit(1);
        if (!tech[0] || existing.technicianId !== tech[0].id) {
          return res.status(403).json({ error: "Access denied" });
        }
      }
      
      await db.delete(timeEntries).where(eq(timeEntries.id, id));
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete time entry error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Time Tracking Reports
  app.get("/api/reports/time-breakdown", authMiddleware, reportsScopeMiddleware, async (req: AuthRequest, res) => {
    try {
      const { technicianId, month, year, userId, startDate: startDateStr, endDate: endDateStr } = req.query;
      
      let startDate: Date;
      let endDate: Date;
      let monthNum: number | undefined;
      let yearNum: number | undefined;
      
      // Support both date range (new) and month/year (legacy)
      if (startDateStr && endDateStr) {
        // New date range format.
        // IMPORTANT: time entries are stored at noon UTC (T12:00:00Z) to keep the
        // calendar day stable across timezones. The period boundaries must therefore
        // be computed in UTC as well, otherwise on machines behind UTC (e.g. UTC-3)
        // setHours() would shift the end of the day to ~03:00 UTC and exclude the
        // noon-UTC entries of the last day.
        startDate = new Date(startDateStr as string);
        endDate = new Date(endDateStr as string);
        // Normalize to full-day UTC boundaries
        startDate.setUTCHours(0, 0, 0, 0);
        endDate.setUTCHours(23, 59, 59, 999);
        
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          return res.status(400).json({ error: "Invalid date format" });
        }
        
        if (startDate > endDate) {
          return res.status(400).json({ error: "Start date must be before end date" });
        }
        
        // Extract month/year from startDate for response
        monthNum = startDate.getMonth() + 1;
        yearNum = startDate.getFullYear();
      } else if (month && year) {
        // Legacy month/year format
        monthNum = parseInt(month as string);
        yearNum = parseInt(year as string);
        
        if (monthNum < 1 || monthNum > 12) {
          return res.status(400).json({ error: "Invalid month (1-12)" });
        }
        
        startDate = new Date(yearNum, monthNum - 1, 1);
        endDate = new Date(yearNum, monthNum, 0, 23, 59, 59, 999); // Last day of month
      } else {
        return res.status(400).json({ 
          error: "Either startDate/endDate or month/year are required" 
        });
      }
      
      // Build filter conditions
      const conditions = [
        gte(timeEntries.workDate, startDate),
        lte(timeEntries.workDate, endDate)
      ];
      
      // If userId is set by reportsScopeMiddleware (for assistente role), use it
      if (userId) {
        // Find technician by userId
        const [technician] = await db
          .select()
          .from(technicians)
          .where(eq(technicians.userId, userId as string))
          .limit(1);
        
        if (technician) {
          conditions.push(eq(timeEntries.technicianId, technician.id));
        } else {
          // No technician profile found, return empty data
          return res.json({
            period: {
              month: monthNum,
              year: yearNum,
              startDate,
              endDate,
            },
            totals: { efetivo: 0, adicional: 0, perda: 0 },
            percentages: { efetivo: 0, adicional: 0, perda: 0 },
            totalMinutes: 0,
            breakdown: [],
            entries: [],
          });
        }
      } else if (technicianId && technicianId !== "all") {
        // Admin filtering by specific technician
        conditions.push(eq(timeEntries.technicianId, technicianId as string));
      }
      
      // Query time entries with activity type details
      // IMPORTANT: Use timeEntries.category for the category, not activityTypes.category
      // because the checkout process overrides the category with travelClassification (adicional/perda)
      const entries = await db
        .select({
          id: timeEntries.id,
          technicianId: timeEntries.technicianId,
          technicianName: technicians.name,
          activityTypeId: timeEntries.activityTypeId,
          activityName: activityTypes.name,
          category: timeEntries.category,
          color: activityTypes.color,
          icon: activityTypes.icon,
          isAutomatic: activityTypes.isAutomatic,
          workDate: timeEntries.workDate,
          minutes: timeEntries.minutes,
          source: timeEntries.source,
          notes: timeEntries.notes,
        })
        .from(timeEntries)
        .innerJoin(activityTypes, eq(timeEntries.activityTypeId, activityTypes.id))
        .innerJoin(technicians, eq(timeEntries.technicianId, technicians.id))
        .where(and(...conditions));
      
      // Calculate totals by category
      const totals = {
        efetivo: 0,
        adicional: 0,
        perda: 0,
      };
      
      const breakdown: Record<string, {
        name: string;
        category: string;
        color: string;
        icon: string | null;
        minutes: number;
        entries: number;
        isAutomatic: boolean;
        justifications: Array<{
          date: string;
          minutes: number;
          text: string;
        }>;
      }> = {};
      
      for (const entry of entries) {
        // Add to category total
        totals[entry.category as keyof typeof totals] += entry.minutes;
        
        // Add to activity breakdown - use composite key of activityTypeId + category
        // This ensures entries with same activity type but different categories are separate
        const breakdownKey = `${entry.activityTypeId}_${entry.category}`;
        
        if (!breakdown[breakdownKey]) {
          breakdown[breakdownKey] = {
            name: entry.activityName,
            category: entry.category,
            color: entry.color,
            icon: entry.icon ?? null,
            minutes: 0,
            entries: 0,
            isAutomatic: entry.isAutomatic,
            justifications: [],
          };
        }
        breakdown[breakdownKey].minutes += entry.minutes;
        breakdown[breakdownKey].entries += 1;
        
        // Extract justification from notes if present
        if (entry.notes && entry.notes.includes("Justificativa:")) {
          const justificationMatch = entry.notes.match(/Justificativa:\s*(.+?)$/);
          if (justificationMatch) {
            breakdown[breakdownKey].justifications.push({
              date: entry.workDate.toISOString().split('T')[0],
              minutes: entry.minutes,
              text: justificationMatch[1].trim(),
            });
          }
        }
      }
      
      // Calculate total and percentages
      const totalMinutes = totals.efetivo + totals.adicional + totals.perda;
      
      const percentages = {
        efetivo: totalMinutes > 0 ? (totals.efetivo / totalMinutes) * 100 : 0,
        adicional: totalMinutes > 0 ? (totals.adicional / totalMinutes) * 100 : 0,
        perda: totalMinutes > 0 ? (totals.perda / totalMinutes) * 100 : 0,
      };
      
      // NEW: Build breakdown by technician for Excel export with filters
      const breakdownByTechnician: Record<string, {
        technicianId: string;
        technicianName: string;
        activityName: string;
        category: string;
        color: string;
        icon: string | null;
        minutes: number;
        entries: number;
        isAutomatic: boolean;
      }> = {};
      
      // NEW: Build technician summary for Excel export
      const technicianSummaryMap: Record<string, {
        technicianId: string;
        technicianName: string;
        efetivo: number;
        adicional: number;
        perda: number;
        total: number;
      }> = {};
      
      for (const entry of entries) {
        // Build breakdown by technician + activity + category
        const techBreakdownKey = `${entry.technicianId}_${entry.activityTypeId}_${entry.category}`;
        
        if (!breakdownByTechnician[techBreakdownKey]) {
          breakdownByTechnician[techBreakdownKey] = {
            technicianId: entry.technicianId,
            technicianName: entry.technicianName,
            activityName: entry.activityName,
            category: entry.category,
            color: entry.color,
            icon: entry.icon ?? null,
            minutes: 0,
            entries: 0,
            isAutomatic: entry.isAutomatic,
          };
        }
        breakdownByTechnician[techBreakdownKey].minutes += entry.minutes;
        breakdownByTechnician[techBreakdownKey].entries += 1;
        
        // Build technician summary
        if (!technicianSummaryMap[entry.technicianId]) {
          technicianSummaryMap[entry.technicianId] = {
            technicianId: entry.technicianId,
            technicianName: entry.technicianName,
            efetivo: 0,
            adicional: 0,
            perda: 0,
            total: 0,
          };
        }
        technicianSummaryMap[entry.technicianId][entry.category as 'efetivo' | 'adicional' | 'perda'] += entry.minutes;
        technicianSummaryMap[entry.technicianId].total += entry.minutes;
      }
      
      // Sort technician summary by name
      const technicianSummary = Object.values(technicianSummaryMap).sort((a, b) => 
        a.technicianName.localeCompare(b.technicianName)
      );
      
      // Sort breakdown by technician name, then category, then activity name
      const sortedBreakdownByTechnician = Object.values(breakdownByTechnician).sort((a, b) => {
        const nameCompare = a.technicianName.localeCompare(b.technicianName);
        if (nameCompare !== 0) return nameCompare;
        const categoryOrder = { efetivo: 0, adicional: 1, perda: 2 };
        const catCompare = (categoryOrder[a.category as keyof typeof categoryOrder] || 0) - 
                          (categoryOrder[b.category as keyof typeof categoryOrder] || 0);
        if (catCompare !== 0) return catCompare;
        return a.activityName.localeCompare(b.activityName);
      });
      
      res.json({
        period: {
          month: monthNum,
          year: yearNum,
          startDate,
          endDate,
        },
        totals,
        percentages,
        totalMinutes,
        breakdown: Object.values(breakdown),
        breakdownByTechnician: sortedBreakdownByTechnician,
        technicianSummary,
        entries,
      });
    } catch (error: any) {
      console.error("Time breakdown report error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Location Breakdown Report — horas por categoria (efetivo/adicional/perda) × Local de Realização ("Executado em")
  app.get("/api/reports/location-breakdown", authMiddleware, reportsScopeMiddleware, async (req: AuthRequest, res) => {
    try {
      const { technicianId, userId, startDate: startDateStr, endDate: endDateStr } = req.query;

      if (!startDateStr || !endDateStr) {
        return res.status(400).json({ error: "startDate and endDate are required" });
      }

      const startDate = new Date(startDateStr as string);
      const endDate = new Date(endDateStr as string);
      startDate.setUTCHours(0, 0, 0, 0);
      endDate.setUTCHours(23, 59, 59, 999);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return res.status(400).json({ error: "Invalid date format" });
      }

      const conditions = [
        gte(timeEntries.workDate, startDate),
        lte(timeEntries.workDate, endDate),
      ];

      // Scope: assistente vê apenas o próprio técnico; admin pode filtrar por técnico ou ver todos
      if (userId) {
        const [technician] = await db
          .select()
          .from(technicians)
          .where(eq(technicians.userId, userId as string))
          .limit(1);
        if (technician) {
          conditions.push(eq(timeEntries.technicianId, technician.id));
        } else {
          return res.json({
            period: { startDate, endDate },
            categories: [],
            byLocation: [],
            byCategorization: [],
            grandTotalMinutes: 0,
            technicianSummary: [],
          });
        }
      } else if (technicianId && technicianId !== "all") {
        conditions.push(eq(timeEntries.technicianId, technicianId as string));
      }

      const entries = await db
        .select({
          technicianId: timeEntries.technicianId,
          technicianName: technicians.name,
          category: timeEntries.category,
          location: timeEntries.location,
          activityTypeId: timeEntries.activityTypeId,
          minutes: timeEntries.minutes,
        })
        .from(timeEntries)
        .innerJoin(technicians, eq(timeEntries.technicianId, technicians.id))
        .where(and(...conditions));

      // Mapa de tipos de atividade para resolver a categorização (subcategoria herda do pai)
      const allTypes = await db.select().from(activityTypes);
      const typeMap = new Map(allTypes.map((t: any) => [t.id, t]));
      const categorizationLabels: Record<string, string> = {
        administrativo: "Administrativo",
        visita_tecnica: "Visita Técnica",
        deslocamento: "Deslocamento",
        qualificacao: "Qualificação",
        ociosidade: "Ociosidade",
      };
      const NO_CATEGORIZATION = "Não informado";
      const resolveCategorization = (activityTypeId: string): string => {
        const t: any = typeMap.get(activityTypeId);
        if (!t) return NO_CATEGORIZATION;
        const parent: any = t.parentId ? typeMap.get(t.parentId) : null;
        const value = (parent ? parent.categorization : t.categorization) as string | null;
        if (!value) return NO_CATEGORIZATION;
        return categorizationLabels[value] || value;
      };

      const NO_LOCATION = "Não informado";
      const categoryOrder = ["efetivo", "adicional", "perda"] as const;

      // Resolve o "Local de Realização" de forma consistente com a categorização:
      // quando o tipo (ou o pai, no caso de subcategoria) tem UM único local configurado,
      // esse local é autoritativo e reflete a configuração atual do tipo — mesmo para
      // lançamentos antigos cujo location não foi gravado. Se o tipo tiver vários locais
      // possíveis, usa o local efetivamente registrado na hora; senão, "Não informado".
      const resolveLocation = (activityTypeId: string, recordedLocation: string | null): string => {
        const t: any = typeMap.get(activityTypeId);
        if (t) {
          const source: any = t.parentId ? (typeMap.get(t.parentId) ?? t) : t;
          const locs: string[] = Array.isArray(source.locations)
            ? source.locations.filter((l: string) => l && l.trim())
            : [];
          if (locs.length === 1) return locs[0].trim();
        }
        if (recordedLocation && recordedLocation.trim()) return recordedLocation.trim();
        return NO_LOCATION;
      };

      // Agrega: categoria -> local -> minutos
      const catMap: Record<string, { total: number; locations: Record<string, number> }> = {};
      const byLocationMap: Record<string, number> = {};
      const byCategorizationMap: Record<string, number> = {};
      const techMap: Record<string, { technicianId: string; technicianName: string; total: number }> = {};
      let grandTotalMinutes = 0;

      for (const e of entries) {
        const cat = e.category as string;
        const loc = resolveLocation(e.activityTypeId, e.location);
        if (!catMap[cat]) catMap[cat] = { total: 0, locations: {} };
        catMap[cat].total += e.minutes;
        catMap[cat].locations[loc] = (catMap[cat].locations[loc] || 0) + e.minutes;
        byLocationMap[loc] = (byLocationMap[loc] || 0) + e.minutes;
        const categ = resolveCategorization(e.activityTypeId);
        byCategorizationMap[categ] = (byCategorizationMap[categ] || 0) + e.minutes;
        grandTotalMinutes += e.minutes;
        if (!techMap[e.technicianId]) {
          techMap[e.technicianId] = { technicianId: e.technicianId, technicianName: e.technicianName, total: 0 };
        }
        techMap[e.technicianId].total += e.minutes;
      }

      const categories = categoryOrder
        .filter((cat) => catMap[cat])
        .map((cat) => ({
          category: cat,
          totalMinutes: catMap[cat].total,
          locations: Object.entries(catMap[cat].locations)
            .map(([location, minutes]) => ({ location, minutes }))
            .sort((a, b) => b.minutes - a.minutes),
        }));

      const byLocation = Object.entries(byLocationMap)
        .map(([location, minutes]) => ({
          location,
          minutes,
          percentage: grandTotalMinutes > 0 ? (minutes / grandTotalMinutes) * 100 : 0,
        }))
        .sort((a, b) => b.minutes - a.minutes);

      const byCategorization = Object.entries(byCategorizationMap)
        .map(([categorization, minutes]) => ({
          categorization,
          minutes,
          percentage: grandTotalMinutes > 0 ? (minutes / grandTotalMinutes) * 100 : 0,
        }))
        .sort((a, b) => b.minutes - a.minutes);

      const technicianSummary = Object.values(techMap).sort((a, b) =>
        a.technicianName.localeCompare(b.technicianName)
      );

      res.json({
        period: { startDate, endDate },
        categories,
        byLocation,
        byCategorization,
        grandTotalMinutes,
        technicianSummary,
      });
    } catch (error: any) {
      console.error("Location breakdown report error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Reschedule Statistics Report
  app.get("/api/reports/reschedule-stats", authMiddleware, reportsScopeMiddleware, async (req: AuthRequest, res) => {
    try {
      const { startDate: startDateStr, endDate: endDateStr, technicianId, userId } = req.query;
      
      if (!startDateStr || !endDateStr) {
        return res.status(400).json({ error: "startDate and endDate are required" });
      }
      
      const startDate = new Date(startDateStr as string);
      const endDate = new Date(endDateStr as string);
      // Use UTC boundaries to stay consistent with how dates are stored/compared
      startDate.setUTCHours(0, 0, 0, 0);
      endDate.setUTCHours(23, 59, 59, 999);
      
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return res.status(400).json({ error: "Invalid date format" });
      }
      
      // Build technician filter condition
      let technicianFilter: ReturnType<typeof eq> | undefined = undefined;
      
      // If userId is set by reportsScopeMiddleware (for assistente role), find their technician
      if (userId) {
        const [technician] = await db
          .select()
          .from(technicians)
          .where(eq(technicians.userId, userId as string))
          .limit(1);
        
        if (technician) {
          technicianFilter = eq(activities.technicianId, technician.id);
        } else {
          // No technician profile found, return empty data
          return res.json({
            totalReschedules: 0,
            activitiesRescheduled: 0,
            activitiesWithMultipleReschedules: 0,
            reasonBreakdown: [],
            reschedules: [],
          });
        }
      } else if (technicianId && technicianId !== "all") {
        technicianFilter = eq(activities.technicianId, technicianId as string);
      }
      
      // Get all reschedules in the period
      const reschedules = await db
        .select({
          id: activityReschedules.id,
          activityId: activityReschedules.activityId,
          previousDate: activityReschedules.previousDate,
          newDate: activityReschedules.newDate,
          reason: activityReschedules.reason,
          rescheduledAt: activityReschedules.createdAt,
          rescheduleNumber: activityReschedules.rescheduleNumber,
          rescheduledBy: activityReschedules.rescheduledBy,
          rescheduledByName: users.name,
          activityTitle: activities.title,
          clientName: activities.clientName,
          technicianId: activities.technicianId,
          technicianName: technicians.name,
        })
        .from(activityReschedules)
        .leftJoin(activities, eq(activityReschedules.activityId, activities.id))
        .leftJoin(users, eq(activityReschedules.rescheduledBy, users.id))
        .leftJoin(technicians, eq(activities.technicianId, technicians.id))
        .where(
          and(
            // A reschedule belongs to the period if the activity's previous OR new
            // scheduled date falls within it (NOT the moment the action was logged).
            // This way a reschedule moving 19→20 won't show up in a 01–18 report.
            or(
              and(
                gte(activityReschedules.previousDate, startDate),
                lte(activityReschedules.previousDate, endDate)
              ),
              and(
                gte(activityReschedules.newDate, startDate),
                lte(activityReschedules.newDate, endDate)
              )
            ),
            technicianFilter
          )
        )
        .orderBy(desc(activityReschedules.createdAt));
      
      // Get activities that have been rescheduled (unique activities)
      const uniqueActivityIds = Array.from(new Set(reschedules.map(r => r.activityId)));
      
      // Calculate stats
      const totalReschedules = reschedules.length;
      const activitiesRescheduled = uniqueActivityIds.length;
      
      const reasonStats: Record<string, number> = {};
      for (const r of reschedules) {
        const reason = r.reason?.trim() || 'Sem motivo informado';
        reasonStats[reason] = (reasonStats[reason] || 0) + 1;
      }
      
      // Activities with multiple reschedules
      const multipleRescheduleCounts = reschedules.reduce((acc, r) => {
        acc[r.activityId] = (acc[r.activityId] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      const activitiesWithMultipleReschedules = Object.values(multipleRescheduleCounts).filter(c => c > 1).length;
      
      res.json({
        totalReschedules,
        activitiesRescheduled,
        activitiesWithMultipleReschedules,
        reasonBreakdown: Object.entries(reasonStats).map(([reason, count]) => ({ reason, count })),
        reschedules: reschedules.map(r => ({
          id: r.id,
          activityId: r.activityId,
          activityTitle: r.activityTitle,
          clientName: r.clientName,
          technicianName: r.technicianName,
          previousDate: r.previousDate,
          newDate: r.newDate,
          reason: r.reason,
          rescheduledAt: r.rescheduledAt,
          rescheduleNumber: r.rescheduleNumber,
          rescheduledByName: r.rescheduledByName,
        })),
      });
    } catch (error: any) {
      console.error("Reschedule stats report error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // OneSignal Push Notifications Routes
  app.post("/api/notifications/subscribe", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const subscriptionData = insertUserPushSubscriptionSchema.extend({
        playerId: insertUserPushSubscriptionSchema.shape.playerId,
      }).parse({
        ...req.body,
        userId: req.user!.userId,
      });

      await storage.upsertPushSubscription({
        userId: subscriptionData.userId,
        playerId: subscriptionData.playerId,
        deviceType: "web",
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error("Push subscription error:", error);
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/notifications", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const notifications = await storage.getUserNotifications(req.user!.userId);
      res.json(notifications);
    } catch (error: any) {
      console.error("Get notifications error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/notifications/:id/read", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const notificationId = req.params.id;
      
      await storage.markNotificationAsRead(notificationId, req.user!.userId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Mark notification read error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/notifications/read-all", authMiddleware, async (req: AuthRequest, res) => {
    try {
      await storage.markAllNotificationsAsRead(req.user!.userId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Mark all notifications read error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/notifications/send", authMiddleware, roleMiddleware(["admin"]), async (req: AuthRequest, res) => {
    try {
      const notificationData = insertNotificationSchema.omit({ isRead: true, sentToPush: true }).parse(req.body);

      const { sendPushNotification } = await import("./services/onesignal");
      
      // Parse data if it's a JSON string, otherwise use as object
      let parsedData = undefined;
      if (notificationData.data) {
        try {
          parsedData = typeof notificationData.data === 'string' 
            ? JSON.parse(notificationData.data) 
            : notificationData.data;
        } catch {
          parsedData = notificationData.data;
        }
      }
      
      await sendPushNotification({
        userId: notificationData.userId,
        title: notificationData.title,
        message: notificationData.message,
        type: notificationData.type,
        data: parsedData,
        url: req.body.url,
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error("Send notification error:", error);
      res.status(400).json({ error: error.message });
    }
  });

  // Check-in/Check-out routes
  app.post("/api/activities/:id/checkin", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { latitude, longitude } = req.body;
      const now = new Date();
      console.log(`🔵 CHECK-IN - Activity ID: ${req.params.id}, Time: ${now.toISOString()}`);
      
      const activity = await storage.updateActivity(req.params.id, {
        status: "emExecucao",
        checkInTime: now,
        checkInLatitude: latitude?.toString(),
        checkInLongitude: longitude?.toString(),
      });
      
      console.log(`✅ CHECK-IN atualizado:`, { 
        id: activity.id, 
        status: activity.status, 
        checkInTime: activity.checkInTime 
      });
      res.json(activity);
    } catch (error: any) {
      console.error(`❌ Erro no CHECK-IN:`, error);
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/activities/:id/checkout", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { 
        latitude, 
        longitude, 
        workCompleted, 
        travelJustification, 
        actualTravelMinutes,
        adjustedCheckInTime,
        adjustedCheckOutTime,
        travelTimes, // Array of { transportType: string, minutes: number }
        executionMinutes, // User-confirmed execution time in minutes
        lostMinutes // User-confirmed lost time in minutes (when workCompleted=false)
      } = req.body;
      
      const activity = await storage.getActivity(req.params.id);
      
      if (!activity) {
        return res.status(404).json({ error: "Activity not found" });
      }

      // Validate travelTimes array if provided
      const validTransportTypes = ["carro", "moto", "a_pe", "transporte_publico", "aviao"];
      if (travelTimes && Array.isArray(travelTimes)) {
        for (const tt of travelTimes) {
          if (!tt.transportType || !validTransportTypes.includes(tt.transportType)) {
            return res.status(400).json({ 
              error: `Tipo de transporte inválido: ${tt.transportType}. Valores permitidos: ${validTransportTypes.join(", ")}` 
            });
          }
          if (typeof tt.minutes !== 'number' || tt.minutes < 0) {
            return res.status(400).json({ 
              error: "Minutos de deslocamento deve ser um número não-negativo" 
            });
          }
        }
      }

      // VALIDATION: workCompleted and travelJustification are interdependent
      // - If workCompleted is provided, it must be a boolean
      // - If workCompleted is false, travelJustification MUST be provided and non-empty
      // - If workCompleted is true, travelJustification must NOT be provided
      let finalWorkCompleted: boolean | null = null;
      let finalTravelClassification: "adicional" | "perda" | null = null;
      let finalTravelJustification: string | null = null;

      if (workCompleted !== undefined && workCompleted !== null) {
        if (typeof workCompleted !== 'boolean') {
          return res.status(400).json({ 
            error: "workCompleted deve ser um valor booleano (true ou false)" 
          });
        }

        finalWorkCompleted = workCompleted;

        // Derive travelClassification automatically from workCompleted
        // This ensures server-side control and prevents client manipulation
        if (workCompleted === true) {
          finalTravelClassification = "adicional";
          // Justification is not allowed when work was completed
          if (travelJustification) {
            return res.status(400).json({
              error: "Justificativa não deve ser fornecida quando o trabalho foi realizado"
            });
          }
        } else {
          finalTravelClassification = "perda";
          // Justification is MANDATORY when work was NOT completed
          if (!travelJustification || travelJustification.trim().length === 0) {
            return res.status(400).json({
              error: "Justificativa é obrigatória quando o trabalho não foi realizado"
            });
          }
          finalTravelJustification = travelJustification.trim();
        }
      }

      // Handle adjusted times (manual correction by technician)
      let finalCheckInTime: Date;
      let finalCheckOutTime: Date;
      let timeWasAdjusted = false;
      
      // Original system-recorded times
      const originalCheckInTime = activity.checkInTime;
      const originalCheckOutTime = new Date();
      
      if (adjustedCheckInTime && adjustedCheckOutTime) {
        // Validate adjusted times
        const adjustedIn = new Date(adjustedCheckInTime);
        const adjustedOut = new Date(adjustedCheckOutTime);
        
        if (isNaN(adjustedIn.getTime()) || isNaN(adjustedOut.getTime())) {
          return res.status(400).json({
            error: "Horários ajustados são inválidos"
          });
        }
        
        if (adjustedOut < adjustedIn) {
          return res.status(400).json({
            error: "Horário de término não pode ser anterior ao horário de início"
          });
        }
        
        if (adjustedOut > new Date()) {
          return res.status(400).json({
            error: "Horário de término não pode ser no futuro"
          });
        }
        
        finalCheckInTime = adjustedIn;
        finalCheckOutTime = adjustedOut;
        timeWasAdjusted = true;
        
        console.log(`📝 CHECKOUT - Horários AJUSTADOS pelo técnico:`, {
          originalCheckIn: originalCheckInTime,
          adjustedCheckIn: finalCheckInTime.toISOString(),
          originalCheckOut: originalCheckOutTime.toISOString(),
          adjustedCheckOut: finalCheckOutTime.toISOString(),
        });
      } else {
        // Use original times
        finalCheckInTime = activity.checkInTime ? new Date(activity.checkInTime) : new Date();
        finalCheckOutTime = new Date();
      }

      console.log(`🟡 CHECKOUT - Activity antes do checkout:`, {
        id: activity.id,
        status: activity.status,
        checkInTime: activity.checkInTime,
        checkOutTime: activity.checkOutTime,
        workCompleted: finalWorkCompleted,
        travelClassification: finalTravelClassification,
        timeWasAdjusted,
      });

      // Calculate duration using final times (may be adjusted)
      // Only set actualDurationMinutes when work was completed; for not-completed, leave as null
      let durationMinutes: number | null = null;
      
      if (finalWorkCompleted === true) {
        // Use user-provided executionMinutes if available, otherwise calculate from timestamps
        const parsedExecution = typeof executionMinutes === 'number' ? executionMinutes : 
                                typeof executionMinutes === 'string' ? parseInt(executionMinutes, 10) : NaN;
        
        if (!isNaN(parsedExecution) && parsedExecution >= 0) {
          durationMinutes = parsedExecution;
          console.log(`🟡 CHECKOUT - Usando tempo de execução fornecido pelo usuário: ${durationMinutes}min`);
        } else {
          durationMinutes = Math.round((finalCheckOutTime.getTime() - finalCheckInTime.getTime()) / 60000);
          console.log(`🟡 CHECKOUT - Tempo de execução calculado: ${durationMinutes}min`);
        }
        
        if (durationMinutes < 0) {
          durationMinutes = 0;
          console.warn(`⚠️ CHECKOUT - Duração negativa calculada! Usando 0.`);
        }
      } else {
        const parsedLost = typeof lostMinutes === 'number' ? lostMinutes : 
                           typeof lostMinutes === 'string' ? parseInt(lostMinutes, 10) : NaN;
        if (!isNaN(parsedLost) && parsedLost >= 0) {
          durationMinutes = parsedLost;
          console.log(`🟡 CHECKOUT - Trabalho não realizado, usando lostMinutes como duração: ${parsedLost}min`);
        } else {
          durationMinutes = Math.round((finalCheckOutTime.getTime() - finalCheckInTime.getTime()) / 60000);
          console.log(`🟡 CHECKOUT - Trabalho não realizado, usando tempo calculado: ${durationMinutes}min`);
        }
      }

      console.log(`🟡 CHECKOUT - Updating with checkOutTime: ${finalCheckOutTime.toISOString()}, Duration: ${durationMinutes}min`);
      
      // Only update actualTravelMinutes if explicitly provided (don't overwrite existing value)
      const updateData: any = {
        status: "concluido",
        checkInTime: finalCheckInTime,
        checkOutTime: finalCheckOutTime,
        checkOutLatitude: latitude?.toString(),
        checkOutLongitude: longitude?.toString(),
        actualDurationMinutes: durationMinutes,
        workCompleted: finalWorkCompleted,
        travelClassification: finalTravelClassification,
        travelJustification: finalTravelJustification,
      };
      
      // Only set actualTravelMinutes if provided - don't overwrite existing value from IDA registration
      if (actualTravelMinutes !== undefined && actualTravelMinutes !== null) {
        updateData.actualTravelMinutes = actualTravelMinutes;
      }
      
      const updatedActivity = await storage.updateActivity(req.params.id, updateData);
      
      // Save travel times by transport type if provided
      if (travelTimes && Array.isArray(travelTimes) && travelTimes.length > 0) {
        try {
          // First, delete any existing travel times for this activity
          await db.delete(activityTravelTimes).where(eq(activityTravelTimes.activityId, req.params.id));
          
          // Insert new travel times
          for (const tt of travelTimes) {
            if (tt.transportType && tt.minutes > 0) {
              await db.insert(activityTravelTimes).values({
                activityId: req.params.id,
                transportType: tt.transportType,
                minutes: tt.minutes,
              });
            }
          }
          
          // Calculate total travel time from all transport types
          const totalManualTravelMinutes = travelTimes.reduce((sum: number, tt: any) => sum + (tt.minutes || 0), 0);
          if (totalManualTravelMinutes > 0) {
            await storage.updateActivity(req.params.id, {
              actualTravelMinutes: totalManualTravelMinutes,
            });
          }
          
          console.log(`✅ Saved ${travelTimes.length} travel time entries for activity ${req.params.id}`);
        } catch (travelError) {
          console.error("⚠️ Error saving travel times:", travelError);
        }
      }
      
      // Create audit log if time was adjusted
      if (timeWasAdjusted && req.user) {
        try {
          const auditChanges = JSON.stringify({
            action: "time_adjustment",
            original: {
              checkInTime: originalCheckInTime,
              checkOutTime: originalCheckOutTime.toISOString(),
            },
            adjusted: {
              checkInTime: finalCheckInTime.toISOString(),
              checkOutTime: finalCheckOutTime.toISOString(),
            },
            adjustedBy: req.user.userId,
            adjustedAt: new Date().toISOString(),
          });
          
          await db.insert(auditLogs).values({
            userId: req.user.userId,
            action: "activity_time_adjusted",
            entityType: "activity",
            entityId: activity.id,
            changes: auditChanges,
          });
          
          console.log(`📝 Audit log criado para ajuste de horário da atividade ${activity.id}`);
        } catch (auditError) {
          console.error("⚠️ Erro ao criar audit log:", auditError);
        }
      }
      
      console.log(`✅ CHECKOUT atualizado:`, {
        id: updatedActivity.id,
        status: updatedActivity.status,
        checkInTime: updatedActivity.checkInTime,
        checkOutTime: updatedActivity.checkOutTime,
        actualDurationMinutes: updatedActivity.actualDurationMinutes,
        workCompleted: finalWorkCompleted,
        travelClassification: finalTravelClassification,
      });

      const activityType = await storage.getActivityType(activity.activityTypeId);
      
      // AUTO-CREATE PENDING RAT if activity requires it
      const typesRequiringRat = [
        "Visita técnica (corretiva ou RCs)",
        "Visitas técnicas (Preventiva ou teste)",
        "Preventivas",
        "Teste",
        "Reclamação",
        "Visitas técnicas"
      ];
      
      let parentRequiresRat = false;
      if (activityType?.parentId) {
        const parentType = await storage.getActivityType(activityType.parentId);
        if (parentType?.requiresRat) {
          parentRequiresRat = true;
        }
      }
      
      const shouldCreateRat = finalWorkCompleted === true && activityType && (
        activityType.requiresRat === true || parentRequiresRat || typesRequiringRat.some(t => t.trim() === activityType.name.trim())
      );
      
      if (shouldCreateRat) {
        try {
          // Check if RAT already exists for this activity
          const existingRats = await db.select().from(rats).where(eq(rats.activityId, activity.id));
          
          if (existingRats.length === 0 && activity.technicianId) {
            // Create pending RAT automatically
            const reportNumber = await storage.getNextRatNumber();
            
            await storage.createRat({
              activityId: activity.id,
              technicianId: activity.technicianId,
              formData: JSON.stringify({}),
              reportNumber: reportNumber,
              status: "pendente",
              clientName: activity.clientName || "",
              openDate: new Date(),
            });
            
            console.log(`📋 RAT pendente criada automaticamente para atividade ${activity.id}`);
          }
        } catch (ratError) {
          console.error("⚠️ Error auto-creating RAT:", ratError);
        }
      }
      
      // 1. Create time entry for TRAVEL TIME (IDA)
      // PRIORITY: Use actualTravelMinutes (real time reported by technician) if available
      // FALLBACK: Use estimatedTravelMinutes (GPS estimate) if no real time recorded
      // RULE: For EFETIVO work that was completed, travel time is "adicional" (productive travel)
      //       For work NOT completed, travel time is "perda" (wasted travel)
      const idaTravelMinutes = activity.actualTravelMinutes || activity.estimatedTravelMinutes || 0;
      
      if (idaTravelMinutes > 0) {
        try {
          // Travel time classification for EFETIVO activities:
          // - If activity type is "efetivo" AND work was completed → travel is "adicional"
          // - If work was NOT completed → travel is "perda"
          // - For other activity types, use their own category
          let travelCategory: "efetivo" | "adicional" | "perda";
          
          if (activityType?.category === "efetivo" && finalWorkCompleted !== false) {
            // Efetivo + work completed = travel is ADICIONAL (productive travel for effective work)
            travelCategory = "adicional";
          } else if (finalWorkCompleted === false) {
            // Work NOT completed = travel is PERDA
            travelCategory = "perda";
          } else if (finalTravelClassification) {
            // Use explicit classification if provided
            travelCategory = finalTravelClassification;
          } else {
            // Default based on activity type category
            travelCategory = activityType?.category === "adicional" ? "adicional" : 
                            activityType?.category === "perda" ? "perda" : "adicional";
          }
          
          // Build notes for travel entry
          let travelNotes = `Tempo de IDA até ${activity.clientName || 'cliente'}: ${idaTravelMinutes}min`;
          if (activity.actualTravelMinutes) {
            travelNotes += ` (informado pelo técnico)`;
          } else {
            travelNotes += ` (estimativa GPS)`;
          }
          if (finalWorkCompleted === false && finalTravelJustification) {
            travelNotes += ` | Trabalho NÃO realizado - Justificativa: ${finalTravelJustification}`;
          } else if (finalWorkCompleted === true || finalWorkCompleted === undefined) {
            travelNotes += ` | Deslocamento produtivo`;
          }
          
          // Use source "ida_travel" to identify IDA travel entries
          // Use noon UTC to prevent timezone offset from shifting the date
          const idaWorkDateStr = new Date(activity.scheduledDate).toISOString().split('T')[0];
          await db.insert(timeEntries).values({
            technicianId: activity.technicianId,
            activityTypeId: activity.activityTypeId,
            workDate: new Date(idaWorkDateStr + 'T12:00:00Z'),
            minutes: idaTravelMinutes,
            category: travelCategory,
            source: "ida_travel",
            location: 'Trajeto',
            notes: travelNotes,
            createdBy: req.user!.userId,
          });
          
          console.log(`✅ Time entry IDA criado: ${idaTravelMinutes}min de ${travelCategory} (tipo atividade: ${activityType?.category})`);
        } catch (travelError) {
          console.error("⚠️ Erro ao criar time entry de IDA:", travelError);
        }
      }
      
      // 2. Create time entry for WORK TIME (checkIn → checkOut)
      // When work was completed: category follows activity type (efetivo/adicional)
      // When work was NOT completed: category is always "perda" (tempo não produtivo)
      if (durationMinutes !== null && durationMinutes > 0 && activityType) {
        if (activityType.category === "efetivo" || activityType.category === "adicional" || activityType.category === "perda") {
          try {
            const execWorkDateStr = new Date(activity.scheduledDate).toISOString().split('T')[0];
            const workDate = new Date(execWorkDateStr + 'T12:00:00Z');
            
            let timeEntryCategory: "efetivo" | "adicional" | "perda";
            if (finalWorkCompleted === false) {
              timeEntryCategory = "perda";
            } else if (activityType.category === "efetivo") {
              timeEntryCategory = "efetivo";
            } else if (activityType.category === "adicional") {
              timeEntryCategory = "adicional";
            } else {
              timeEntryCategory = "perda";
            }
            
            const notes = finalWorkCompleted === false
              ? `Tempo não produtivo - ${activity.clientName || 'sem nome'}${finalTravelJustification ? ` | Motivo: ${finalTravelJustification}` : ''}`
              : `Tempo de execução da atividade ${activity.clientName || 'sem nome'}`;
            
            await db.insert(timeEntries).values({
              technicianId: activity.technicianId,
              activityTypeId: activity.activityTypeId,
              workDate: workDate,
              minutes: durationMinutes,
              category: timeEntryCategory,
              source: "timer",
              location: (activity as any).location ?? null,
              notes: notes,
              createdBy: req.user!.userId,
              agendaActivityId: activity.id,
            }).onConflictDoNothing({ target: timeEntries.agendaActivityId });
            
            console.log(`✅ Time entry EXECUÇÃO criado: ${durationMinutes}min de ${timeEntryCategory} (workCompleted=${finalWorkCompleted})`);
          } catch (timeEntryError) {
            console.error("⚠️ Erro ao criar time entry de execução:", timeEntryError);
          }
        }
      }
      
      // 2b. Create time entry for LOST TIME (when work was NOT completed and lostMinutes provided)
      if (finalWorkCompleted === false && activityType) {
        const parsedLostMinutes = typeof lostMinutes === 'number' ? lostMinutes :
                                  typeof lostMinutes === 'string' ? parseInt(lostMinutes, 10) : NaN;
        
        if (!isNaN(parsedLostMinutes) && parsedLostMinutes > 0) {
          try {
            const lostWorkDateStr = new Date(activity.scheduledDate).toISOString().split('T')[0];
            const workDate = new Date(lostWorkDateStr + 'T12:00:00Z');
            const notes = `Tempo não produtivo - ${activity.clientName || 'sem nome'}${finalTravelJustification ? ` | Motivo: ${finalTravelJustification}` : ''}`;
            
            await db.insert(timeEntries).values({
              technicianId: activity.technicianId,
              activityTypeId: activity.activityTypeId,
              workDate: workDate,
              minutes: parsedLostMinutes,
              category: "perda",
              source: "timer",
              location: (activity as any).location ?? null,
              notes: notes,
              createdBy: req.user!.userId,
              agendaActivityId: activity.id,
            }).onConflictDoNothing({ target: timeEntries.agendaActivityId });
            
            console.log(`✅ Time entry PERDA criado: ${parsedLostMinutes}min (trabalho não realizado)`);
          } catch (lostTimeError) {
            console.error("⚠️ Erro ao criar time entry de perda:", lostTimeError);
          }
        }
      }
      
      // 3. RECLASSIFICATION LOGIC: When this activity is completed successfully,
      // check if previous activity in the same day was "não realizado" (not completed).
      // If so, the VOLTA (return) time from that previous activity should be reclassified
      // from "perda" to "adicional" because the travel ended up being productive
      // (it led to THIS activity being completed).
      if (finalWorkCompleted !== false) {
        try {
          // Find previous activities in the same day for the same technician
          const activityDate = new Date(activity.scheduledDate);
          const startOfDay = new Date(activityDate);
          startOfDay.setHours(0, 0, 0, 0);
          const endOfDay = new Date(activityDate);
          endOfDay.setHours(23, 59, 59, 999);
          
          // Get all completed activities from the same day, ordered by scheduled time
          const sameDayActivities = await db
            .select()
            .from(activities)
            .where(
              and(
                eq(activities.technicianId, activity.technicianId),
                gte(activities.scheduledDate, startOfDay),
                lte(activities.scheduledDate, endOfDay),
                eq(activities.status, "concluido"),
                ne(activities.id, activity.id) // Exclude current activity
              )
            )
            .orderBy(activities.scheduledDate);
          
          // Find the activity immediately before this one that was NOT completed
          const previousNotCompleted = sameDayActivities.filter(a => 
            a.workCompleted === false && 
            new Date(a.scheduledDate) < new Date(activity.scheduledDate)
          );
          
          if (previousNotCompleted.length > 0) {
            // Get the most recent one (closest to current activity)
            const prevActivity = previousNotCompleted[previousNotCompleted.length - 1];
            
            // Reclassify VOLTA time entries from "perda" to "adicional"
            // because the travel led to productive work in THIS activity
            const reclassifyResult = await db
              .update(timeEntries)
              .set({ 
                category: "adicional",
                notes: sql`${timeEntries.notes} || ' | Reclassificado: deslocamento resultou em trabalho produtivo na próxima atividade'`
              })
              .where(
                and(
                  eq(timeEntries.technicianId, prevActivity.technicianId),
                  eq(timeEntries.activityTypeId, prevActivity.activityTypeId),
                  eq(timeEntries.source, "volta_travel"),
                  eq(timeEntries.category, "perda"),
                  gte(timeEntries.workDate, startOfDay),
                  lte(timeEntries.workDate, endOfDay)
                )
              )
              .returning();
            
            if (reclassifyResult.length > 0) {
              console.log(`🔄 Reclassificado ${reclassifyResult.length} time entry(ies) de VOLTA de perda → adicional (atividade anterior: ${prevActivity.clientName})`);
            }
          }
        } catch (reclassifyError) {
          console.error("⚠️ Erro ao reclassificar time entries:", reclassifyError);
          // Non-blocking error - don't fail the checkout
        }
      }
      
      res.json(updatedActivity);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ============================================
  // V3: Navigation and Time Records Routes
  // ============================================

  // Start navigation - captures ETA and changes status to "aCaminho" (navegando)
  app.post("/api/activities/:id/navigation/start", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { originLatLng, destLatLng, gpsEtaMinutes, date } = req.body;
      
      const activity = await storage.getActivity(req.params.id);
      if (!activity) {
        return res.status(404).json({ error: "Activity not found" });
      }
      
      const isMultiDay = !!(activity.endDate);
      
      const technician = await storage.getTechnicianByUserId(req.user!.userId);
      if (!technician || (req.user!.role !== "admin" && activity.technicianId !== technician.id)) {
        return res.status(403).json({ error: "Não autorizado a iniciar navegação desta atividade" });
      }
      
      const now = new Date();
      
      if (isMultiDay) {
        const targetDate = date ? new Date(date + 'T00:00:00.000Z') : new Date();
        targetDate.setUTCHours(0, 0, 0, 0);
        const nextDay = new Date(targetDate);
        nextDay.setDate(nextDay.getDate() + 1);
        
        const [existingDayStatus] = await db
          .select()
          .from(activityDayStatus)
          .where(
            and(
              eq(activityDayStatus.activityId, req.params.id),
              gte(activityDayStatus.date, targetDate),
              lt(activityDayStatus.date, nextDay)
            )
          )
          .limit(1);
        
        if (existingDayStatus && (existingDayStatus.status === 'concluido' || existingDayStatus.status === 'emExecucao')) {
          return res.status(400).json({ 
            error: `Não é possível iniciar navegação. Status do dia: ${existingDayStatus.status}` 
          });
        }
        
        if (existingDayStatus) {
          await db
            .update(activityDayStatus)
            .set({ status: 'aCaminho', updatedAt: now })
            .where(eq(activityDayStatus.id, existingDayStatus.id));
        } else {
          await db
            .insert(activityDayStatus)
            .values({
              activityId: req.params.id,
              date: targetDate,
              status: 'aCaminho',
            });
        }
        
        // Update navigation time on the activity but do NOT change main status
        await storage.updateActivity(req.params.id, {
          navigationStartTime: now,
          navigationEtaMinutes: gpsEtaMinutes || null,
        });
      } else {
        // For single-day activities: validate and update main activity status
        if (activity.status !== "planejado") {
          return res.status(400).json({ 
            error: `Não é possível iniciar navegação. Status atual: ${activity.status}. Esperado: planejado` 
          });
        }
        
        // Check if technician already has another activity in "aCaminho" status
        const existingNavigating = await db
          .select()
          .from(activities)
          .where(
            and(
              eq(activities.technicianId, activity.technicianId),
              eq(activities.status, "aCaminho"),
              ne(activities.id, activity.id)
            )
          )
          .limit(1);
        
        if (existingNavigating.length > 0) {
          return res.status(400).json({ 
            error: "Já existe outra atividade em navegação. Finalize-a antes de iniciar outra." 
          });
        }
        
        await storage.updateActivity(req.params.id, {
          status: "aCaminho",
          navigationStartTime: now,
          navigationEtaMinutes: gpsEtaMinutes || null,
        });
      }
      
      console.log(`✅ Navegação iniciada para atividade ${req.params.id}, ETA: ${gpsEtaMinutes || 'não disponível'}min`);
      
      const refreshedActivity = await storage.getActivity(req.params.id);
      res.json({
        ...refreshedActivity,
        message: "Navegação iniciada com sucesso"
      });
    } catch (error: any) {
      console.error(`❌ Erro ao iniciar navegação:`, error);
      res.status(400).json({ error: error.message });
    }
  });

  // Record travel IDA - records outbound travel time and starts execution
  app.post("/api/activities/:id/travel/ida", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { minutesReported, gpsEtaMinutes, transportType, date } = req.body;
      
      const activity = await storage.getActivity(req.params.id);
      if (!activity) {
        return res.status(404).json({ error: "Activity not found" });
      }
      
      const isMultiDay = !!(activity.endDate);
      
      if (!isMultiDay) {
        if (activity.status !== "aCaminho" && activity.status !== "planejado") {
          return res.status(400).json({ 
            error: `Não é possível registrar tempo de IDA. Status atual: ${activity.status}. Esperado: aCaminho ou planejado` 
          });
        }
      }
      
      if (typeof minutesReported !== 'number' || minutesReported < 0) {
        return res.status(400).json({ error: "minutesReported deve ser um número não-negativo" });
      }
      
      const validTransportTypes = ["carro", "moto", "a_pe", "transporte_publico", "aviao"];
      if (transportType && !validTransportTypes.includes(transportType)) {
        return res.status(400).json({ 
          error: `Tipo de transporte inválido. Valores permitidos: ${validTransportTypes.join(", ")}` 
        });
      }
      
      if (isMultiDay) {
        const targetDate = date ? new Date(date + 'T00:00:00.000Z') : new Date();
        targetDate.setUTCHours(0, 0, 0, 0);
        const nextDay = new Date(targetDate);
        nextDay.setDate(nextDay.getDate() + 1);
        const targetDateStr = targetDate.toISOString().split('T')[0];
        
        const existingRecord = await db
          .select()
          .from(activityTimeRecords)
          .where(
            and(
              eq(activityTimeRecords.activityId, activity.id),
              eq(activityTimeRecords.recordType, "ida"),
              sql`DATE(${activityTimeRecords.finishedAt}) = ${targetDateStr}`
            )
          )
          .limit(1);
        
        if (existingRecord.length > 0) {
          return res.status(409).json({ 
            error: "Tempo de IDA já registrado para este dia",
            existingRecord: existingRecord[0]
          });
        }
        
        const [timeRecord] = await db.insert(activityTimeRecords).values({
          activityId: activity.id,
          recordType: "ida",
          minutesReported,
          gpsEtaMinutes: gpsEtaMinutes || null,
          transportType: transportType || null,
          startedAt: activity.navigationStartTime,
          finishedAt: new Date(),
        }).returning();
        
        const now = new Date();
        console.log(`🔄 [Multi-dia] Atualizando day status para emExecucao, data: ${targetDateStr}`);
        
        const [existingDayStatus] = await db
          .select()
          .from(activityDayStatus)
          .where(
            and(
              eq(activityDayStatus.activityId, req.params.id),
              gte(activityDayStatus.date, targetDate),
              lt(activityDayStatus.date, nextDay)
            )
          )
          .limit(1);
        
        if (existingDayStatus) {
          await db
            .update(activityDayStatus)
            .set({ status: 'emExecucao', checkInTime: now, updatedAt: now })
            .where(eq(activityDayStatus.id, existingDayStatus.id));
        } else {
          await db
            .insert(activityDayStatus)
            .values({
              activityId: req.params.id,
              date: targetDate,
              status: 'emExecucao',
              checkInTime: now,
            });
        }
        
        await db.update(activities)
          .set({
            checkInTime: now,
            idaRecordedAt: now,
            actualTravelMinutes: minutesReported,
            updatedAt: now,
          })
          .where(eq(activities.id, req.params.id));
      } else {
        // For single-day: check for existing IDA record
        const existingRecord = await db
          .select()
          .from(activityTimeRecords)
          .where(
            and(
              eq(activityTimeRecords.activityId, activity.id),
              eq(activityTimeRecords.recordType, "ida")
            )
          )
          .limit(1);
        
        if (existingRecord.length > 0) {
          return res.status(409).json({ 
            error: "Tempo de IDA já registrado para esta atividade",
            existingRecord: existingRecord[0]
          });
        }
        
        const [timeRecord] = await db.insert(activityTimeRecords).values({
          activityId: activity.id,
          recordType: "ida",
          minutesReported,
          gpsEtaMinutes: gpsEtaMinutes || null,
          transportType: transportType || null,
          startedAt: activity.navigationStartTime,
          finishedAt: new Date(),
        }).returning();
        
        const now = new Date();
        const [updatedActivity] = await db.update(activities)
          .set({
            status: "emExecucao",
            checkInTime: now,
            idaRecordedAt: now,
            actualTravelMinutes: minutesReported,
            updatedAt: now,
          })
          .where(eq(activities.id, req.params.id))
          .returning();
        
        console.log(`✅ actualTravelMinutes salvo: ${updatedActivity.actualTravelMinutes}`);
      }
      
      console.log(`✅ Tempo de IDA registrado: ${minutesReported}min (ETA GPS: ${gpsEtaMinutes || 'N/A'}min)`);
      
      res.json({
        activityStatus: "emExecucao",
        message: "Tempo de IDA registrado e atividade iniciada"
      });
    } catch (error: any) {
      console.error(`❌ Erro ao registrar tempo de IDA:`, error);
      res.status(400).json({ error: error.message });
    }
  });

  // Record return to base - records return travel time after activity completion
  app.post("/api/activities/:id/travel/return-base", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { baseId, minutesReported, gpsEtaMinutes, transportType, date } = req.body;
      
      const activity = await storage.getActivity(req.params.id);
      if (!activity) {
        return res.status(404).json({ error: "Activity not found" });
      }
      
      const isMultiDay = !!(activity.endDate);
      if (!isMultiDay && activity.status !== "concluido") {
        return res.status(400).json({ 
          error: `Não é possível registrar retorno à base. Status atual: ${activity.status}. Esperado: concluido` 
        });
      }
      
      // Validate required fields
      if (typeof minutesReported !== 'number' || minutesReported < 0) {
        return res.status(400).json({ error: "minutesReported deve ser um número não-negativo" });
      }
      
      const validTransportTypes = ["carro", "moto", "a_pe", "transporte_publico", "aviao"];
      if (transportType && !validTransportTypes.includes(transportType)) {
        return res.status(400).json({ 
          error: `Tipo de transporte inválido. Valores permitidos: ${validTransportTypes.join(", ")}` 
        });
      }
      
      // For multi-day activities, use the date parameter; for single-day, use scheduled date
      // Use T12:00:00Z (noon UTC) to prevent timezone offset from shifting the date
      const recordDateStr = date || new Date(activity.scheduledDate).toISOString().split('T')[0];
      const recordDate = new Date(recordDateStr + 'T12:00:00Z');
      const recordDateStart = new Date(recordDateStr + 'T00:00:00Z');
      const recordDateEnd = new Date(recordDateStart);
      recordDateEnd.setDate(recordDateEnd.getDate() + 1);
      
      // Check for existing return_base record for this specific date (idempotency)
      let existingRecordQuery;
      if (isMultiDay && date) {
        // For multi-day: check per-date
        existingRecordQuery = await db
          .select()
          .from(activityTimeRecords)
          .where(
            and(
              eq(activityTimeRecords.activityId, activity.id),
              eq(activityTimeRecords.recordType, "retorno_base"),
              or(
                and(
                  gte(activityTimeRecords.finishedAt, recordDateStart),
                  lt(activityTimeRecords.finishedAt, recordDateEnd)
                ),
                sql`DATE(${activityTimeRecords.createdAt}) = ${recordDateStr}`
              )
            )
          )
          .limit(1);
      } else {
        // For single-day: check globally
        existingRecordQuery = await db
          .select()
          .from(activityTimeRecords)
          .where(
            and(
              eq(activityTimeRecords.activityId, activity.id),
              eq(activityTimeRecords.recordType, "retorno_base")
            )
          )
          .limit(1);
      }
      
      if (existingRecordQuery.length > 0) {
        return res.status(409).json({ 
          error: "Retorno à base já registrado para esta atividade" + (isMultiDay ? ` no dia ${recordDateStr}` : ""),
          existingRecord: existingRecordQuery[0]
        });
      }
      
      // Create return_base time record
      // For multi-day, set finishedAt within the recordDate day for consistent per-day queries
      const now = new Date();
      const finishedAtForRecord = (isMultiDay && date) 
        ? new Date(recordDateStart.getTime() + (now.getHours() * 3600000 + now.getMinutes() * 60000 + now.getSeconds() * 1000))
        : now;
      
      const [timeRecord] = await db.insert(activityTimeRecords).values({
        activityId: activity.id,
        recordType: "retorno_base",
        minutesReported,
        gpsEtaMinutes: gpsEtaMinutes || null,
        transportType: transportType || null,
        baseId: baseId || null,
        startedAt: activity.checkOutTime,
        finishedAt: finishedAtForRecord,
      }).returning();
      
      // Update activity with return base timestamp and actual return minutes
      await storage.updateActivity(req.params.id, {
        returnBaseRecordedAt: new Date(),
        actualReturnMinutes: minutesReported,
      });
      
      // Create time entry for VOLTA (return travel time)
      // Same logic as IDA: for efetivo work completed, travel is "adicional"
      try {
        const activityType = await storage.getActivityType(activity.activityTypeId);
        
        // For multi-day, check workCompleted from the day status
        let dayWorkCompleted = activity.workCompleted;
        if (isMultiDay && date) {
          const [dayStatus] = await db
            .select()
            .from(activityDayStatus)
            .where(
              and(
                eq(activityDayStatus.activityId, activity.id),
                gte(activityDayStatus.date, recordDate),
                lt(activityDayStatus.date, recordDateEnd)
              )
            )
            .limit(1);
          if (dayStatus) {
            dayWorkCompleted = dayStatus.workCompleted;
          }
        }
        
        let voltaCategory: "efetivo" | "adicional" | "perda";
        if (activityType?.category === "efetivo" && dayWorkCompleted !== false) {
          voltaCategory = "adicional";
        } else if (dayWorkCompleted === false) {
          voltaCategory = "perda";
        } else {
          voltaCategory = activityType?.category === "adicional" ? "adicional" : 
                          activityType?.category === "perda" ? "perda" : "adicional";
        }
        
        const voltaNotes = isMultiDay 
          ? `Dia ${recordDateStr} - VOLTA de ${activity.clientName || 'cliente'}: ${minutesReported}min (informado pelo técnico)`
          : `Tempo de VOLTA de ${activity.clientName || 'cliente'}: ${minutesReported}min (informado pelo técnico)`;
        
        await db.insert(timeEntries).values({
          technicianId: activity.technicianId,
          activityTypeId: activity.activityTypeId,
          workDate: recordDate,
          minutes: minutesReported,
          category: voltaCategory,
          source: "volta_travel",
          location: 'Trajeto',
          notes: voltaNotes,
          createdBy: req.user!.userId,
          agendaActivityId: isMultiDay ? activity.id : undefined,
        });
        
        console.log(`✅ Time entry VOLTA criado: ${minutesReported}min de ${voltaCategory} (dia: ${recordDateStr})`);
      } catch (timeEntryError) {
        console.error("⚠️ Erro ao criar time entry de VOLTA:", timeEntryError);
      }
      
      console.log(`✅ Retorno à base registrado: ${minutesReported}min (ETA GPS: ${gpsEtaMinutes || 'N/A'}min)`);
      
      res.json({
        timeRecordId: timeRecord.id,
        message: "Retorno à base registrado com sucesso"
      });
    } catch (error: any) {
      console.error(`❌ Erro ao registrar retorno à base:`, error);
      res.status(400).json({ error: error.message });
    }
  });

  // Select next step after activity completion (does NOT create any time records)
  app.post("/api/activities/:id/next-step", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { action, nextActivityId } = req.body;
      
      const activity = await storage.getActivity(req.params.id);
      if (!activity) {
        return res.status(404).json({ error: "Activity not found" });
      }
      
      const isMultiDay = !!(activity.endDate);
      if (!isMultiDay && activity.status !== "concluido") {
        return res.status(400).json({ 
          error: `Ação não permitida. Status atual: ${activity.status}. Esperado: concluido` 
        });
      }
      
      // Validate action
      const validActions = ["next_activity", "end_journey", "return_base"];
      if (!action || !validActions.includes(action)) {
        return res.status(400).json({ 
          error: `Ação inválida. Valores permitidos: ${validActions.join(", ")}` 
        });
      }
      
      // If going to next activity, validate it exists
      if (action === "next_activity" && nextActivityId) {
        const nextActivity = await storage.getActivity(nextActivityId);
        if (!nextActivity) {
          return res.status(404).json({ error: "Próxima atividade não encontrada" });
        }
        if (nextActivity.technicianId !== activity.technicianId) {
          return res.status(400).json({ error: "Próxima atividade pertence a outro técnico" });
        }
      }
      
      // IMPORTANT: This endpoint does NOT create any time records
      // The IDA time for the next activity will only be created when
      // the technician clicks "Iniciar Navegação" on that activity
      
      console.log(`✅ Próximo passo selecionado: ${action}${nextActivityId ? ` → ${nextActivityId}` : ''}`);
      
      res.json({
        message: "OK",
        action,
        nextActivityId: nextActivityId || null
      });
    } catch (error: any) {
      console.error(`❌ Erro ao selecionar próximo passo:`, error);
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/activity-time-records/bulk", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { activityIds } = req.query;
      if (!activityIds || typeof activityIds !== "string") {
        return res.json([]);
      }
      const ids = activityIds.split(",").filter(Boolean);
      if (ids.length === 0) return res.json([]);

      const records = await db
        .select()
        .from(activityTimeRecords)
        .where(inArray(activityTimeRecords.activityId, ids))
        .orderBy(activityTimeRecords.createdAt);

      res.json(records);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get time records for an activity
  app.get("/api/activities/:id/time-records", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const activity = await storage.getActivity(req.params.id);
      if (!activity) {
        return res.status(404).json({ error: "Activity not found" });
      }
      
      const records = await db
        .select()
        .from(activityTimeRecords)
        .where(eq(activityTimeRecords.activityId, activity.id))
        .orderBy(activityTimeRecords.createdAt);
      
      res.json(records);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Reschedule an activity
  app.post("/api/activities/:id/reschedule", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const { newDate, newEndDate, newStartTime, newEndTime, reason } = req.body;
      
      if (!newDate || !newStartTime || !newEndTime || !reason) {
        return res.status(400).json({ error: "newDate, newStartTime, newEndTime and reason are required" });
      }
      
      const activity = await storage.getActivity(id);
      if (!activity) {
        return res.status(404).json({ error: "Activity not found" });
      }
      
      // Only allow rescheduling if activity is in planejado status
      if (activity.status !== "planejado") {
        return res.status(400).json({ error: "Only activities with 'planejado' status can be rescheduled" });
      }
      
      // Calculate new reschedule number
      const rescheduleNumber = (activity.rescheduleCount || 0) + 1;
      
      // Insert reschedule history record
      await db.insert(activityReschedules).values({
        activityId: id,
        previousDate: activity.scheduledDate,
        previousStartTime: activity.startTime,
        previousEndTime: activity.endTime,
        newDate: new Date(newDate),
        newStartTime,
        newEndTime,
        reason,
        rescheduledBy: req.user!.userId,
        rescheduleNumber,
      });
      
      // For multi-day activities, recalculate endDate to preserve duration
      const updateData: any = {
        scheduledDate: new Date(newDate),
        startTime: newStartTime,
        endTime: newEndTime,
        rescheduleCount: rescheduleNumber,
        updatedAt: new Date(),
      };
      
      if (activity.endDate) {
        if (newEndDate) {
          const parsedEndDate = new Date(newEndDate);
          if (parsedEndDate < new Date(newDate)) {
            return res.status(400).json({ error: "A data fim não pode ser anterior à data início." });
          }
          updateData.endDate = parsedEndDate;
        } else {
          const originalStart = new Date(activity.scheduledDate);
          const originalEnd = new Date(activity.endDate);
          const durationMs = originalEnd.getTime() - originalStart.getTime();
          const newStartDate = new Date(newDate);
          updateData.endDate = new Date(newStartDate.getTime() + durationMs);
        }
      }
      
      // Update activity with new date/time and increment reschedule count
      const [updatedActivity] = await db
        .update(activities)
        .set(updateData)
        .where(eq(activities.id, id))
        .returning();
      
      res.json(updatedActivity);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Reschedule a single day from a multi-day activity
  app.post("/api/activities/:id/reschedule-day", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const { originalDate, newDate, newStartTime, newEndTime, reason } = req.body;
      
      if (!originalDate || !newDate || !newStartTime || !newEndTime || !reason) {
        return res.status(400).json({ error: "originalDate, newDate, newStartTime, newEndTime and reason are required" });
      }
      
      const activity = await storage.getActivity(id);
      if (!activity) {
        return res.status(404).json({ error: "Activity not found" });
      }
      
      if (!activity.endDate) {
        return res.status(400).json({ error: "This is not a multi-day activity. Use the regular reschedule endpoint." });
      }
      
      const origDateStr = new Date(originalDate).toISOString().split("T")[0];
      const startDateStr = new Date(activity.scheduledDate).toISOString().split("T")[0];
      const endDateStr = new Date(activity.endDate).toISOString().split("T")[0];
      
      if (origDateStr < startDateStr || origDateStr > endDateStr) {
        return res.status(400).json({ error: "The original date is not within the activity date range." });
      }

      // Check day status - only allow rescheduling if day is not already completed
      const existingDayStatus = await db
        .select()
        .from(activityDayStatus)
        .where(and(
          eq(activityDayStatus.activityId, id),
          eq(activityDayStatus.date, new Date(origDateStr + "T00:00:00Z"))
        ));
      
      const completedStatuses = ["concluido"];
      if (existingDayStatus.length > 0 && completedStatuses.includes(existingDayStatus[0].status)) {
        return res.status(400).json({ error: "Dias já concluídos não podem ser reagendados." });
      }

      // 1. Create a new single-day activity cloned from the original
      const newActivity = await storage.createActivity({
        technicianId: activity.technicianId,
        clientId: activity.clientId,
        clientName: activity.clientName,
        siteId: activity.siteId,
        activityTypeId: activity.activityTypeId,
        title: activity.title ? `${activity.title} (reagendado)` : undefined,
        description: activity.description ? `${activity.description} - Reagendado de ${origDateStr}` : `Reagendado de ${origDateStr}`,
        address: activity.address,
        numero: activity.numero,
        bairro: activity.bairro,
        city: activity.city,
        state: activity.state,
        country: activity.country || "Brasil",
        latitude: activity.latitude,
        longitude: activity.longitude,
        scheduledDate: new Date(newDate),
        startTime: newStartTime,
        endTime: newEndTime,
        status: "planejado",
      });

      // 2. Mark the original day as cancelled in activity_day_status
      if (existingDayStatus.length > 0) {
        await db
          .update(activityDayStatus)
          .set({ 
            status: "cancelado",
            notes: `Reagendado para ${new Date(newDate).toISOString().split("T")[0]} - Motivo: ${reason}`,
          })
          .where(eq(activityDayStatus.id, existingDayStatus[0].id));
      } else {
        await db.insert(activityDayStatus).values({
          activityId: id,
          date: new Date(origDateStr + "T00:00:00Z"),
          status: "cancelado",
          notes: `Reagendado para ${new Date(newDate).toISOString().split("T")[0]} - Motivo: ${reason}`,
        });
      }

      // 3. Record reschedule history
      const rescheduleNumber = (activity.rescheduleCount || 0) + 1;
      await db.insert(activityReschedules).values({
        activityId: id,
        previousDate: new Date(origDateStr + "T00:00:00"),
        previousStartTime: activity.startTime,
        previousEndTime: activity.endTime,
        newDate: new Date(newDate),
        newStartTime,
        newEndTime,
        reason,
        rescheduledBy: req.user!.userId,
        rescheduleNumber,
      });

      // 4. Update reschedule count on the original activity
      await db
        .update(activities)
        .set({ rescheduleCount: rescheduleNumber, updatedAt: new Date() })
        .where(eq(activities.id, id));

      res.json({ 
        originalActivity: activity,
        newActivity,
        rescheduledDay: origDateStr,
      });
    } catch (error: any) {
      console.error("Reschedule day error:", error);
      res.status(400).json({ error: error.message });
    }
  });

  // Get reschedule history for an activity
  app.get("/api/activities/:id/reschedules", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      
      const activity = await storage.getActivity(id);
      if (!activity) {
        return res.status(404).json({ error: "Activity not found" });
      }
      
      const reschedules = await db
        .select()
        .from(activityReschedules)
        .where(eq(activityReschedules.activityId, id))
        .orderBy(activityReschedules.rescheduleNumber);
      
      res.json(reschedules);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get all reschedules with activity info (for calendar ghost events)
  app.get("/api/reschedules/calendar-ghosts", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { startDate, endDate, technicianId } = req.query;
      
      let query = db
        .select({
          id: activityReschedules.id,
          activityId: activityReschedules.activityId,
          previousDate: activityReschedules.previousDate,
          previousStartTime: activityReschedules.previousStartTime,
          previousEndTime: activityReschedules.previousEndTime,
          newDate: activityReschedules.newDate,
          newStartTime: activityReschedules.newStartTime,
          newEndTime: activityReschedules.newEndTime,
          reason: activityReschedules.reason,
          rescheduleNumber: activityReschedules.rescheduleNumber,
          createdAt: activityReschedules.createdAt,
          // Activity info
          activityTitle: activities.title,
          activityClientName: activities.clientName,
          activityTechnicianId: activities.technicianId,
          activityStatus: activities.status,
        })
        .from(activityReschedules)
        .innerJoin(activities, eq(activityReschedules.activityId, activities.id));
      
      const conditions = [];
      
      // Filter by technician
      if (technicianId && technicianId !== "all") {
        conditions.push(eq(activities.technicianId, technicianId as string));
      }
      
      // Filter by previous date range (where the ghost should appear)
      if (startDate && endDate) {
        conditions.push(gte(activityReschedules.previousDate, new Date(startDate as string)));
        conditions.push(lte(activityReschedules.previousDate, new Date(endDate as string)));
      }
      
      const reschedules = await query.where(and(...conditions));
      
      res.json(reschedules);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ============================================
  // Multi-Day Activity Daily Status Routes
  // ============================================
  
  // Get all day statuses for a multi-day activity
  app.get("/api/activities/:id/day-status", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      
      const activity = await storage.getActivity(id);
      if (!activity) {
        return res.status(404).json({ error: "Activity not found" });
      }
      
      // Verify this is a multi-day activity
      if (!activity.endDate) {
        return res.status(400).json({ error: "This endpoint is only for multi-day activities" });
      }
      
      const dayStatuses = await db
        .select()
        .from(activityDayStatus)
        .where(eq(activityDayStatus.activityId, id))
        .orderBy(activityDayStatus.date);
      
      res.json(dayStatuses);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get or create day status for a specific date
  app.get("/api/activities/:id/day-status/:date", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { id, date } = req.params;
      
      const activity = await storage.getActivity(id);
      if (!activity) {
        return res.status(404).json({ error: "Activity not found" });
      }
      
      // Verify this is a multi-day activity
      if (!activity.endDate) {
        return res.status(400).json({ error: "This endpoint is only for multi-day activities" });
      }
      
      // Parse the date (use UTC to avoid timezone issues)
      const targetDate = new Date(date + 'T00:00:00Z');
      const nextDay = new Date(targetDate);
      nextDay.setDate(nextDay.getDate() + 1);
      
      // Validate date is within activity range (compare dates only, ignoring time)
      const activityStartDate = new Date(activity.scheduledDate);
      activityStartDate.setUTCHours(0, 0, 0, 0);
      const activityEndDate = new Date(activity.endDate);
      activityEndDate.setUTCHours(23, 59, 59, 999);
      if (targetDate < activityStartDate || targetDate > activityEndDate) {
        return res.status(400).json({ error: "Date is outside activity date range" });
      }
      
      // Find existing status for this date
      const [existingStatus] = await db
        .select()
        .from(activityDayStatus)
        .where(
          and(
            eq(activityDayStatus.activityId, id),
            gte(activityDayStatus.date, targetDate),
            lt(activityDayStatus.date, nextDay)
          )
        )
        .limit(1);
      
      if (existingStatus) {
        return res.json(existingStatus);
      }
      
      // Return null if no status exists for this date
      res.json(null);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Update or create day status for a specific date
  app.put("/api/activities/:id/day-status/:date", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { id, date } = req.params;
      const { status, startTime, endTime, checkInTime, checkOutTime, checkInLatitude, checkInLongitude, 
              checkOutLatitude, checkOutLongitude, actualDurationMinutes, workCompleted, notes } = req.body;
      
      const activity = await storage.getActivity(id);
      if (!activity) {
        return res.status(404).json({ error: "Activity not found" });
      }
      
      // Verify this is a multi-day activity
      if (!activity.endDate) {
        return res.status(400).json({ error: "This endpoint is only for multi-day activities" });
      }
      
      // Validate status value if provided
      const validStatuses = ["planejado", "aCaminho", "emExecucao", "concluido", "reprovado", "cancelado"];
      if (status && !validStatuses.includes(status)) {
        return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` });
      }
      
      // Parse the date (use UTC for consistency)
      const targetDate = new Date(date + 'T00:00:00Z');
      const nextDay = new Date(targetDate);
      nextDay.setDate(nextDay.getDate() + 1);
      
      // Validate date is within activity range (compare dates only, ignoring time)
      const activityStartDate = new Date(activity.scheduledDate);
      activityStartDate.setUTCHours(0, 0, 0, 0);
      const activityEndDate = new Date(activity.endDate);
      activityEndDate.setUTCHours(23, 59, 59, 999);
      if (targetDate < activityStartDate || targetDate > activityEndDate) {
        return res.status(400).json({ error: "Date is outside activity date range" });
      }
      
      // Validate startTime/endTime format and order if provided
      if (startTime || endTime) {
        const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
        if (startTime && !timeRegex.test(startTime)) {
          return res.status(400).json({ error: "startTime inválido. Use formato HH:MM" });
        }
        if (endTime && !timeRegex.test(endTime)) {
          return res.status(400).json({ error: "endTime inválido. Use formato HH:MM" });
        }
        if (startTime && endTime && startTime >= endTime) {
          return res.status(400).json({ error: "Horário de início deve ser antes do horário de fim" });
        }
      }

      // If time is being changed, check for conflicts with other activities on the same day for the same technician
      if (startTime && endTime && activity.technicianId) {
        const newStart = startTime as string;
        const newEnd = endTime as string;
        
        // Get all activities for this technician on this date (excluding the current one)
        const dayActivities = await db
          .select()
          .from(activities)
          .where(
            and(
              eq(activities.technicianId, activity.technicianId),
              ne(activities.id, id)
            )
          );
        
        for (const otherActivity of dayActivities) {
          const otherStartDate = new Date(otherActivity.scheduledDate);
          otherStartDate.setUTCHours(0, 0, 0, 0);
          const otherEndDate = otherActivity.endDate ? new Date(otherActivity.endDate) : otherStartDate;
          otherEndDate.setUTCHours(0, 0, 0, 0);
          
          // Check if the other activity falls on this date
          if (targetDate >= otherStartDate && targetDate <= otherEndDate) {
            // Get the effective start/end times for the other activity on this date
            let otherStart = otherActivity.startTime;
            let otherEnd = otherActivity.endTime;
            
            // If multi-day, check for per-day override
            if (otherActivity.endDate) {
              const [otherDayStatus] = await db
                .select()
                .from(activityDayStatus)
                .where(
                  and(
                    eq(activityDayStatus.activityId, otherActivity.id),
                    gte(activityDayStatus.date, targetDate),
                    lt(activityDayStatus.date, nextDay)
                  )
                )
                .limit(1);
              if (otherDayStatus?.startTime) otherStart = otherDayStatus.startTime;
              if (otherDayStatus?.endTime) otherEnd = otherDayStatus.endTime;
            }
            
            // Check time overlap
            if (newStart < otherEnd && newEnd > otherStart) {
              return res.status(409).json({ 
                error: `Conflito de horário: já existe uma atividade (${otherActivity.title || otherActivity.clientName || 'Sem título'}) das ${otherStart} às ${otherEnd} neste dia.` 
              });
            }
          }
        }
      }
      
      // Find existing status for this date
      const [existingStatus] = await db
        .select()
        .from(activityDayStatus)
        .where(
          and(
            eq(activityDayStatus.activityId, id),
            gte(activityDayStatus.date, targetDate),
            lt(activityDayStatus.date, nextDay)
          )
        )
        .limit(1);
      
      if (existingStatus) {
        // Update existing
        const [updated] = await db
          .update(activityDayStatus)
          .set({
            status: status || existingStatus.status,
            startTime: startTime !== undefined ? startTime : existingStatus.startTime,
            endTime: endTime !== undefined ? endTime : existingStatus.endTime,
            checkInTime: checkInTime ? new Date(checkInTime) : existingStatus.checkInTime,
            checkOutTime: checkOutTime ? new Date(checkOutTime) : existingStatus.checkOutTime,
            checkInLatitude: checkInLatitude ?? existingStatus.checkInLatitude,
            checkInLongitude: checkInLongitude ?? existingStatus.checkInLongitude,
            checkOutLatitude: checkOutLatitude ?? existingStatus.checkOutLatitude,
            checkOutLongitude: checkOutLongitude ?? existingStatus.checkOutLongitude,
            actualDurationMinutes: actualDurationMinutes ?? existingStatus.actualDurationMinutes,
            workCompleted: workCompleted ?? existingStatus.workCompleted,
            notes: notes ?? existingStatus.notes,
            updatedAt: new Date(),
          })
          .where(eq(activityDayStatus.id, existingStatus.id))
          .returning();
        
        return res.json(updated);
      } else {
        // Create new
        const [created] = await db
          .insert(activityDayStatus)
          .values({
            activityId: id,
            date: targetDate,
            status: status || 'planejado',
            startTime: startTime || null,
            endTime: endTime || null,
            checkInTime: checkInTime ? new Date(checkInTime) : null,
            checkOutTime: checkOutTime ? new Date(checkOutTime) : null,
            checkInLatitude: checkInLatitude ?? null,
            checkInLongitude: checkInLongitude ?? null,
            checkOutLatitude: checkOutLatitude ?? null,
            checkOutLongitude: checkOutLongitude ?? null,
            actualDurationMinutes: actualDurationMinutes ?? null,
            workCompleted: workCompleted ?? false,
            notes: notes ?? null,
          })
          .returning();
        
        return res.json(created);
      }
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Check-in for a specific day of a multi-day activity
  app.post("/api/activities/:id/day-status/:date/check-in", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { id, date } = req.params;
      const { latitude, longitude } = req.body;
      
      const activity = await storage.getActivity(id);
      if (!activity) {
        return res.status(404).json({ error: "Activity not found" });
      }
      
      // Verify this is a multi-day activity
      if (!activity.endDate) {
        return res.status(400).json({ error: "This endpoint is only for multi-day activities" });
      }
      
      // Parse the date (use UTC for consistency)
      const targetDate = new Date(date + 'T00:00:00Z');
      const nextDay = new Date(targetDate);
      nextDay.setDate(nextDay.getDate() + 1);
      const now = new Date();
      
      // Validate date is within activity range (compare dates only, ignoring time)
      const activityStartDate = new Date(activity.scheduledDate);
      activityStartDate.setUTCHours(0, 0, 0, 0);
      const activityEndDate = new Date(activity.endDate);
      activityEndDate.setUTCHours(23, 59, 59, 999);
      if (targetDate < activityStartDate || targetDate > activityEndDate) {
        return res.status(400).json({ error: "Date is outside activity date range" });
      }
      
      // Atomic upsert keyed on (activityId, date) to avoid duplicate rows on concurrent check-ins
      const [result] = await db
        .insert(activityDayStatus)
        .values({
          activityId: id,
          date: targetDate,
          status: 'emExecucao',
          checkInTime: now,
          checkInLatitude: latitude ?? null,
          checkInLongitude: longitude ?? null,
        })
        .onConflictDoUpdate({
          target: [activityDayStatus.activityId, activityDayStatus.date],
          set: {
            status: 'emExecucao',
            checkInTime: now,
            checkInLatitude: latitude ?? null,
            checkInLongitude: longitude ?? null,
            updatedAt: now,
          },
        })
        .returning();
      
      // For multi-day: do NOT update overall activity status
      // Only store checkInTime for reference
      await storage.updateActivity(id, {
        checkInTime: now,
      });
      
      return res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Check-out for a specific day of a multi-day activity
  app.post("/api/activities/:id/day-status/:date/check-out", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { id, date } = req.params;
      const { latitude, longitude, workCompleted, notes, justification, lostMinutes, executionMinutes } = req.body;
      
      const activity = await storage.getActivity(id);
      if (!activity) {
        return res.status(404).json({ error: "Activity not found" });
      }
      
      // Verify this is a multi-day activity
      if (!activity.endDate) {
        return res.status(400).json({ error: "This endpoint is only for multi-day activities" });
      }
      
      // Validate: if workCompleted is false, justification is required
      if (workCompleted === false && (!justification || justification.trim().length === 0)) {
        return res.status(400).json({ error: "Justificativa é obrigatória quando o trabalho não foi realizado" });
      }
      
      // Parse the date (use UTC for consistency)
      const targetDate = new Date(date + 'T00:00:00Z');
      const targetDateForWorkDate = new Date(date + 'T12:00:00Z');
      const nextDay = new Date(targetDate);
      nextDay.setDate(nextDay.getDate() + 1);
      const now = new Date();
      
      // Validate date is within activity range (compare dates only, ignoring time)
      const activityStartDate = new Date(activity.scheduledDate);
      activityStartDate.setUTCHours(0, 0, 0, 0);
      const activityEndDate = new Date(activity.endDate);
      activityEndDate.setUTCHours(23, 59, 59, 999);
      if (targetDate < activityStartDate || targetDate > activityEndDate) {
        return res.status(400).json({ error: "Date is outside activity date range" });
      }
      
      // Find existing status for this date
      const [existingStatus] = await db
        .select()
        .from(activityDayStatus)
        .where(
          and(
            eq(activityDayStatus.activityId, id),
            gte(activityDayStatus.date, targetDate),
            lt(activityDayStatus.date, nextDay)
          )
        )
        .limit(1);
      
      if (!existingStatus) {
        return res.status(400).json({ error: "No check-in found for this date" });
      }
      
      // Calculate actual duration
      let actualDuration: number | null = null;
      if (workCompleted === true) {
        const parsedExecution = typeof executionMinutes === 'number' ? executionMinutes : parseInt(executionMinutes, 10);
        if (!isNaN(parsedExecution) && parsedExecution >= 0) {
          actualDuration = parsedExecution;
        } else if (existingStatus.checkInTime) {
          actualDuration = Math.round((now.getTime() - new Date(existingStatus.checkInTime).getTime()) / 60000);
        }
      } else {
        const parsedLost = typeof lostMinutes === 'number' ? lostMinutes : 
                           typeof lostMinutes === 'string' ? parseInt(lostMinutes, 10) : NaN;
        if (!isNaN(parsedLost) && parsedLost >= 0) {
          actualDuration = parsedLost;
        } else if (existingStatus.checkInTime) {
          actualDuration = Math.round((now.getTime() - new Date(existingStatus.checkInTime).getTime()) / 60000);
        }
      }
      
      // Build notes
      let finalNotes = notes ?? existingStatus.notes;
      if (workCompleted === false && justification) {
        finalNotes = `Não realizado - ${justification.trim()}`;
      }
      
      // Determine day status: use "concluido" for both cases, workCompleted field distinguishes
      const dayStatus = 'concluido';
      
      const [updated] = await db
        .update(activityDayStatus)
        .set({
          status: dayStatus,
          checkOutTime: now,
          checkOutLatitude: latitude ?? null,
          checkOutLongitude: longitude ?? null,
          actualDurationMinutes: actualDuration,
          workCompleted: workCompleted ?? false,
          notes: finalNotes,
          updatedAt: now,
        })
        .where(eq(activityDayStatus.id, existingStatus.id))
        .returning();
      
      // Create time entries for this day
      const activityType = await storage.getActivityType(activity.activityTypeId);
      
      // 1. Create time entry for IDA travel (from activity_time_records for this day)
      if (activityType) {
        try {
          // Check if IDA time entry already exists for this day (idempotency)
          const existingIdaEntry = await db
            .select()
            .from(timeEntries)
            .where(
              and(
                eq(timeEntries.technicianId, activity.technicianId),
                eq(timeEntries.agendaActivityId, id),
                eq(timeEntries.source, "ida_travel"),
                eq(timeEntries.workDate, targetDate)
              )
            )
            .limit(1);
          
          if (existingIdaEntry.length === 0) {
            // Find IDA records using DATE comparison for robustness
            const targetDateStr = date; // YYYY-MM-DD format from URL param
            const idaRecords = await db
              .select()
              .from(activityTimeRecords)
              .where(
                and(
                  eq(activityTimeRecords.activityId, id),
                  eq(activityTimeRecords.recordType, "ida"),
                  or(
                    and(
                      gte(activityTimeRecords.finishedAt, targetDate),
                      lt(activityTimeRecords.finishedAt, nextDay)
                    ),
                    sql`DATE(${activityTimeRecords.createdAt}) = ${targetDateStr}`
                  )
                )
              )
              .orderBy(activityTimeRecords.createdAt);
            
            const idaRecord = idaRecords.length > 0 ? idaRecords[idaRecords.length - 1] : null;
            
            if (idaRecord && idaRecord.minutesReported > 0) {
              let travelCategory: "efetivo" | "adicional" | "perda";
              if (activityType.category === "efetivo" && workCompleted !== false) {
                travelCategory = "adicional";
              } else if (workCompleted === false) {
                travelCategory = "perda";
              } else {
                travelCategory = activityType.category === "adicional" ? "adicional" : 
                                 activityType.category === "perda" ? "perda" : "adicional";
              }
              
              await db.insert(timeEntries).values({
                technicianId: activity.technicianId,
                activityTypeId: activity.activityTypeId,
                workDate: targetDateForWorkDate,
                minutes: idaRecord.minutesReported,
                category: travelCategory,
                source: "ida_travel",
                location: 'Trajeto',
                notes: `Dia ${date} - IDA até ${activity.clientName || 'cliente'}: ${idaRecord.minutesReported}min (informado pelo técnico)`,
                createdBy: req.user!.userId,
                agendaActivityId: id,
              });
              console.log(`✅ Time entry IDA dia ${date}: ${idaRecord.minutesReported}min de ${travelCategory}`);
            }
          } else {
            console.log(`ℹ️ Time entry IDA já existe para dia ${date}, pulando`);
          }
        } catch (e) {
          console.error("⚠️ Erro ao criar time entry de IDA do dia:", e);
        }
      }
      
      // 2. Create time entry for execution/work time
      if (workCompleted === true && actualDuration && actualDuration > 0 && activityType) {
        // Create efetivo time entry for completed work
        try {
          await db.insert(timeEntries).values({
            technicianId: activity.technicianId,
            activityTypeId: activity.activityTypeId,
            workDate: targetDateForWorkDate,
            minutes: actualDuration,
            category: activityType.category === "efetivo" ? "efetivo" : activityType.category === "adicional" ? "adicional" : "perda",
            source: "timer",
            location: (activity as any).location ?? null,
            notes: `Dia ${date} - Execução em ${activity.clientName || 'cliente'}`,
            createdBy: req.user!.userId,
          });
          console.log(`✅ Time entry EXECUÇÃO dia ${date}: ${actualDuration}min`);
        } catch (e) {
          console.error("⚠️ Erro ao criar time entry de execução do dia:", e);
        }
      } else if (workCompleted === false) {
        // Create perda time entry for non-completed work
        const parsedLost = typeof lostMinutes === 'number' ? lostMinutes : parseInt(lostMinutes, 10);
        if (!isNaN(parsedLost) && parsedLost > 0) {
          try {
            await db.insert(timeEntries).values({
              technicianId: activity.technicianId,
              activityTypeId: activity.activityTypeId,
              workDate: targetDateForWorkDate,
              minutes: parsedLost,
              category: "perda",
              source: "timer",
              location: (activity as any).location ?? null,
              notes: `Dia ${date} - Tempo não produtivo em ${activity.clientName || 'cliente'}${justification ? ` | Motivo: ${justification.trim()}` : ''}`,
              createdBy: req.user!.userId,
            });
            console.log(`✅ Time entry PERDA dia ${date}: ${parsedLost}min`);
          } catch (e) {
            console.error("⚠️ Erro ao criar time entry de perda do dia:", e);
          }
        }
      }
      
      // For multi-day: do NOT reset overall activity status
      // Each day has independent status tracked via activityDayStatus
      // Just clear navigation times for the next day's navigation
      await storage.updateActivity(id, {
        navigationStartTime: null,
        navigationEtaMinutes: null,
      });
      
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ============================================
  // RAT (Relatório de Assistência Técnica) Routes
  // ============================================

  // List all RATs with optional filters — uses in-memory cache to beat gateway timeouts
  app.get("/api/rats", authMiddleware, async (req: AuthRequest, res) => {
    try {
      // ── Resolve technicianId WITHOUT hitting the DB for assistente users ──────
      // The _userTechCache maps userId → technicianId so that repeated calls only
      // do a DB lookup the very first time, then serve from memory.
      let filterTechnicianId: string | undefined;
      let cacheKey: string;

      if (req.user!.role !== "admin") {
        let techId = _userTechCache.get(req.user!.userId);
        if (!techId) {
          const technician = await storage.getTechnicianByUserId(req.user!.userId);
          if (!technician) {
            return res.status(403).json({ error: "Technician not found for this user" });
          }
          techId = technician.id;
          _userTechCache.set(req.user!.userId, techId);
        }
        filterTechnicianId = techId;
        cacheKey = `tech:${techId}`;
      } else {
        cacheKey = "admin";
      }
      // ─────────────────────────────────────────────────────────────────────────

      const lightSelect = getRatsLightSelect();
      const conditions: any[] = [];
      if (filterTechnicianId) conditions.push(eq(rats.technicianId, filterTechnicianId));

      const runQuery = async (): Promise<any[]> => {
        const q = conditions.length > 0
          ? db.select(lightSelect).from(rats).where(and(...conditions)).orderBy(desc(rats.createdAt))
          : db.select(lightSelect).from(rats).orderBy(desc(rats.createdAt));
        return q;
      };

      // ── Stale-while-revalidate ────────────────────────────────────────────
      const cached = _ratsCache.get(cacheKey);
      if (cached) {
        // Always serve cached data immediately (eliminates gateway timeout risk)
        res.json(cached.data);
        // Trigger background refresh only if TTL has expired
        const age = Date.now() - cached.ts;
        if (age > RATS_CACHE_TTL) {
          _bgRefreshRatsCache(cacheKey, runQuery).catch(() => {});
        }
        return;
      }
      // ─────────────────────────────────────────────────────────────────────

      // No cache yet — run the query (first load after server restart)
      // Retry up to 5 times to absorb Neon cold-start delays (may take 15-20s total)
      let lightRats: any[] | null = null;
      let lastError: any = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          lightRats = await runQuery();
          break;
        } catch (dbErr: any) {
          lastError = dbErr;
          console.error(`[RATs] DB query attempt ${attempt + 1}/5 failed:`, dbErr.message);
          if (attempt < 4) await new Promise(r => setTimeout(r, 1000 * Math.pow(1.5, attempt)));
        }
      }
      if (lightRats === null) throw lastError;

      _ratsCache.set(cacheKey, { data: lightRats, ts: Date.now() });
      console.log(`[RATs cache] cold-populated key="${cacheKey}" (${lightRats.length} items)`);
      res.json(lightRats);
    } catch (error: any) {
      console.error("[RATs] Failed to fetch:", error.message);
      res.status(500).json({ error: error.message || "Failed to fetch RATs" });
    }
  });

  // Export all RATs as PDFs in a ZIP file (admin only) - MUST be before :id routes
  app.get("/api/rats/export-all-pdfs", authMiddleware, roleMiddleware(["admin"]), async (req: AuthRequest, res) => {
    try {
      const allRats = await db.select().from(rats).orderBy(desc(rats.createdAt));
      
      if (allRats.length === 0) {
        return res.status(404).json({ error: "Nenhuma RAT encontrada" });
      }

      const ratsWithContent = allRats.filter(r => r.formData && r.formData !== '{}' && r.formData !== '');
      
      if (ratsWithContent.length === 0) {
        return res.status(404).json({ error: "Nenhuma RAT com conteúdo preenchido encontrada" });
      }

      console.log(`[PDF Export] Iniciando exportação de ${ratsWithContent.length} RATs como PDFs...`);

      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="RATs_Export_${new Date().toISOString().split('T')[0]}.zip"`);

      const archive = archiver("zip", { zlib: { level: 5 } });
      
      archive.on("error", (err: Error) => {
        console.error("[PDF Export] Archive error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Archive error: " + err.message });
        } else {
          res.end();
        }
      });

      let aborted = false;
      res.on("close", () => {
        if (!archive.closed) {
          aborted = true;
          archive.abort();
          console.log("[PDF Export] Client disconnected, aborting export");
        }
      });

      archive.pipe(res);

      let successCount = 0;
      let errorCount = 0;

      for (const rat of ratsWithContent) {
        if (aborted) break;
        try {
          const technician = await storage.getTechnician(rat.technicianId);
          const formData = rat.formData ? JSON.parse(rat.formData) : {};
          
          const html = rat.isSimplified 
            ? generateSimplifiedRatHtml(rat, technician, formData) 
            : generateRatHtml(rat, technician, formData);
          
          const pdfBuffer = await generatePdfFromHtml(html);
          
          const reportNumber = rat.reportNumberManual || rat.reportNumber;
          const clientName = (rat.clientNameEditable || rat.clientName || "").replace(/[\/\\:*?"<>|]/g, "_").substring(0, 50);
          const fileName = `${reportNumber}_${clientName}.pdf`;
          
          archive.append(Buffer.from(pdfBuffer), { name: fileName });
          successCount++;
          console.log(`[PDF Export] ✅ ${successCount}/${ratsWithContent.length}: ${fileName}`);
        } catch (ratError: any) {
          errorCount++;
          console.error(`[PDF Export] ❌ Erro na RAT ${rat.reportNumber}: ${ratError.message}`);
        }
      }

      console.log(`[PDF Export] Finalizado: ${successCount} PDFs gerados, ${errorCount} erros`);
      if (!aborted) {
        await archive.finalize();
      }
      
    } catch (error: any) {
      console.error("PDF export error:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to export PDFs: " + error.message });
      } else {
        res.end();
      }
    }
  });

  // Get pending RATs count for a technician
  app.get("/api/rats/pending-count", authMiddleware, async (req: AuthRequest, res) => {
    try {
      if (req.user!.role === "admin") {
        // Admin: count all pending RATs in the system
        const result = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(rats)
          .where(eq(rats.status, "pendente"));
        return res.json({ count: result[0]?.count || 0 });
      }
      
      const technician = await storage.getTechnicianByUserId(req.user!.userId);
      if (!technician) {
        return res.json({ count: 0 });
      }
      
      const count = await storage.getPendingRatsCount(technician.id);
      res.json({ count });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get RAT by activity ID
  app.get("/api/rats/by-activity/:activityId", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const rat = await storage.getRatByActivityId(req.params.activityId);
      
      if (!rat) {
        return res.status(404).json({ error: "RAT not found for this activity" });
      }
      
      // Check authorization
      if (req.user!.role !== "admin") {
        const technician = await storage.getTechnicianByUserId(req.user!.userId);
        if (!technician || rat.technicianId !== technician.id) {
          return res.status(403).json({ error: "Access denied" });
        }
      }
      
      res.json(rat);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get single RAT by ID
  app.get("/api/rats/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const rat = await storage.getRat(req.params.id);
      
      if (!rat) {
        return res.status(404).json({ error: "RAT not found" });
      }
      
      // Check authorization
      if (req.user!.role !== "admin") {
        const technician = await storage.getTechnicianByUserId(req.user!.userId);
        if (!technician || rat.technicianId !== technician.id) {
          return res.status(403).json({ error: "Access denied" });
        }
      }
      
      res.json(rat);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Create new RAT
  app.post("/api/rats", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const data = createRatSchema.parse(req.body);
      
      // Generate report number
      const reportNumber = await storage.getNextRatNumber();
      
      // Get activity to auto-populate client name and open date
      const activity = await storage.getActivity(data.activityId);
      if (!activity) {
        return res.status(400).json({ error: "Activity not found" });
      }
      
      // Get technicianId from activity if not provided
      const technicianId = data.technicianId || activity.technicianId;
      if (!technicianId) {
        return res.status(400).json({ error: "Activity has no technician assigned" });
      }
      
      // Ensure technician is authorized
      if (req.user!.role !== "admin") {
        const technician = await storage.getTechnicianByUserId(req.user!.userId);
        if (!technician || technicianId !== technician.id) {
          return res.status(403).json({ error: "You can only create RATs for your own activities" });
        }
      }
      
      const rat = await storage.createRat({
        activityId: data.activityId,
        technicianId: technicianId,
        formData: data.formData,
        status: data.status || "pendente",
        reportNumber,
        clientName: activity.clientName || "Cliente não identificado",
        clientId: activity.clientId || undefined,
        openDate: activity.checkOutTime || new Date(),
        // New fields
        reportNumberManual: data.reportNumberManual,
        clientNameEditable: data.clientNameEditable,
        projectType: data.projectType,
        openingDate: data.openingDate,
        closingDate: data.closingDate,
        surfaceMaintenanceGrade: data.surfaceMaintenanceGrade,
        applicationNote: data.applicationNote,
        technicianSignature: data.technicianSignature,
        technicianSignatureName: data.technicianSignatureName,
        photoSections: data.photoSections,
        isSimplified: data.isSimplified || false,
      });
      
      // Add to cache surgically — avoid clearing the admin cache on every create
      addRatToCache({
        id: rat.id,
        reportNumber: rat.reportNumber,
        reportNumberManual: rat.reportNumberManual || null,
        activityId: rat.activityId,
        technicianId: rat.technicianId,
        clientName: rat.clientName,
        status: rat.status,
        openDate: rat.openDate,
        sentAt: rat.sentAt || null,
        importedPdfUrl: rat.importedPdfUrl || null,
        importedPdfFilename: rat.importedPdfFilename || null,
        isSimplified: rat.isSimplified || false,
        createdAt: rat.createdAt,
        hasFormData: !!rat.formData,
        hasSignature: !!rat.technicianSignature,
        hasPhotos: !!(rat.photoSections || rat.photos),
      });
      res.status(201).json(rat);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Update RAT
  app.put("/api/rats/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const existingRat = await storage.getRat(req.params.id);
      
      if (!existingRat) {
        return res.status(404).json({ error: "RAT not found" });
      }
      
      // Check authorization
      if (req.user!.role !== "admin") {
        const technician = await storage.getTechnicianByUserId(req.user!.userId);
        if (!technician || existingRat.technicianId !== technician.id) {
          return res.status(403).json({ error: "Access denied" });
        }
      }
      
      const data = updateRatSchema.parse(req.body);
      
      // Don't allow updating already sent RATs (unless admin)
      // Exception: technicians CAN toggle sentAt (mark as sent/unsent)
      if (existingRat.sentAt && req.user!.role !== "admin") {
        // Check if the only change is to sentAt
        const isOnlySentAtChange = Object.keys(data).length === 1 && 'sentAt' in data;
        if (!isOnlySentAtChange) {
          return res.status(400).json({ error: "Cannot modify a sent RAT" });
        }
      }
      
      // Log for debugging status update
      console.log(`[RAT Update] ID: ${req.params.id}, Status being set: ${data.status}, Current status: ${existingRat.status}`);
      
      const rat = await storage.updateRat(req.params.id, data);
      
      console.log(`[RAT Update] Updated RAT status: ${rat.status}`);
      
      // Surgical patch — keeps admin cache alive through frequent auto-saves
      patchRatInCache(rat.id, {
        status: rat.status,
        sentAt: rat.sentAt,
        reportNumberManual: rat.reportNumberManual,
        clientName: rat.clientName,
        isSimplified: rat.isSimplified,
        importedPdfUrl: rat.importedPdfUrl,
        importedPdfFilename: rat.importedPdfFilename,
        hasFormData: !!rat.formData,
        hasSignature: !!rat.technicianSignature,
        hasPhotos: !!(rat.photoSections || rat.photos),
      });
      res.json(rat);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Mark RAT as complete
  app.patch("/api/rats/:id/complete", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const existingRat = await storage.getRat(req.params.id);
      
      if (!existingRat) {
        return res.status(404).json({ error: "RAT not found" });
      }
      
      // Check authorization
      if (req.user!.role !== "admin") {
        const technician = await storage.getTechnicianByUserId(req.user!.userId);
        if (!technician || existingRat.technicianId !== technician.id) {
          return res.status(403).json({ error: "Access denied" });
        }
      }
      
      const rat = await storage.updateRat(req.params.id, {
        status: "completa",
        closeDate: new Date(),
      });
      
      patchRatInCache(rat.id, { status: "completa" });
      res.json(rat);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Fix pending RATs that have content (admin only)
  app.post("/api/rats/fix-pending", authMiddleware, roleMiddleware(["admin"]), async (req: AuthRequest, res) => {
    try {
      const allRats = await db.select().from(rats).where(eq(rats.status, "pendente"));
      let fixed = 0;
      for (const rat of allRats) {
        const hasContent = rat.formData && rat.formData !== '{}' && rat.formData !== '';
        if (hasContent) {
          await db.update(rats).set({ status: "completa", closeDate: new Date() }).where(eq(rats.id, rat.id));
          fixed++;
        }
      }
      if (fixed > 0) invalidateRatsCache();
      res.json({ message: `${fixed} RATs pendentes corrigidas para completa`, fixed, total: allRats.length });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Send RAT (via WhatsApp or Email)
  app.post("/api/rats/:id/send", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { channel } = req.body; // "whatsapp", "email", or "ambos"
      
      if (!channel || !["whatsapp", "email", "ambos"].includes(channel)) {
        return res.status(400).json({ error: "Invalid channel. Use 'whatsapp', 'email', or 'ambos'" });
      }
      
      const existingRat = await storage.getRat(req.params.id);
      
      if (!existingRat) {
        return res.status(404).json({ error: "RAT not found" });
      }
      
      // Check authorization
      if (req.user!.role !== "admin") {
        const technician = await storage.getTechnicianByUserId(req.user!.userId);
        if (!technician || existingRat.technicianId !== technician.id) {
          return res.status(403).json({ error: "Access denied" });
        }
      }
      
      // Get technician info for the message
      const technician = await storage.getTechnician(existingRat.technicianId);
      
      // Parse form data
      let formData: any = {};
      try {
        formData = existingRat.formData ? JSON.parse(existingRat.formData) : {};
      } catch (e) {
        formData = {};
      }
      
      // Build WhatsApp message (simplified)
      const formatDate = (date: Date | string | null) => {
        if (!date) return "N/A";
        return new Date(date).toLocaleDateString("pt-BR");
      };
      
      const displayReportNumber = existingRat.reportNumberManual || existingRat.reportNumber;
      
      const message = `*RELATÓRIO DE ASSISTÊNCIA TÉCNICA - RENNER*

*Número:* ${displayReportNumber}
*Data:* ${formatDate(existingRat.openDate)}
*Cliente:* ${existingRat.clientName || "N/A"}

_Segue em anexo o relatório completo em PDF._`;

      // Generate deep links
      const whatsappLink = `https://wa.me/?text=${encodeURIComponent(message)}`;
      
      // Build email content
      const emailSubject = `RAT ${displayReportNumber} - ${existingRat.clientName || "Cliente"}`;
      const emailBody = message.replace(/\*/g, "").replace(/_/g, ""); // Remove WhatsApp formatting
      const emailLink = `mailto:${formData.email || ""}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
      
      const rat = await storage.updateRat(req.params.id, {
        sentAt: new Date(),
        sendChannel: channel,
      });
      
      patchRatInCache(rat.id, { sentAt: rat.sentAt, status: rat.status });
      // Return rat with deep links
      res.json({
        ...rat,
        deepLinks: {
          whatsapp: whatsappLink,
          email: emailLink,
        }
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Delete RAT (admin only or owner if not sent)
  app.delete("/api/rats/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const existingRat = await storage.getRat(req.params.id);
      
      if (!existingRat) {
        return res.status(404).json({ error: "RAT not found" });
      }
      
      // Only admin can delete sent RATs
      if (existingRat.sentAt && req.user!.role !== "admin") {
        return res.status(403).json({ error: "Only admins can delete sent RATs" });
      }
      
      // Check authorization
      if (req.user!.role !== "admin") {
        const technician = await storage.getTechnicianByUserId(req.user!.userId);
        if (!technician || existingRat.technicianId !== technician.id) {
          return res.status(403).json({ error: "Access denied" });
        }
      }
      
      // Não deletar a RAT, apenas resetar para "pendente"
      // Isso permite que o usuário preencha novamente sem perder a atividade vinculada
      await storage.updateRat(req.params.id, {
        status: "pendente",
        formData: null,
        photoSections: null,
        sentAt: null,
        sendChannel: null,
        fileUrl: null,
        importedPdfUrl: null,
        importedPdfFilename: null,
        technicianSignature: null,
        technicianSignatureName: null,
      });
      removeRatFromCache(req.params.id);
      res.status(200).json({ message: "RAT resetada para pendente" });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Upload PDF for RAT (alternative to manual form)
  app.post("/api/rats/:id/pdf", authMiddleware, upload.single("pdf"), async (req: AuthRequest, res) => {
    try {
      const existingRat = await storage.getRat(req.params.id);
      
      if (!existingRat) {
        return res.status(404).json({ error: "RAT not found" });
      }
      
      // Check authorization
      if (req.user!.role !== "admin") {
        const technician = await storage.getTechnicianByUserId(req.user!.userId);
        if (!technician || existingRat.technicianId !== technician.id) {
          return res.status(403).json({ error: "Access denied" });
        }
      }
      
      // Only allow PDF upload for non-sent RATs
      if (existingRat.sentAt) {
        return res.status(400).json({ error: "Cannot upload PDF to a sent RAT" });
      }
      
      if (!req.file) {
        return res.status(400).json({ error: "No PDF file uploaded" });
      }
      
      // Validate file type
      if (req.file.mimetype !== "application/pdf") {
        return res.status(400).json({ error: "Only PDF files are allowed" });
      }
      
      // Check file size (max 5MB for database storage)
      if (req.file.size > 5 * 1024 * 1024) {
        return res.status(400).json({ error: "PDF file size must be under 5MB" });
      }
      
      // Store PDF as base64 in database
      const pdfBase64 = `data:application/pdf;base64,${req.file.buffer.toString("base64")}`;
      const filename = req.file.originalname || `RAT-${existingRat.reportNumber}.pdf`;
      
      // Only update status to rascunho if currently pendente
      const updateData: any = {
        importedPdfUrl: pdfBase64,
        importedPdfFilename: filename,
      };
      
      if (existingRat.status === "pendente") {
        updateData.status = "rascunho";
      }
      
      const rat = await storage.updateRat(req.params.id, updateData);
      
      patchRatInCache(rat.id, {
        importedPdfUrl: rat.importedPdfUrl,
        importedPdfFilename: rat.importedPdfFilename,
        status: rat.status,
      });
      res.json(rat);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Download imported PDF for RAT (accepts token via query parameter for mobile PWA compatibility)
  app.get("/api/rats/:id/download-imported-pdf", async (req: AuthRequest, res) => {
    try {
      // Try to get token from query parameter (for mobile) or header
      let token = req.query.token as string | undefined;
      if (!token) {
        const authHeader = req.headers.authorization;
        if (authHeader?.startsWith("Bearer ")) {
          token = authHeader.substring(7);
        }
      }
      
      if (!token) {
        return res.status(401).json({ error: "Token required" });
      }
      
      // Verify token
      let decoded;
      try {
        decoded = verifyToken(token);
      } catch (err) {
        return res.status(401).json({ error: "Invalid token" });
      }
      
      const user = await storage.getUser(decoded.userId);
      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }
      
      req.user = { userId: user.id, username: user.username || "", role: user.role as "admin" | "assistente" };
      
      const rat = await storage.getRat(req.params.id);
      
      if (!rat) {
        return res.status(404).json({ error: "RAT not found" });
      }
      
      // Check authorization
      if (req.user!.role !== "admin") {
        const technician = await storage.getTechnicianByUserId(req.user!.userId);
        if (!technician || rat.technicianId !== technician.id) {
          return res.status(403).json({ error: "Access denied" });
        }
      }
      
      if (!rat.importedPdfUrl) {
        return res.status(404).json({ error: "No imported PDF for this RAT" });
      }
      
      // Extract base64 data
      const base64Data = rat.importedPdfUrl.replace(/^data:application\/pdf;base64,/, "");
      const pdfBuffer = Buffer.from(base64Data, "base64");
      
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${rat.importedPdfFilename || "RAT.pdf"}"`);
      res.send(pdfBuffer);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Delete imported PDF from RAT
  app.delete("/api/rats/:id/pdf", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const existingRat = await storage.getRat(req.params.id);
      
      if (!existingRat) {
        return res.status(404).json({ error: "RAT not found" });
      }
      
      // Check authorization
      if (req.user!.role !== "admin") {
        const technician = await storage.getTechnicianByUserId(req.user!.userId);
        if (!technician || existingRat.technicianId !== technician.id) {
          return res.status(403).json({ error: "Access denied" });
        }
        
        // Technicians cannot delete PDF from sent or completed RATs
        if (existingRat.sentAt || existingRat.status === "completa") {
          return res.status(400).json({ error: "Cannot delete PDF from a completed or sent RAT" });
        }
      }
      
      const rat = await storage.updateRat(req.params.id, {
        importedPdfUrl: null,
        importedPdfFilename: null,
      });
      
      patchRatInCache(rat.id, { importedPdfUrl: null, importedPdfFilename: null });
      res.json(rat);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Generate RAT preview (HTML format)
  // Special handling: accepts token via query parameter for mobile PWA compatibility
  app.get("/api/rats/:id/preview", async (req: AuthRequest, res) => {
    try {
      // Try to get token from query parameter (for mobile) or header
      let token = req.query.token as string | undefined;
      if (!token) {
        const authHeader = req.headers.authorization;
        if (authHeader?.startsWith("Bearer ")) {
          token = authHeader.substring(7);
        }
      }
      
      if (!token) {
        return res.status(401).json({ error: "Token required" });
      }
      
      // Verify token
      let decoded;
      try {
        decoded = verifyToken(token);
      } catch (err) {
        return res.status(401).json({ error: "Invalid token" });
      }
      
      const user = await storage.getUser(decoded.userId);
      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }
      
      req.user = { userId: user.id, username: user.username || "", role: user.role as "admin" | "assistente" };
      
      const rat = await storage.getRat(req.params.id);
      
      if (!rat) {
        return res.status(404).json({ error: "RAT not found" });
      }
      
      // Check authorization
      if (req.user!.role !== "admin") {
        const technician = await storage.getTechnicianByUserId(req.user!.userId);
        if (!technician || rat.technicianId !== technician.id) {
          return res.status(403).json({ error: "Access denied" });
        }
      }
      
      // Get technician name
      const technician = await storage.getTechnician(rat.technicianId);
      
      // Parse form data
      const formData = rat.formData ? JSON.parse(rat.formData) : {};
      
      const html = rat.isSimplified ? generateSimplifiedRatHtml(rat, technician, formData) : generateRatHtml(rat, technician, formData);
      
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.setHeader("Content-Type", "text/html");
      res.send(html);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Generate RAT PDF download (server-side Puppeteer rendering)
  // Special handling: accepts token via query parameter for mobile PWA compatibility
  app.get("/api/rats/:id/pdf", async (req: AuthRequest, res) => {
    try {
      // Try to get token from query parameter (for mobile) or header
      let token = req.query.token as string | undefined;
      if (!token) {
        const authHeader = req.headers.authorization;
        if (authHeader?.startsWith("Bearer ")) {
          token = authHeader.substring(7);
        }
      }
      
      if (!token) {
        return res.status(401).json({ error: "Token required" });
      }
      
      // Verify token
      let decoded;
      try {
        decoded = verifyToken(token);
      } catch (err) {
        return res.status(401).json({ error: "Invalid token" });
      }
      
      const user = await storage.getUser(decoded.userId);
      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }
      
      req.user = { userId: user.id, username: user.username || "", role: user.role as "admin" | "assistente" };
      
      const rat = await storage.getRat(req.params.id);
      
      if (!rat) {
        return res.status(404).json({ error: "RAT not found" });
      }
      
      // Check authorization
      if (req.user!.role !== "admin") {
        const technician = await storage.getTechnicianByUserId(req.user!.userId);
        if (!technician || rat.technicianId !== technician.id) {
          return res.status(403).json({ error: "Access denied" });
        }
      }
      
      // Get technician name
      const technician = await storage.getTechnician(rat.technicianId);
      
      // Parse form data
      const formData = rat.formData ? JSON.parse(rat.formData) : {};
      
      const html = rat.isSimplified ? generateSimplifiedRatHtml(rat, technician, formData) : generateRatHtml(rat, technician, formData);
      
      // Generate PDF using browser pool (reuses browser, handles cleanup)
      console.log(`[PDF] Generating PDF using browser pool...`);
      const pdfBuffer = await generatePdfFromHtml(html);
      console.log(`[PDF] PDF generated successfully, size: ${pdfBuffer.length} bytes`);
      
      // Set headers for PDF display/download
      const reportNumber = rat.reportNumberManual || rat.reportNumber;
      const fileName = `RAT-${reportNumber}.pdf`;
      
      // Use inline for iOS Safari compatibility (displays PDF in browser)
      // Desktop browsers will still offer download option
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
      res.setHeader("Content-Length", pdfBuffer.length);
      res.setHeader("Cache-Control", "no-cache");
      res.end(Buffer.from(pdfBuffer));
      
    } catch (error: any) {
      console.error("PDF generation error:", error);
      res.status(500).json({ error: "Failed to generate PDF: " + error.message });
    }
  });

  // ── Pre-warm + keep-warm do cache de RATs ────────────────────────────────
  // Garante que a lista de RATs sempre carregue instantaneamente. O cache em
  // memória zera a cada restart do container; aqui ele é reaquecido com retry
  // (caso o banco ainda não esteja pronto logo após o deploy) e mantido quente
  // por um refresh periódico dentro do TTL — o usuário nunca pega cache frio,
  // exceto no primeiro ou segundo segundo de vida do servidor.
  const warmAdminRatsCache = async (): Promise<boolean> => {
    try {
      const data = await db.select(getRatsLightSelect()).from(rats).orderBy(desc(rats.createdAt));
      _ratsCache.set("admin", { data, ts: Date.now() });
      return true;
    } catch (err: any) {
      console.warn("[RATs cache] admin warm failed:", err.message);
      return false;
    }
  };

  // Aquecimento inicial: tenta a cada 2s (até ~4 min) até o primeiro sucesso.
  (async () => {
    for (let attempt = 0; attempt < 120; attempt++) {
      await new Promise((r) => setTimeout(r, attempt === 0 ? 500 : 2000));
      if (await warmAdminRatsCache()) {
        console.log(`[RATs cache] startup pre-warm complete (tentativa ${attempt + 1})`);
        break;
      }
    }
    // Warm up technicians cache as well
    _bgRefreshTechniciansCache().catch(() => {});
  })();

  // Keep-warm: reaquece dentro do TTL (10min) para o cache nunca esfriar.
  // Mantém o admin sempre quente e reaquece qualquer cache de técnico já carregado.
  setInterval(() => {
    warmAdminRatsCache().catch(() => {});
    _bgRefreshTechniciansCache().catch(() => {});
    for (const key of _ratsCache.keys()) {
      if (key.startsWith("tech:")) {
        const techId = key.slice("tech:".length);
        _bgRefreshRatsCache(key, async () =>
          db.select(getRatsLightSelect()).from(rats)
            .where(eq(rats.technicianId, techId))
            .orderBy(desc(rats.createdAt))
        ).catch(() => {});
      }
    }
  }, 4 * 60 * 1000); // 4 minutes - refresh every 4 min para manter dados frescos

  const httpServer = createServer(app);
  return httpServer;
}

function generateSimplifiedRatHtml(rat: any, technician: any, formData: any): string {
  const formatDate = (date: Date | string | null) => {
    if (!date) return "";
    return new Date(date).toLocaleDateString("pt-BR");
  };

  const isChecked = (arr: string[] | undefined, value: string) => {
    if (!arr) return false;
    return arr.some(v => v.toLowerCase() === value.toLowerCase());
  };

  const checkbox = (checked: boolean) => checked ? '☑' : '☐';
  const logoBase64 = RENNER_LOGO_BASE64;

  let photoSections: Record<string, Array<{data?: string; base64?: string; description?: string}>> = {};
  try {
    if (rat.photoSections) {
      photoSections = typeof rat.photoSections === 'string' ? JSON.parse(rat.photoSections) : rat.photoSections;
    }
  } catch (e) {
    console.error('Error parsing photoSections:', e);
  }

  let photoGalleryHtml = '';
  for (const [sectionKey, photos] of Object.entries(photoSections)) {
    if (Array.isArray(photos) && photos.length > 0) {
      let sectionPhotosHtml = '';
      let sectionHasPhotos = false;
      for (const photo of photos) {
        const photoData = photo?.data || photo?.base64;
        if (photo && photoData) {
          sectionHasPhotos = true;
          const imgSrc = photoData.startsWith('data:') ? photoData : `data:image/jpeg;base64,${photoData}`;
          sectionPhotosHtml += `<div style="page-break-inside: avoid; display: inline-block; width: 48%; vertical-align: top; margin: 0 1% 12px 1%; text-align: center;">
            <img src="${imgSrc}" style="display: block; margin: 0 auto; max-width: 100%; max-height: 260px; width: auto; height: auto; border: 1px solid #ccc; border-radius: 4px; object-fit: contain;" />
            ${photo.description ? `<p style="font-size: 9pt; color: #333; margin: 4px 0 0 0; font-weight: 500; word-wrap: break-word; overflow-wrap: break-word; word-break: break-word; max-width: 100%;">${photo.description}</p>` : ''}
          </div>`;
        }
      }
      if (sectionHasPhotos) {
        photoGalleryHtml += `<div style="font-size: 0;">
            ${sectionPhotosHtml}
        </div>`;
      }
    }
  }

  const techName = rat.technicianSignatureName || technician?.name || 'Técnico Responsável';
  let signatureHtml = `<div style="text-align: center; margin-top: 40px; page-break-inside: avoid;">
    <div style="display: inline-block; text-align: center;">
      <div style="border-top: 1px solid #000; width: 250px; margin: 0 auto; padding-top: 5px; font-size: 9pt;">${techName}</div>
    </div>
  </div>`;
  if (rat.technicianSignature) {
    const sigSrc = rat.technicianSignature.startsWith('data:') ? rat.technicianSignature : `data:image/png;base64,${rat.technicianSignature}`;
    signatureHtml = `<div style="text-align: center; margin-top: 40px; page-break-inside: avoid;">
      <div style="display: inline-block; text-align: center;">
        <img src="${sigSrc}" style="max-width: 280px; max-height: 100px; display: block; margin: 0 auto; background-color: #ffffff;" />
        <div style="border-top: 1px solid #000; width: 280px; margin: 5px auto 0; padding-top: 5px; font-size: 9pt;">
          ${techName}
        </div>
      </div>
    </div>`;
  }

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RAT Simplificada - ${rat.reportNumberManual || rat.reportNumber}</title>
  <style>
    @page { size: A4; margin: 10mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 10pt; line-height: 1.5; color: #000; background: #fff; }
    .page { max-width: 210mm; margin: 0 auto; padding: 10mm; overflow: hidden; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px; }
    .header-title { 
      background: linear-gradient(135deg, #6b6b6b 0%, #888888 100%);
      color: white; 
      padding: 10px 25px; 
      font-size: 13pt; 
      font-weight: bold;
      border-radius: 3px;
      box-shadow: 2px 2px 4px rgba(0,0,0,0.2);
    }
    .header-subtitle {
      font-size: 9pt;
      color: #fff;
      font-weight: normal;
      margin-top: 2px;
    }
    .logo { height: 50px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 8px; table-layout: fixed; }
    td, th { border: 1px solid #bbb; padding: 6px 8px; vertical-align: top; font-size: 10pt; overflow: hidden; word-wrap: break-word; overflow-wrap: break-word; word-break: normal; }
    p { word-wrap: break-word; overflow-wrap: break-word; word-break: normal; }
    img { max-width: 100%; height: auto; }
    .section-title { font-weight: bold; text-align: center; background: #f0f0f0; padding: 6px; font-size: 11pt; word-break: normal; }
    .subsection-title { font-weight: bold; text-align: center; background: #d9d9d9; padding: 5px; font-size: 10pt; word-break: normal; }
    .cb { margin-right: 20px; white-space: nowrap; }
    .text-section { min-height: 80px; padding: 8px; white-space: pre-wrap; font-size: 10pt; line-height: 1.6; }
    .signature-line { 
      border-top: 1px solid #000; 
      width: 200px; 
      margin: 40px auto 5px; 
      text-align: center;
      padding-top: 5px;
      font-size: 9pt;
    }
    .company-footer {
      text-align: center;
      margin-top: 40px;
      padding: 20px;
    }
    .company-footer .title { font-weight: bold; font-size: 11pt; margin-bottom: 15px; }
    .company-footer .logo-small { height: 40px; margin: 10px 0; }
    .company-footer .info { font-size: 9pt; line-height: 1.6; }
    .company-footer a { color: #0066cc; text-decoration: underline; }
    .doc-footer { 
      font-size: 7pt; 
      color: #666; 
      margin-top: 15px; 
      padding-top: 5px;
      border-top: 1px solid #ccc;
    }
    @media print { 
      body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } 
      .page { padding: 5mm; margin: 0; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div>
        <div class="header-title">RELATÓRIO DE ASSISTÊNCIA TÉCNICA
          <div class="header-subtitle">Simplificada</div>
        </div>
      </div>
      <img src="${logoBase64}" alt="Renner Coatings" class="logo" onerror="this.style.display='none'">
    </div>
    
    <table>
      <tr>
        <td style="width:50%">Relatório nº: ${rat.reportNumberManual || rat.reportNumber}</td>
        <td style="width:50%">Data abertura: ${formatDate(rat.openingDate || rat.openDate)}</td>
      </tr>
    </table>
    
    <table>
      <tr><td colspan="2" class="section-title">DADOS CLIENTE</td></tr>
      <tr>
        <td style="width:50%"><strong>Cliente:</strong> ${formData.clientNameEditable || rat.clientName || ''}</td>
        <td style="width:50%"><strong>Contato:</strong> ${formData.contact || ''}</td>
      </tr>
      <tr>
        <td><strong>Aplicadora:</strong> ${formData.applicator || ''}</td>
        <td><strong>Setor:</strong> ${formData.sector || ''}</td>
      </tr>
      <tr>
        <td><strong>Obra:</strong> ${formData.obraName || ''}</td>
        <td><strong>Tipo:</strong> <span class="cb">${checkbox((rat.projectType || formData.projectType) === 'manutencao')} Manutenção</span> <span class="cb">${checkbox((rat.projectType || formData.projectType) === 'nova')} Nova</span></td>
      </tr>
      <tr>
        <td colspan="2"><strong>Segmento:</strong>
          <span class="cb">${checkbox(isChecked(formData.segment, 'powder'))} Powder</span>
          <span class="cb">${checkbox(isChecked(formData.segment, 'performance'))} Performance</span>
          <span class="cb">${checkbox(isChecked(formData.segment, 'protective'))} Protective</span>
          <span class="cb">${checkbox(isChecked(formData.segment, 'marine'))} Marine</span>
        </td>
      </tr>
    </table>
    
    <table>
      <tr><td class="section-title">ATIVIDADES REALIZADAS</td></tr>
      <tr><td class="text-section">${formData.activityPerformed || formData.activitiesPerformed || ''}</td></tr>
    </table>
    
    <table>
      <tr><td class="section-title">COMENTÁRIOS GERAIS</td></tr>
      <tr><td class="text-section">${formData.generalComments || formData.comments || ''}</td></tr>
    </table>

    ${photoGalleryHtml ? `<div style="page-break-before: always;"></div>
    <table>
      <tr><td class="section-title">RELATÓRIO FOTOGRÁFICO</td></tr>
      <tr><td style="border: 1px solid #bbb; padding: 4px 8px;">
        ${photoGalleryHtml}
      </td></tr>
    </table>` : ''}
    
    <div style="page-break-inside: avoid;">
    ${signatureHtml}
    
    <div class="company-footer">
      <div class="title">Assistência Técnica</div>
      <img src="${logoBase64}" alt="Renner Coatings" class="logo-small" onerror="this.style.display='none'">
      <div class="info">
        <strong>Renner Herrmann S.A.</strong><br>
        Divisão Renner Coatings<br>
        Av. Juscelino Kubitschek de Oliveira, 12.453 - CIC<br>
        81.170-300 – Curitiba – PR – Brasil<br>
        <a href="https://www.rennercoatings.com">www.rennercoatings.com</a><br>
        <a href="https://www.renner.com.br">www.renner.com.br</a>
      </div>
    </div>
    
    <div class="doc-footer">1.400 F4-Relatório de Assistência Técnica Simplificado</div>
    </div>
  </div>
</body>
</html>`;
}

// Helper function to generate RAT HTML - matches F2-Relatorio template exactly
function generateRatHtml(rat: any, technician: any, formData: any): string {
  const formatDate = (date: Date | string | null) => {
    if (!date) return "";
    return new Date(date).toLocaleDateString("pt-BR");
  };

  const isChecked = (arr: string[] | undefined, value: string) => {
    if (!arr) return false;
    return arr.some(v => v.toLowerCase() === value.toLowerCase());
  };

  const checkbox = (checked: boolean) => checked ? '☑' : '☐';
  const naValue = (val: string | undefined | null) => val || '<span style="color:#c00">N/A</span>';

  // Use hardcoded logo base64
  const logoBase64 = RENNER_LOGO_BASE64;
  console.log('Logo base64 length:', logoBase64?.length || 0, 'starts with:', logoBase64?.substring(0, 50));

  // Build component rows HTML with categories (A, B, C, Diluente, Powder)
  const components = formData.components || [];
  let componentRowsHtml = '';
  
  // Group components by category
  const categoryLabels: Record<string, string> = {
    'A': 'Componente A',
    'B': 'Componente B', 
    'C': 'Componente C',
    'Componente A': 'Componente A',
    'Componente B': 'Componente B',
    'Componente C': 'Componente C',
    'Diluente': 'Diluente',
    'Powder': 'Powder'
  };
  
  for (const comp of components) {
    if (!comp.code && !comp.batch) continue;
    const categoryLabel = categoryLabels[comp.category] || comp.category || 'Componente';
    componentRowsHtml += '<tr><td colspan="3"><strong>' + categoryLabel + ':</strong> ' + (comp.code || '') + '</td></tr>' +
      '<tr><td>Lote: ' + (comp.batch || '') + '</td><td>Fabricação: ' + (comp.manufactureDate || '') + '</td><td>Validade: ' + (comp.expiryDate || '') + '</td></tr>';
    
    // Add component-specific additional fields
    // For diluente, use "Diluição Recomendada" instead of "Espessura Recomendada"
    const thicknessLabel = (comp.category === 'Diluente' || comp.category === 'diluente') ? 'Diluição Recomendada' : 'Espessura Recomendada';
    if (comp.technicalBulletin || comp.recommendedThickness) {
      componentRowsHtml += '<tr><td>Cód. Boletim Técnico: ' + (comp.technicalBulletin || naValue(null)) + '</td><td colspan="2">' + thicknessLabel + ': ' + (comp.recommendedThickness || naValue(null)) + '</td></tr>';
    }
    if (comp.complements) {
      componentRowsHtml += '<tr><td colspan="3">Complementos: ' + comp.complements + '</td></tr>';
    }
  }
  
  // Fallback for legacy format without categories
  if (componentRowsHtml === '' && components.length > 0) {
    for (let i = 0; i < 3; i++) {
      const c = components[i] || {};
      const letter = String.fromCharCode(65 + i);
      const codeVal = c.code || (i === 2 ? '<span style="color:#c00">N/A</span>' : '');
      componentRowsHtml += '<tr><td colspan="3"><strong>Código comp. ' + letter + ':</strong> ' + codeVal + '</td></tr>' +
        '<tr><td>Lote: ' + (c.batch || '') + '</td><td>Fabricação: ' + (c.manufactureDate || '') + '</td><td>Validade: ' + (c.expiryDate || '') + '</td></tr>';
    }
  }
  
  // Diluent row (legacy support)
  const diluentHtml = formData.diluent ? '<tr><td colspan="3"><strong>Diluente:</strong> ' + (formData.diluent || '') + '</td></tr>' +
    '<tr><td>Lote: ' + (formData.diluentBatch || '') + '</td><td>Fabricação: ' + (formData.diluentManufacture || '') + '</td><td>Validade: ' + (formData.diluentExpiry || '') + '</td></tr>' : '';

  // Parse photo sections - support both 'data' and 'base64' property names
  let photoSections: Record<string, Array<{data?: string; base64?: string; description?: string}>> = {};
  try {
    if (rat.photoSections) {
      photoSections = typeof rat.photoSections === 'string' ? JSON.parse(rat.photoSections) : rat.photoSections;
    }
  } catch (e) {
    console.error('Error parsing photoSections:', e);
  }

  // Generate photo gallery HTML
  const sectionLabels: Record<string, string> = {
    section1: 'Superfície/Substrato',
    section2: 'Preparação',
    section3: 'Aplicação',
    section4: 'Resultado Final',
    section5: 'Defeitos/Problemas',
    section6: 'Outros'
  };

  let photoGalleryHtml = '';
  for (const [sectionKey, photos] of Object.entries(photoSections)) {
    if (Array.isArray(photos) && photos.length > 0) {
      const sectionTitle = sectionLabels[sectionKey] || sectionKey;
      let sectionHasPhotos = false;
      let sectionPhotosHtml = '';
      
      for (const photo of photos) {
        // Support both 'data' and 'base64' property names
        const photoData = photo?.data || photo?.base64;
        if (photo && photoData) {
          sectionHasPhotos = true;
          const imgSrc = photoData.startsWith('data:') ? photoData : `data:image/jpeg;base64,${photoData}`;
          sectionPhotosHtml += `<div style="text-align: center; margin-bottom: 10px; overflow: hidden;">
            <img src="${imgSrc}" style="display: block; margin: 0 auto; max-width: 100%; max-height: 400px; width: auto; height: auto; border: 1px solid #ccc; border-radius: 4px; object-fit: contain;" />
            ${photo.description ? `<p style="font-size: 10pt; color: #333; margin: 2px 0 0 0; font-weight: 500; word-wrap: break-word; overflow-wrap: break-word; word-break: normal; max-width: 100%;">${photo.description}</p>` : ''}
          </div>`;
        }
      }
      
      if (sectionHasPhotos) {
        photoGalleryHtml += `<div style="margin-bottom: 6px;">
          <h4 style="font-size: 12pt; margin-bottom: 4px; color: #000; font-weight: bold;">${sectionTitle}</h4>
            ${sectionPhotosHtml}
        </div>`;
      }
    }
  }

  // Generate signature HTML
  const techName2 = rat.technicianSignatureName || technician?.name || 'Técnico Responsável';
  let signatureHtml = `<div class="signature-line">${techName2}</div>`;
  if (rat.technicianSignature) {
    const sigSrc = rat.technicianSignature.startsWith('data:') ? rat.technicianSignature : `data:image/png;base64,${rat.technicianSignature}`;
    signatureHtml = `<div style="text-align: center; margin-top: 40px;">
      <div style="display: inline-block; text-align: center;">
        <img src="${sigSrc}" style="max-width: 280px; max-height: 100px; display: block; margin: 0 auto; background-color: #ffffff;" />
        <div style="border-top: 1px solid #000; width: 280px; margin: 5px auto 0; padding-top: 5px; font-size: 9pt;">
          ${techName2}
        </div>
      </div>
    </div>`;
  }
  
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RAT - ${rat.reportNumberManual || rat.reportNumber}</title>
  <style>
    @page { size: A4; margin: 10mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 9pt; line-height: 1.4; color: #000; background: #fff; }
    .page { max-width: 210mm; margin: 0 auto; padding: 8mm; page-break-after: always; }
    .page:last-child { page-break-after: auto; }
    
    /* Header - exact F2 template */
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
    .header-title { 
      background: linear-gradient(135deg, #6b6b6b 0%, #888888 100%);
      color: white; 
      padding: 10px 25px; 
      font-size: 13pt; 
      font-weight: bold;
      border-radius: 3px;
      box-shadow: 2px 2px 4px rgba(0,0,0,0.2);
    }
    .logo { height: 50px; }
    
    /* Main table styling */
    table { width: 100%; border-collapse: collapse; margin-bottom: 3px; table-layout: fixed; }
    td, th { border: 1px solid #000; padding: 4px 6px; vertical-align: top; font-size: 9pt; overflow: hidden; word-wrap: break-word; overflow-wrap: break-word; word-break: normal; }
    p { word-wrap: break-word; overflow-wrap: break-word; word-break: normal; }
    img { max-width: 100%; height: auto; }
    
    /* Section headers */
    .section-title { font-weight: bold; text-align: center; background: #f0f0f0; padding: 5px; font-size: 10pt; word-break: normal; }
    .subsection-title { font-weight: bold; text-align: center; background: #d9d9d9; padding: 4px; font-size: 9pt; word-break: normal; }
    
    /* Checkbox styling */
    .cb { margin-right: 20px; white-space: nowrap; }
    
    /* Text sections */
    .text-section { min-height: 55px; padding: 5px; white-space: pre-wrap; }
    
    /* Legend row */
    .legend-row td { text-align: center; background: #f5f5f5; font-size: 8pt; padding: 3px; }
    
    /* Signature */
    .signature-line { 
      border-top: 1px solid #000; 
      width: 200px; 
      margin: 40px auto 5px; 
      text-align: center;
      padding-top: 5px;
      font-size: 9pt;
    }
    
    /* Company footer - Page 3 style */
    .company-footer {
      text-align: center;
      margin-top: 50px;
      padding: 20px;
    }
    .company-footer .title { font-weight: bold; font-size: 11pt; margin-bottom: 15px; }
    .company-footer .logo-small { height: 40px; margin: 10px 0; }
    .company-footer .info { font-size: 9pt; line-height: 1.6; }
    .company-footer a { color: #0066cc; text-decoration: underline; }
    
    /* Document footer */
    .doc-footer { 
      font-size: 7pt; 
      color: #666; 
      margin-top: 15px; 
      padding-top: 5px;
      border-top: 1px solid #ccc;
    }
    
    @media print { 
      body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } 
      .page { padding: 5mm; margin: 0; }
    }
  </style>
</head>
<body>
  <!-- PAGE 1 -->
  <div class="page">
    <div class="header">
      <div class="header-title">RELATÓRIO DE ASSISTÊNCIA TÉCNICA</div>
      <img src="${logoBase64}" alt="Renner Coatings" class="logo" onerror="this.style.display='none'">
    </div>
    
    <table>
      <tr>
        <td style="width:50%">Relatório nº: ${rat.reportNumberManual || rat.reportNumber}</td>
        <td style="width:50%">Data abertura: ${formatDate(rat.openingDate || rat.openDate)}</td>
      </tr>
      <tr>
        <td colspan="2" style="text-align:center; padding: 6px;">
          <span class="cb">${checkbox(isChecked(formData.serviceType, 'exigencia'))} Exigência</span>
          <span class="cb">${checkbox(isChecked(formData.serviceType, 'corretiva'))} Corretiva</span>
          <span class="cb">${checkbox(isChecked(formData.serviceType, 'preventiva'))} Preventiva</span>
          <span class="cb">${checkbox(isChecked(formData.serviceType, 'teste'))} Teste</span>
          <span class="cb">${checkbox(isChecked(formData.serviceType, 'rc'))} RC</span>
          <span class="cb">${checkbox(isChecked(formData.serviceType, 'outros'))} Outros</span>
        </td>
      </tr>
    </table>
    
    <table>
      <tr><td colspan="4" class="section-title">DADOS CLIENTE</td></tr>
      <tr>
        <td style="width:15%">Cliente:</td>
        <td style="width:35%">${rat.clientName || ''}</td>
        <td style="width:15%">Aplicadora:</td>
        <td style="width:35%">${formData.applicator || ''}</td>
      </tr>
      <tr>
        <td>Obra:</td>
        <td colspan="3">${formData.obraName || ''}</td>
      </tr>
      <tr>
        <td>Contato:</td>
        <td>${formData.contact || ''}</td>
        <td>E-mail:</td>
        <td>${formData.email || ''}</td>
      </tr>
      <tr>
        <td>Setor:</td>
        <td>${formData.sector || ''}</td>
        <td>Data de fechamento:</td>
        <td>${formatDate(rat.closingDate || rat.closeDate)}</td>
      </tr>
      <tr>
        <td>Segmento:</td>
        <td colspan="3">
          <span class="cb">${checkbox(isChecked(formData.segment, 'powder'))} Powder</span>
          <span class="cb">${checkbox(isChecked(formData.segment, 'performance'))} Performance</span>
          <span class="cb">${checkbox(isChecked(formData.segment, 'protective'))} Protective</span>
          <span class="cb">${checkbox(isChecked(formData.segment, 'marine'))} Marine</span>
        </td>
      </tr>
    </table>
    
    <table>
      <tr><td colspan="3" class="section-title">DADOS TÉCNICOS</td></tr>
      <tr><td colspan="3" class="subsection-title">Superfície</td></tr>
      <tr><td colspan="3">Substrato: ${formData.substrate || ''}</td></tr>
      <tr><td colspan="3">Agressividade a que o revestimento / pintura será submetido: ${formData.aggressiveness || ''}</td></tr>
      <tr><td colspan="3">Grau inicial da superfície: ${formData.initialGrade || ''}</td></tr>
      <tr><td colspan="3">Manutenção (ASTM D610) 0 a 10: ${rat.surfaceMaintenanceGrade != null ? `Grau ${rat.surfaceMaintenanceGrade}` : (formData.surfaceMaintenanceGrade != null ? `Grau ${formData.surfaceMaintenanceGrade}` : 'Não Aplicável')}</td></tr>
      <tr><td colspan="3">Tipo de preparo de superfície: ${formData.surfacePrep || ''}</td></tr>
      <tr><td colspan="3">Tipo de abrasivo: ${formData.abrasiveType || ''}</td></tr>
      <tr><td colspan="3">Rugosidade: ${formData.roughness || ''}</td></tr>
      
      <tr><td colspan="3" class="subsection-title">Produto</td></tr>
      <tr><td colspan="3">Produto / Descrição: ${formData.product?.description || ''}</td></tr>
      <tr><td colspan="3">Cor: ${formData.product?.color || ''}</td></tr>
      ${componentRowsHtml}
      ${diluentHtml}
    </table>
    
    <div class="doc-footer">1.400 F2 - Relatório de Assistência Técnica rev. 06 de 12/2025</div>
  </div>
  
  <!-- PAGE 2 -->
  <div class="page">
    <div class="header">
      <div class="header-title">RELATÓRIO DE ASSISTÊNCIA TÉCNICA</div>
      <img src="${logoBase64}" alt="Renner Coatings" class="logo" onerror="this.style.display='none'">
    </div>
    
    <table>
      <tr><td colspan="3" class="subsection-title">Características de aplicação</td></tr>
      <tr><td colspan="3">Viscosidade de trabalho (s) /Diluição (%): ${formData.application?.viscosity || ''}</td></tr>
      <tr><td colspan="3">Espessura seca total (E.F.S µm): ${formData.application?.totalThickness || ''}</td></tr>
      <tr>
        <td>Primer: ${formData.application?.primer || ''}</td>
        <td>Intermediário: ${formData.application?.intermediate || naValue(null)}</td>
        <td>Acabamento: ${formData.application?.finish || ''}</td>
      </tr>
      <tr><td colspan="3">Temperatura (ºC): ${formData.application?.temperature || ''}</td></tr>
      <tr><td colspan="3">URA (%): ${formData.application?.humidity || ''}</td></tr>
      <tr><td colspan="3">Superfície Aplicada/Peça: ${formData.application?.equipment || ''}</td></tr>
      <tr><td colspan="3">Método de Aplicação: ${formData.application?.method || ''}</td></tr>
      <tr><td colspan="3">Condições de aplicação: ${formData.application?.conditions || ''}</td></tr>
      <tr><td colspan="3">Observações Adicionais: ${rat.applicationNote || formData.applicationNote || ''}</td></tr>
      <tr class="legend-row">
        <td colspan="3" style="text-align:center;"><strong>Legenda</strong></td>
      </tr>
      <tr class="legend-row">
        <td>N/A: Não Aplicável</td>
        <td>FAB: Fabricação</td>
        <td>VAL.: Validade</td>
      </tr>
    </table>
    
    <table>
      <tr><td class="subsection-title">Produto e informações técnicas:</td></tr>
    </table>
    
    <table>
      <tr><td><strong>1-OBJETIVO:</strong></td></tr>
      <tr><td class="text-section">${formData.objective || ''}</td></tr>
    </table>
    
    <table>
      <tr><td><strong>2- PARTICIPANTES:</strong></td></tr>
      <tr><td class="text-section">${formData.participants || ''}</td></tr>
    </table>
    
    <table>
      <tr><td><strong>3-ATIVIDADES REALIZADAS:</strong></td></tr>
      <tr><td class="text-section">${formData.activitiesPerformed || ''}</td></tr>
    </table>
    
    <table>
      <tr><td><strong>4- COMENTÁRIOS:</strong></td></tr>
      <tr><td class="text-section">${formData.comments || ''}</td></tr>
    </table>
    
    <table>
      <tr><td><strong>5 – CONCLUSÃO:</strong></td></tr>
      <tr><td class="text-section">${formData.conclusion || ''}</td></tr>
    </table>
    
    ${photoGalleryHtml ? `<div style="page-break-before: always;"></div>` : ''}
    <table>
      <tr><td><strong>6 - RELATÓRIO FOTOGRÁFICO:</strong></td></tr>
      <tr><td class="text-section">
        ${photoGalleryHtml || formData.photoReport || '<em>Nenhuma foto anexada</em>'}
      </td></tr>
    </table>
    
    <table>
      <tr><td><strong>7 – DOCUMENTOS DE REFERÊNCIA:</strong></td></tr>
      <tr><td class="text-section">${formData.referenceDocuments || 'N/A'}</td></tr>
    </table>
    
    <div class="doc-footer">1.400 F2 - Relatório de Assistência Técnica rev. 06 de 12/2025</div>
  </div>
  
  <!-- PAGE 3 - Assinatura e Informações da Empresa -->
  <div class="page">
    <div class="header">
      <div class="header-title">RELATÓRIO DE ASSISTÊNCIA TÉCNICA</div>
      <img src="${logoBase64}" alt="Renner Coatings" class="logo" onerror="this.style.display='none'">
    </div>
    
    ${signatureHtml}
    
    <div class="company-footer">
      <div class="title">Assistência Técnica</div>
      <img src="${logoBase64}" alt="Renner Coatings" class="logo-small" onerror="this.style.display='none'">
      <div class="info">
        <strong>Renner Herrmann S.A.</strong><br>
        Divisão Renner Coatings<br>
        Av. Juscelino Kubitschek de Oliveira, 12.453 - CIC<br>
        81.170-300 – Curitiba – PR – Brasil<br>
        <a href="https://www.rennercoatings.com">www.rennercoatings.com</a><br>
        <a href="https://www.renner.com.br">www.renner.com.br</a>
      </div>
    </div>
    
    <div class="doc-footer">1.400 F2 - Relatório de Assistência Técnica rev. 06 de 12/2025</div>
  </div>
</body>
</html>`;
}
