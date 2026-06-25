import { Server as SocketIOServer, Socket } from "socket.io";
import type { Server } from "http";
import { storage } from "./storage";
import { verifyToken } from "./auth";
import { z } from "zod";

// Socket-specific schema with type coercion for GPS location payloads
// Drizzle decimal columns expect numbers in the insert schema
const socketLocationSchema = z.object({
  technicianId: z.string().min(1, "technicianId is required"),
  latitude: z.coerce.number().refine(val => !Number.isNaN(val), { message: "latitude must be a valid number" }),
  longitude: z.coerce.number().refine(val => !Number.isNaN(val), { message: "longitude must be a valid number" }),
  accuracy: z.number().nullable().optional(),
  battery: z.number().nullable().optional(),
  gpsStatus: z.enum(["ativo", "inativo"]).default("ativo"),
  connectionStatus: z.enum(["online", "offline"]).default("online"),
  deviceModel: z.string().nullable().optional(),
});

type SocketLocationData = z.input<typeof socketLocationSchema>;
type SocketLocation = z.infer<typeof socketLocationSchema>;

interface AuthenticatedSocket extends Socket {
  userId?: string;
  role?: string;
  technicianId?: string;
}

let io: SocketIOServer | null = null;

export function setupWebSocket(server: Server) {
  io = new SocketIOServer(server, {
    path: "/socket.io",
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    },
    pingInterval: 10000,
    pingTimeout: 5000,
    transports: ["websocket", "polling"]
  });

  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.query.token;

      if (!token) {
        console.log("[Socket.IO] Connection rejected: No token provided");
        return next(new Error("Authentication required"));
      }

      const decoded = verifyToken(token as string);
      if (!decoded) {
        console.log("[Socket.IO] Connection rejected: Invalid token");
        return next(new Error("Invalid or expired token"));
      }

      socket.userId = decoded.userId;
      socket.role = decoded.role;

      console.log(`[Socket.IO] Authenticated: ${decoded.userId} (${decoded.role})`);
      next();
    } catch (error) {
      console.error("[Socket.IO] Auth error:", error);
      next(new Error("Authentication failed"));
    }
  });

  io.on("connection", (socket: AuthenticatedSocket) => {
    console.log(`[Socket.IO] Client connected: ${socket.userId} (${socket.role}). Total: ${io?.engine.clientsCount}`);

    if (socket.role === "admin") {
      socket.join("admins");
      console.log(`[Socket.IO] Admin ${socket.userId} joined admins room`);
    } else if (socket.role === "assistente") {
      socket.join("technicians");
      console.log(`[Socket.IO] Technician ${socket.userId} joined technicians room`);
    }

    socket.emit("connected", {
      message: "Socket.IO connection established",
      userId: socket.userId,
      role: socket.role
    });

    socket.on("location_update", async (data: SocketLocationData) => {
      try {
        console.log(`[Socket.IO] Location update from ${socket.userId}:`, data?.technicianId);

        // Validate and transform payload using Zod schema
        const parseResult = socketLocationSchema.safeParse(data);
        
        if (!parseResult.success) {
          console.error("[Socket.IO] Validation error:", parseResult.error.errors);
          socket.emit("error", { message: `Validation failed: ${parseResult.error.errors[0]?.message}` });
          return;
        }

        const validatedData = parseResult.data;

        if (socket.role === "assistente") {
          const technician = await storage.getTechnician(validatedData.technicianId);
          
          if (!technician || technician.userId !== socket.userId) {
            socket.emit("error", { message: "Unauthorized: You can only update your own location" });
            return;
          }
        }

        const location = await storage.createTechnicianLocation(validatedData as SocketLocation);
        socket.technicianId = validatedData.technicianId;

        // Normalize broadcast payload with numeric coordinates for consistent client handling
        const normalizedLocation = {
          ...location,
          latitude: parseFloat(String(location.latitude)),
          longitude: parseFloat(String(location.longitude)),
        };

        io?.to("admins").emit("location_update", normalizedLocation);

        console.log(`[Socket.IO] Location broadcasted for technician ${validatedData.technicianId}`);
      } catch (error) {
        console.error("[Socket.IO] Error processing location:", error);
        socket.emit("error", { 
          message: error instanceof Error ? error.message : "Unknown error" 
        });
      }
    });

    socket.on("disconnect", (reason) => {
      console.log(`[Socket.IO] Client disconnected: ${socket.userId}. Reason: ${reason}. Total: ${io?.engine.clientsCount}`);
    });

    socket.on("error", (error) => {
      console.error(`[Socket.IO] Error for ${socket.userId}:`, error);
    });
  });

  console.log("[Socket.IO] Server initialized on /socket.io");

  return io;
}

export function broadcastLocationUpdate(location: any) {
  if (io) {
    // Normalize coordinates to numbers before broadcasting
    const normalizedLocation = {
      ...location,
      latitude: parseFloat(String(location.latitude)),
      longitude: parseFloat(String(location.longitude)),
    };
    io.to("admins").emit("location_update", normalizedLocation);
  }
}

// Broadcast activity changes to all connected clients
export function broadcastActivityUpdate(activity: any, action: "created" | "updated" | "deleted") {
  if (io) {
    console.log(`[Socket.IO] Broadcasting activity ${action}:`, activity.id);
    // Broadcast to both admins and technicians
    io.emit("activity_update", { activity, action });
  }
}

export function getIO() {
  return io;
}
