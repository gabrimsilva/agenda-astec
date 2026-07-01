import {
  users,
  technicians,
  clients,
  clientSites,
  activityTypes,
  segments,
  regions,
  activities,
  approvals,
  dayMarkers,
  agendaBlocks,
  activityAttachments,
  auditLogs,
  technicianLocations,
  notifications,
  userPushSubscriptions,
  rats,
  type User,
  type InsertUser,
  type Technician,
  type InsertTechnician,
  type Client,
  type InsertClient,
  type ClientSite,
  type InsertClientSite,
  type ActivityType,
  type InsertActivityType,
  type Segment,
  type InsertSegment,
  type Region,
  type InsertRegion,
  type Activity,
  type InsertActivity,
  type Approval,
  type InsertApproval,
  type DayMarker,
  type InsertDayMarker,
  type AgendaBlock,
  type InsertAgendaBlock,
  type ActivityAttachment,
  type InsertActivityAttachment,
  type AuditLog,
  type InsertAuditLog,
  type TechnicianLocation,
  type InsertTechnicianLocation,
  type Notification,
  type InsertNotification,
  type UserPushSubscription,
  type InsertUserPushSubscription,
  type Rat,
  type InsertRat,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, gte, lte, desc, sql, like, ilike, or, isNotNull } from "drizzle-orm";

// Helper function to remove undefined values from update objects
function filterUndefined<T extends Record<string, any>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => v !== undefined)
  ) as Partial<T>;
}

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByDatasulUsername(datasulUsername: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, user: Partial<InsertUser>): Promise<User>;
  deleteUser(id: string): Promise<void>;
  
  // Technicians
  getTechnician(id: string): Promise<Technician | undefined>;
  getTechnicianByUserId(userId: string): Promise<Technician | undefined>;
  getAllTechnicians(): Promise<Technician[]>;
  createTechnician(technician: InsertTechnician): Promise<Technician>;
  createUserAndTechnician(data: { user: InsertUser; technician: Omit<InsertTechnician, 'userId'> }): Promise<{ user: User; technician: Technician }>;
  updateTechnician(id: string, technician: Partial<InsertTechnician>): Promise<Technician>;
  updateUserAndTechnician(technicianId: string, data: { password?: string; role?: string; name?: string; email?: string; datasulUsername?: string | null; phone?: string; team?: string; baseCity?: string; color?: string; avatarUrl?: string; vehicleInfo?: string; licenseNumber?: string; workHoursPerDay?: number; baseAddress?: string; baseNumero?: string; baseBairro?: string; baseState?: string; baseLatitude?: string | null; baseLongitude?: string | null }): Promise<{ user: User; technician: Technician }>;
  updateTechnicianDatasulProfile(technicianId: string, datasulUsername: string | null): Promise<User>;
  deleteTechnician(id: string): Promise<void>;
  countActivitiesByTechnicianId(technicianId: string): Promise<number>;
  
  // Clients
  getClient(id: string): Promise<Client | undefined>;
  getAllClients(): Promise<Client[]>;
  listClients(filters?: { 
    page?: number; 
    limit?: number; 
    search?: string; 
    region?: string; 
    segment?: string;
    active?: boolean;
  }): Promise<{ clients: Client[]; total: number; }>;
  createClient(client: InsertClient): Promise<Client>;
  updateClient(id: string, client: Partial<InsertClient>): Promise<Client>;
  deleteClient(id: string): Promise<void>;
  
  // Client Sites
  getClientSite(id: string): Promise<ClientSite | undefined>;
  getClientSitesByClientId(clientId: string): Promise<ClientSite[]>;
  createClientSite(site: InsertClientSite): Promise<ClientSite>;
  updateClientSite(id: string, site: Partial<InsertClientSite>): Promise<ClientSite>;
  deleteClientSite(id: string): Promise<void>;
  
  // Activity Types
  getActivityType(id: string): Promise<ActivityType | undefined>;
  getAllActivityTypes(): Promise<ActivityType[]>;
  createActivityType(type: InsertActivityType): Promise<ActivityType>;
  updateActivityType(id: string, type: Partial<InsertActivityType>): Promise<ActivityType>;
  deleteActivityType(id: string): Promise<void>;
  
  // Segments
  getSegment(id: string): Promise<Segment | undefined>;
  getAllSegments(): Promise<Segment[]>;
  createSegment(segment: InsertSegment): Promise<Segment>;
  updateSegment(id: string, segment: Partial<InsertSegment>): Promise<Segment>;
  deleteSegment(id: string): Promise<void>;
  
  // Regions
  getRegion(id: string): Promise<Region | undefined>;
  getAllRegions(): Promise<Region[]>;
  createRegion(region: InsertRegion): Promise<Region>;
  updateRegion(id: string, region: Partial<InsertRegion>): Promise<Region>;
  deleteRegion(id: string): Promise<void>;
  
  // Activities
  getActivity(id: string): Promise<Activity | undefined>;
  getActivitiesByTechnicianId(technicianId: string): Promise<Activity[]>;
  getActivitiesByDateRange(startDate: Date, endDate: Date): Promise<Activity[]>;
  createActivity(activity: InsertActivity): Promise<Activity>;
  updateActivity(id: string, activity: Partial<InsertActivity>): Promise<Activity>;
  deleteActivity(id: string): Promise<void>;
  
  // Approvals
  getApproval(id: string): Promise<Approval | undefined>;
  getApprovalByActivityId(activityId: string): Promise<Approval | undefined>;
  getPendingApprovals(): Promise<Approval[]>;
  createApproval(approval: InsertApproval): Promise<Approval>;
  updateApproval(id: string, approval: Partial<InsertApproval>): Promise<Approval>;
  
  // Day Markers
  getDayMarkersByTechnicianId(technicianId: string): Promise<DayMarker[]>;
  getDayMarkersByDateRange(startDate: Date, endDate: Date): Promise<DayMarker[]>;
  createDayMarker(marker: InsertDayMarker): Promise<DayMarker>;
  deleteDayMarker(id: string): Promise<void>;

  // Agenda Blocks (indisponibilidade: férias / compromissos)
  getAgendaBlock(id: string): Promise<AgendaBlock | undefined>;
  getAgendaBlocksByTechnicianId(technicianId: string): Promise<AgendaBlock[]>;
  getAgendaBlocksByDateRange(startDate: Date, endDate: Date): Promise<AgendaBlock[]>;
  createAgendaBlock(block: InsertAgendaBlock): Promise<AgendaBlock>;
  deleteAgendaBlock(id: string): Promise<void>;
  
  // Activity Attachments
  getActivityAttachments(activityId: string): Promise<ActivityAttachment[]>;
  createActivityAttachment(attachment: InsertActivityAttachment): Promise<ActivityAttachment>;
  deleteActivityAttachment(id: string): Promise<void>;
  
  // Audit Logs
  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;
  getAuditLogsByEntityId(entityId: string): Promise<AuditLog[]>;
  
  // Technician Locations (GPS telemetry)
  createTechnicianLocation(location: InsertTechnicianLocation): Promise<TechnicianLocation>;
  getLastTechnicianLocation(technicianId: string): Promise<TechnicianLocation | undefined>;
  getTechnicianLocationHistory(technicianId: string, limit?: number): Promise<TechnicianLocation[]>;
  
  // Map/Geo queries
  getClientsForMap(filters?: { region?: string; segment?: string; search?: string }): Promise<Array<Client & { sites: ClientSite[] }>>;
  
  // Notifications
  getUserNotifications(userId: string, limit?: number): Promise<Notification[]>;
  getNotification(id: string): Promise<Notification | undefined>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationAsRead(id: string, userId: string): Promise<void>;
  markAllNotificationsAsRead(userId: string): Promise<void>;
  
  // Push Subscriptions
  upsertPushSubscription(subscription: { userId: string; playerId: string; deviceType: string }): Promise<UserPushSubscription>;
  getUserPushSubscriptions(userId: string): Promise<UserPushSubscription[]>;
  
  // RATs (Relatório de Assistência Técnica)
  getRat(id: string): Promise<Rat | undefined>;
  getRatByActivityId(activityId: string): Promise<Rat | undefined>;
  getRatsByTechnicianId(technicianId: string, filters?: { status?: string; startDate?: Date; endDate?: Date }): Promise<Rat[]>;
  getAllRats(filters?: { technicianId?: string; clientId?: string; status?: string; startDate?: Date; endDate?: Date }): Promise<Rat[]>;
  createRat(rat: InsertRat): Promise<Rat>;
  updateRat(id: string, rat: Partial<InsertRat>): Promise<Rat>;
  deleteRat(id: string): Promise<void>;
  getNextRatNumber(): Promise<string>;
  getPendingRatsCount(technicianId: string): Promise<number>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async getUserByDatasulUsername(datasulUsername: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.datasulUsername, datasulUsername));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users);
  }

  async updateUser(id: string, updateData: Partial<InsertUser>): Promise<User> {
    const filtered = filterUndefined(updateData);
    const [user] = await db.update(users).set(filtered).where(eq(users.id, id)).returning();
    return user;
  }

  async deleteUser(id: string): Promise<void> {
    // Get technician to delete related data first (activities, day markers)
    const technician = await this.getTechnicianByUserId(id);
    if (technician) {
      // Delete technician-related data (CASCADE will handle technician deletion)
      await db.delete(dayMarkers).where(eq(dayMarkers.technicianId, technician.id));
      await db.delete(activities).where(eq(activities.technicianId, technician.id));
    }
    
    // Delete audit logs (foreign key constraint)
    await db.delete(auditLogs).where(eq(auditLogs.userId, id));
    
    // Delete user (CASCADE will automatically delete technician)
    await db.delete(users).where(eq(users.id, id));
  }

  // Technicians
  async getTechnician(id: string): Promise<Technician | undefined> {
    const [technician] = await db.select().from(technicians).where(eq(technicians.id, id));
    return technician || undefined;
  }

  async getTechnicianByUserId(userId: string): Promise<Technician | undefined> {
    const [technician] = await db.select().from(technicians).where(eq(technicians.userId, userId));
    return technician || undefined;
  }

  async getAllTechnicians(): Promise<Technician[]> {
    return await db.select().from(technicians);
  }

  async createTechnician(insertTechnician: InsertTechnician): Promise<Technician> {
    const [technician] = await db.insert(technicians).values(insertTechnician).returning();
    return technician;
  }

  async createUserAndTechnician(data: { user: InsertUser; technician: Omit<InsertTechnician, 'userId'> }): Promise<{ user: User; technician: Technician }> {
    // Use transaction to ensure atomicity - both user and technician are created or both fail
    return await db.transaction(async (tx) => {
      // Create user first
      const [user] = await tx.insert(users).values(data.user).returning();
      
      // Then create technician with the user's ID
      const [technician] = await tx.insert(technicians).values({
        ...data.technician,
        userId: user.id,
      }).returning();
      
      return { user, technician };
    });
  }

  async updateTechnician(id: string, updateData: Partial<InsertTechnician>): Promise<Technician> {
    const filtered = filterUndefined(updateData);
    const [technician] = await db.update(technicians).set(filtered).where(eq(technicians.id, id)).returning();
    return technician;
  }

  async updateUserAndTechnician(technicianId: string, data: { password?: string; role?: string; name?: string; email?: string; datasulUsername?: string | null; phone?: string; team?: string; baseCity?: string; color?: string; avatarUrl?: string; vehicleInfo?: string; licenseNumber?: string; workHoursPerDay?: number; baseAddress?: string; baseNumero?: string; baseBairro?: string; baseState?: string; baseLatitude?: string | null; baseLongitude?: string | null }): Promise<{ user: User; technician: Technician }> {
    // Get technician to find userId (outside transaction for simplicity)
    const existingTechnician = await this.getTechnician(technicianId);
    if (!existingTechnician) {
      throw new Error("Técnico não encontrado");
    }

    return await db.transaction(async (tx) => {
      // Separate user and technician fields
      const { password, role, name, email, datasulUsername, ...technicianData } = data;
      
      // Build user update object - include name and email to keep user table in sync
      const userUpdate: any = {};
      if (role) userUpdate.role = role;
      if (name) userUpdate.name = name;
      if (email) userUpdate.email = email;
      if (datasulUsername !== undefined) userUpdate.datasulUsername = datasulUsername || null;
      if (password) {
        // Import hashPassword dynamically to avoid circular dependency
        const { hashPassword } = await import("./auth");
        userUpdate.password = await hashPassword(password);
      }
      
      // Update user table
      let user: User | undefined;
      const filteredUserUpdate = filterUndefined(userUpdate);
      if (Object.keys(filteredUserUpdate).length > 0) {
        const [updatedUser] = await tx.update(users).set(filteredUserUpdate).where(eq(users.id, existingTechnician.userId!)).returning();
        user = updatedUser;
      } else {
        const [existingUser] = await tx.select().from(users).where(eq(users.id, existingTechnician.userId!));
        user = existingUser;
      }

      // Build technician update object - include all technician-specific fields
      const technicianUpdate: any = {};
      if (name) technicianUpdate.name = name;
      if (email) technicianUpdate.email = email;
      // Add remaining technician fields
      Object.assign(technicianUpdate, technicianData);
      
      // Update technician table
      let technician: Technician;
      const filteredTechUpdate = filterUndefined(technicianUpdate);
      if (Object.keys(filteredTechUpdate).length > 0) {
        const [updatedTech] = await tx.update(technicians).set(filteredTechUpdate).where(eq(technicians.id, technicianId)).returning();
        technician = updatedTech;
      } else {
        technician = existingTechnician;
      }

      if (!user) {
        throw new Error("Usuário não encontrado");
      }

      return { user, technician };
    });
  }

  async updateTechnicianDatasulProfile(technicianId: string, datasulUsername: string | null): Promise<User> {
    const existingTechnician = await this.getTechnician(technicianId);
    if (!existingTechnician || !existingTechnician.userId) {
      throw new Error("Técnico não encontrado");
    }
    const [updatedUser] = await db
      .update(users)
      .set({ datasulUsername: datasulUsername || null })
      .where(eq(users.id, existingTechnician.userId))
      .returning();
    if (!updatedUser) {
      throw new Error("Usuário não encontrado");
    }
    return updatedUser;
  }

  async deleteTechnician(id: string): Promise<void> {
    // Get technician to find associated userId
    const technician = await this.getTechnician(id);
    if (!technician) {
      throw new Error("Técnico não encontrado");
    }

    // Delete technician-related data first
    await db.delete(dayMarkers).where(eq(dayMarkers.technicianId, id));
    await db.delete(activities).where(eq(activities.technicianId, id));
    
    // Delete audit logs before deleting user
    await db.delete(auditLogs).where(eq(auditLogs.userId, technician.userId));
    
    // Delete user (CASCADE will automatically delete technician)
    await db.delete(users).where(eq(users.id, technician.userId));
  }

  async countActivitiesByTechnicianId(technicianId: string): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` })
      .from(activities)
      .where(eq(activities.technicianId, technicianId));
    return result[0]?.count || 0;
  }

  // Clients
  async getClient(id: string): Promise<Client | undefined> {
    const [client] = await db.select().from(clients).where(eq(clients.id, id));
    return client || undefined;
  }

  async getAllClients(): Promise<Client[]> {
    return await db.select().from(clients);
  }

  async listClients(filters?: { 
    page?: number; 
    limit?: number; 
    search?: string; 
    region?: string; 
    segment?: string;
    active?: boolean;
  }): Promise<{ clients: Client[]; total: number; }> {
    const page = filters?.page || 1;
    const limit = filters?.limit || 50;
    const offset = (page - 1) * limit;
    
    // Build where conditions
    const conditions = [];
    
    if (filters?.search) {
      conditions.push(
        or(
          ilike(clients.companyName, `%${filters.search}%`),
          ilike(clients.cnpj, `%${filters.search}%`),
          ilike(clients.contactName, `%${filters.search}%`)
        )
      );
    }
    
    if (filters?.region) {
      conditions.push(eq(clients.region, filters.region));
    }
    
    if (filters?.segment) {
      conditions.push(eq(clients.segment, filters.segment));
    }
    
    if (filters?.active !== undefined) {
      conditions.push(eq(clients.active, filters.active));
    }
    
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    
    // Get total count
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(clients)
      .where(whereClause);
    
    const total = countResult[0]?.count || 0;
    
    // Get paginated clients
    const clientsList = await db
      .select()
      .from(clients)
      .where(whereClause)
      .orderBy(desc(clients.createdAt))
      .limit(limit)
      .offset(offset);
    
    return { clients: clientsList, total };
  }

  async createClient(insertClient: InsertClient): Promise<Client> {
    const [client] = await db.insert(clients).values(insertClient).returning();
    return client;
  }

  async updateClient(id: string, updateData: Partial<InsertClient>): Promise<Client> {
    const filtered = filterUndefined(updateData);
    const [client] = await db.update(clients).set(filtered).where(eq(clients.id, id)).returning();
    return client;
  }

  async deleteClient(id: string): Promise<void> {
    await db.delete(clients).where(eq(clients.id, id));
  }

  // Client Sites
  async getClientSite(id: string): Promise<ClientSite | undefined> {
    const [site] = await db.select().from(clientSites).where(eq(clientSites.id, id));
    return site || undefined;
  }

  async getClientSitesByClientId(clientId: string): Promise<ClientSite[]> {
    return await db.select().from(clientSites).where(eq(clientSites.clientId, clientId));
  }

  async createClientSite(insertSite: InsertClientSite): Promise<ClientSite> {
    const [site] = await db.insert(clientSites).values(insertSite).returning();
    return site;
  }

  async updateClientSite(id: string, updateData: Partial<InsertClientSite>): Promise<ClientSite> {
    const filtered = filterUndefined(updateData);
    const [site] = await db.update(clientSites).set(filtered).where(eq(clientSites.id, id)).returning();
    return site;
  }

  async deleteClientSite(id: string): Promise<void> {
    await db.delete(clientSites).where(eq(clientSites.id, id));
  }

  // Activity Types
  async getActivityType(id: string): Promise<ActivityType | undefined> {
    const [type] = await db.select().from(activityTypes).where(eq(activityTypes.id, id));
    return type || undefined;
  }

  async getAllActivityTypes(): Promise<ActivityType[]> {
    return await db.select().from(activityTypes).orderBy(activityTypes.name);
  }

  async createActivityType(insertType: InsertActivityType): Promise<ActivityType> {
    const [type] = await db.insert(activityTypes).values(insertType).returning();
    return type;
  }

  async updateActivityType(id: string, updateData: Partial<InsertActivityType>): Promise<ActivityType> {
    const filtered = filterUndefined(updateData);
    const [type] = await db.update(activityTypes).set(filtered).where(eq(activityTypes.id, id)).returning();
    return type;
  }

  async deleteActivityType(id: string): Promise<void> {
    await db.delete(activityTypes).where(eq(activityTypes.id, id));
  }

  // Segments
  async getSegment(id: string): Promise<Segment | undefined> {
    const [segment] = await db.select().from(segments).where(eq(segments.id, id));
    return segment || undefined;
  }

  async getAllSegments(): Promise<Segment[]> {
    return await db.select().from(segments).where(eq(segments.active, true)).orderBy(segments.name);
  }

  async createSegment(insertSegment: InsertSegment): Promise<Segment> {
    const [segment] = await db.insert(segments).values(insertSegment).returning();
    return segment;
  }

  async updateSegment(id: string, updateData: Partial<InsertSegment>): Promise<Segment> {
    const filtered = filterUndefined(updateData);
    const [segment] = await db.update(segments).set(filtered).where(eq(segments.id, id)).returning();
    return segment;
  }

  async deleteSegment(id: string): Promise<void> {
    await db.delete(segments).where(eq(segments.id, id));
  }

  // Regions
  async getRegion(id: string): Promise<Region | undefined> {
    const [region] = await db.select().from(regions).where(eq(regions.id, id));
    return region || undefined;
  }

  async getAllRegions(): Promise<Region[]> {
    return await db.select().from(regions).where(eq(regions.active, true)).orderBy(regions.name);
  }

  async createRegion(insertRegion: InsertRegion): Promise<Region> {
    const [region] = await db.insert(regions).values(insertRegion).returning();
    return region;
  }

  async updateRegion(id: string, updateData: Partial<InsertRegion>): Promise<Region> {
    const filtered = filterUndefined(updateData);
    const [region] = await db.update(regions).set(filtered).where(eq(regions.id, id)).returning();
    return region;
  }

  async deleteRegion(id: string): Promise<void> {
    await db.delete(regions).where(eq(regions.id, id));
  }

  // Activities
  async getActivity(id: string): Promise<Activity | undefined> {
    const [activity] = await db.select().from(activities).where(eq(activities.id, id));
    return activity || undefined;
  }

  async getActivitiesByTechnicianId(technicianId: string): Promise<any[]> {
    const results = await db
      .select({
        activity: activities,
        client: {
          contactName: clients.contactName,
          contactPhone: clients.contactPhone,
          contactEmail: clients.contactEmail,
        }
      })
      .from(activities)
      .leftJoin(clients, eq(activities.clientId, clients.id))
      .where(eq(activities.technicianId, technicianId))
      .orderBy(desc(activities.scheduledDate));
    
    return results.map(r => ({ ...r.activity, client: r.client }));
  }

  async getActivitiesByDateRange(startDate: Date, endDate: Date): Promise<any[]> {
    const results = await db
      .select({
        activity: activities,
        client: {
          id: clients.id,
          name: clients.companyName,
          contactName: clients.contactName,
          contactPhone: clients.contactPhone,
          contactEmail: clients.contactEmail,
        },
        technician: {
          id: technicians.id,
          name: technicians.name,
          color: technicians.color,
        },
        activityType: {
          id: activityTypes.id,
          name: activityTypes.name,
        }
      })
      .from(activities)
      .leftJoin(clients, eq(activities.clientId, clients.id))
      .leftJoin(technicians, eq(activities.technicianId, technicians.id))
      .leftJoin(activityTypes, eq(activities.activityTypeId, activityTypes.id))
      .where(
        or(
          // Atividade inicia dentro do período
          and(
            gte(activities.scheduledDate, startDate),
            lte(activities.scheduledDate, endDate)
          ),
          // Atividade multi-dia termina dentro do período
          and(
            isNotNull(activities.endDate),
            gte(activities.endDate, startDate),
            lte(activities.endDate, endDate)
          ),
          // Atividade multi-dia abrange todo o período
          and(
            isNotNull(activities.endDate),
            lte(activities.scheduledDate, startDate),
            gte(activities.endDate, endDate)
          )
        )
      )
      .orderBy(activities.scheduledDate);
    
    return results.map(r => ({ 
      ...r.activity, 
      client: r.client, 
      technician: r.technician,
      activityType: r.activityType
    }));
  }

  async createActivity(insertActivity: InsertActivity): Promise<Activity> {
    const [activity] = await db.insert(activities).values(insertActivity).returning();
    return activity;
  }

  async updateActivity(id: string, updateData: Partial<InsertActivity>): Promise<Activity> {
    const filtered = filterUndefined(updateData);
    const updatedData = { ...filtered, updatedAt: new Date() };
    const [activity] = await db.update(activities).set(updatedData).where(eq(activities.id, id)).returning();
    return activity;
  }

  async deleteActivity(id: string): Promise<void> {
    await db.delete(activities).where(eq(activities.id, id));
  }

  // Approvals
  async getApproval(id: string): Promise<Approval | undefined> {
    const [approval] = await db.select().from(approvals).where(eq(approvals.id, id));
    return approval || undefined;
  }

  async getApprovalByActivityId(activityId: string): Promise<Approval | undefined> {
    const [approval] = await db.select().from(approvals).where(eq(approvals.activityId, activityId));
    return approval || undefined;
  }

  async getPendingApprovals(): Promise<Approval[]> {
    return await db.select().from(approvals).where(eq(approvals.status, "pendente")).orderBy(desc(approvals.submittedAt));
  }

  async createApproval(insertApproval: InsertApproval): Promise<Approval> {
    const [approval] = await db.insert(approvals).values(insertApproval).returning();
    return approval;
  }

  async updateApproval(id: string, updateData: Partial<InsertApproval>): Promise<Approval> {
    const filtered = filterUndefined(updateData);
    const [approval] = await db.update(approvals).set(filtered).where(eq(approvals.id, id)).returning();
    return approval;
  }

  // Day Markers
  async getDayMarkersByTechnicianId(technicianId: string): Promise<DayMarker[]> {
    return await db.select().from(dayMarkers).where(eq(dayMarkers.technicianId, technicianId));
  }

  async getDayMarkersByDateRange(startDate: Date, endDate: Date): Promise<DayMarker[]> {
    return await db
      .select()
      .from(dayMarkers)
      .where(
        and(
          gte(dayMarkers.date, startDate),
          lte(dayMarkers.date, endDate)
        )
      );
  }

  async createDayMarker(insertMarker: InsertDayMarker): Promise<DayMarker> {
    const [marker] = await db.insert(dayMarkers).values(insertMarker).returning();
    return marker;
  }

  async deleteDayMarker(id: string): Promise<void> {
    await db.delete(dayMarkers).where(eq(dayMarkers.id, id));
  }

  // Agenda Blocks (indisponibilidade)
  async getAgendaBlock(id: string): Promise<AgendaBlock | undefined> {
    const [block] = await db.select().from(agendaBlocks).where(eq(agendaBlocks.id, id));
    return block || undefined;
  }

  async getAgendaBlocksByTechnicianId(technicianId: string): Promise<AgendaBlock[]> {
    return await db.select().from(agendaBlocks).where(eq(agendaBlocks.technicianId, technicianId));
  }

  async getAgendaBlocksByDateRange(startDate: Date, endDate: Date): Promise<AgendaBlock[]> {
    // Retorna bloqueios que se sobrepõem ao período [startDate, endDate]
    return await db
      .select()
      .from(agendaBlocks)
      .where(
        and(
          lte(agendaBlocks.startDate, endDate),
          gte(agendaBlocks.endDate, startDate)
        )
      );
  }

  async createAgendaBlock(insertBlock: InsertAgendaBlock): Promise<AgendaBlock> {
    const [block] = await db.insert(agendaBlocks).values(insertBlock).returning();
    return block;
  }

  async deleteAgendaBlock(id: string): Promise<void> {
    await db.delete(agendaBlocks).where(eq(agendaBlocks.id, id));
  }

  // Activity Attachments
  async getActivityAttachments(activityId: string): Promise<ActivityAttachment[]> {
    return await db.select().from(activityAttachments).where(eq(activityAttachments.activityId, activityId));
  }

  async createActivityAttachment(insertAttachment: InsertActivityAttachment): Promise<ActivityAttachment> {
    const [attachment] = await db.insert(activityAttachments).values(insertAttachment).returning();
    return attachment;
  }

  async deleteActivityAttachment(id: string): Promise<void> {
    await db.delete(activityAttachments).where(eq(activityAttachments.id, id));
  }

  // Audit Logs
  async createAuditLog(insertLog: InsertAuditLog): Promise<AuditLog> {
    const [log] = await db.insert(auditLogs).values(insertLog).returning();
    return log;
  }

  async getAuditLogsByEntityId(entityId: string): Promise<AuditLog[]> {
    return await db.select().from(auditLogs).where(eq(auditLogs.entityId, entityId)).orderBy(desc(auditLogs.createdAt));
  }

  // Technician Locations (GPS telemetry)
  async createTechnicianLocation(insertLocation: InsertTechnicianLocation): Promise<TechnicianLocation> {
    const [location] = await db.insert(technicianLocations).values(insertLocation).returning();
    return location;
  }

  async getLastTechnicianLocation(technicianId: string): Promise<TechnicianLocation | undefined> {
    const [location] = await db
      .select()
      .from(technicianLocations)
      .where(eq(technicianLocations.technicianId, technicianId))
      .orderBy(desc(technicianLocations.updatedAt))
      .limit(1);
    return location || undefined;
  }

  async getTechnicianLocationHistory(technicianId: string, limit: number = 100): Promise<TechnicianLocation[]> {
    return await db
      .select()
      .from(technicianLocations)
      .where(eq(technicianLocations.technicianId, technicianId))
      .orderBy(desc(technicianLocations.updatedAt))
      .limit(limit);
  }

  // Map/Geo queries
  async getClientsForMap(filters?: { region?: string; segment?: string; search?: string }): Promise<Array<Client & { sites: ClientSite[] }>> {
    // Build where conditions
    const conditions = [];
    
    // Only get clients with valid coordinates
    conditions.push(isNotNull(clients.latitude));
    conditions.push(isNotNull(clients.longitude));
    
    if (filters?.region) {
      conditions.push(eq(clients.region, filters.region));
    }
    
    if (filters?.segment) {
      conditions.push(eq(clients.segment, filters.segment));
    }
    
    if (filters?.search) {
      conditions.push(
        or(
          ilike(clients.companyName, `%${filters.search}%`),
          ilike(clients.contactName, `%${filters.search}%`),
          ilike(clients.internalCode, `%${filters.search}%`)
        )
      );
    }

    // Get clients with coordinates from the clients table directly
    const clientsData = await db
      .select()
      .from(clients)
      .where(and(...conditions));

    // Create a virtual site from client's primary address for backward compatibility
    const clientsWithSites = clientsData.map((client) => ({
      ...client,
      sites: [{
        id: client.id, // Use client ID as site ID
        clientId: client.id,
        siteName: client.companyName, // Use company name as site name
        address: client.address || "",
        city: client.city || "",
        state: client.state || "",
        zipCode: null,
        latitude: client.latitude,
        longitude: client.longitude,
        accessRequirements: null,
        createdAt: client.createdAt,
      }],
    }));

    return clientsWithSites;
  }

  // Notifications
  async getUserNotifications(userId: string, limit: number = 50): Promise<Notification[]> {
    return await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);
  }

  async getNotification(id: string): Promise<Notification | undefined> {
    const [notification] = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, id));
    return notification || undefined;
  }

  async createNotification(insertNotification: InsertNotification): Promise<Notification> {
    const [notification] = await db
      .insert(notifications)
      .values(insertNotification)
      .returning();
    return notification;
  }

  async markNotificationAsRead(id: string, userId: string): Promise<void> {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
  }

  async markAllNotificationsAsRead(userId: string): Promise<void> {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
  }

  // Push Subscriptions
  async upsertPushSubscription(subscription: { userId: string; playerId: string; deviceType: string }): Promise<UserPushSubscription> {
    const existing = await db
      .select()
      .from(userPushSubscriptions)
      .where(eq(userPushSubscriptions.playerId, subscription.playerId));

    if (existing.length > 0) {
      const [updated] = await db
        .update(userPushSubscriptions)
        .set({
          userId: subscription.userId,
          isActive: true,
          lastSeenAt: new Date(),
        })
        .where(eq(userPushSubscriptions.playerId, subscription.playerId))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(userPushSubscriptions)
        .values({
          userId: subscription.userId,
          playerId: subscription.playerId,
        })
        .returning();
      return created;
    }
  }

  async getUserPushSubscriptions(userId: string): Promise<UserPushSubscription[]> {
    return await db
      .select()
      .from(userPushSubscriptions)
      .where(and(
        eq(userPushSubscriptions.userId, userId),
        eq(userPushSubscriptions.isActive, true)
      ));
  }

  // RATs (Relatório de Assistência Técnica)
  async getRat(id: string): Promise<Rat | undefined> {
    const [rat] = await db.select().from(rats).where(eq(rats.id, id));
    return rat || undefined;
  }

  async getRatByActivityId(activityId: string): Promise<Rat | undefined> {
    const [rat] = await db.select().from(rats).where(eq(rats.activityId, activityId));
    return rat || undefined;
  }

  async getRatsByTechnicianId(
    technicianId: string, 
    filters?: { status?: string; startDate?: Date; endDate?: Date }
  ): Promise<Rat[]> {
    let conditions = [eq(rats.technicianId, technicianId)];
    
    if (filters?.status) {
      conditions.push(eq(rats.status, filters.status as any));
    }
    if (filters?.startDate) {
      conditions.push(gte(rats.openDate, filters.startDate));
    }
    if (filters?.endDate) {
      conditions.push(lte(rats.openDate, filters.endDate));
    }
    
    return await db
      .select()
      .from(rats)
      .where(and(...conditions))
      .orderBy(desc(rats.createdAt));
  }

  async getAllRats(filters?: { 
    technicianId?: string; 
    clientId?: string; 
    status?: string; 
    startDate?: Date; 
    endDate?: Date 
  }): Promise<Rat[]> {
    let conditions: any[] = [];
    
    if (filters?.technicianId) {
      conditions.push(eq(rats.technicianId, filters.technicianId));
    }
    if (filters?.clientId) {
      conditions.push(eq(rats.clientId, filters.clientId));
    }
    if (filters?.status) {
      conditions.push(eq(rats.status, filters.status as any));
    }
    if (filters?.startDate) {
      conditions.push(gte(rats.openDate, filters.startDate));
    }
    if (filters?.endDate) {
      conditions.push(lte(rats.openDate, filters.endDate));
    }
    
    const query = conditions.length > 0
      ? db.select().from(rats).where(and(...conditions)).orderBy(desc(rats.createdAt))
      : db.select().from(rats).orderBy(desc(rats.createdAt));
    
    return await query;
  }

  async createRat(insertRat: InsertRat): Promise<Rat> {
    const [rat] = await db.insert(rats).values(insertRat).returning();
    return rat;
  }

  async updateRat(id: string, updateData: Partial<InsertRat>): Promise<Rat> {
    const filtered = filterUndefined(updateData);
    const [rat] = await db
      .update(rats)
      .set({ ...filtered, updatedAt: new Date() })
      .where(eq(rats.id, id))
      .returning();
    return rat;
  }

  async deleteRat(id: string): Promise<void> {
    await db.delete(rats).where(eq(rats.id, id));
  }

  async getNextRatNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `RAT-${year}-`;
    
    // Get the highest number for this year
    const result = await db
      .select({ reportNumber: rats.reportNumber })
      .from(rats)
      .where(like(rats.reportNumber, `${prefix}%`))
      .orderBy(desc(rats.reportNumber))
      .limit(1);
    
    if (result.length === 0) {
      return `${prefix}0001`;
    }
    
    const lastNumber = result[0].reportNumber;
    const numPart = parseInt(lastNumber.replace(prefix, ''), 10);
    const nextNum = (numPart + 1).toString().padStart(4, '0');
    
    return `${prefix}${nextNum}`;
  }

  async getPendingRatsCount(technicianId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(rats)
      .where(and(
        eq(rats.technicianId, technicianId),
        eq(rats.status, 'pendente')
      ));
    
    return result[0]?.count || 0;
  }
}

export const storage = new DatabaseStorage();
