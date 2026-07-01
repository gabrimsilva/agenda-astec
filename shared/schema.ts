import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, pgEnum, decimal, boolean, unique, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enums
export const userRoleEnum = pgEnum("user_role", ["admin", "assistente"]);
export const activityStatusEnum = pgEnum("activity_status", ["planejado", "aCaminho", "emExecucao", "concluido", "reprovado", "cancelado"]);
export const activityCategoryEnum = pgEnum("activity_category", ["efetivo", "adicional", "perda"]);
// Categorização da atividade (independente da categoria pai do tipo de atividade)
export const activityCategorizationEnum = pgEnum("activity_categorization", ["administrativo", "visita_tecnica", "deslocamento", "qualificacao", "ociosidade"]);
// Opções de categorização (valor no banco + rótulo de exibição) para uso na UI
export const ACTIVITY_CATEGORIZATIONS = [
  { value: "administrativo", label: "Administrativo" },
  { value: "visita_tecnica", label: "Visita Técnica" },
  { value: "deslocamento", label: "Deslocamento" },
  { value: "qualificacao", label: "Qualificação" },
  { value: "ociosidade", label: "Ociosidade" },
] as const;
// Opções de "Local de Realização" disponíveis para cada tipo de atividade (multi-seleção)
export const ACTIVITY_LOCATIONS = [
  { value: "cliente", label: "Cliente" },
  { value: "renner", label: "Renner" },
  { value: "home_office", label: "Home Office" },
  { value: "outro", label: "Outro" },
  { value: "trajeto", label: "Trajeto" },
] as const;
export const dayMarkerEnum = pgEnum("day_marker", ["F", "FE", "S", "D", "P", "H"]);
// Tipo de bloqueio de agenda (indisponibilidade): férias (multi-dia) ou compromisso pessoal (horário)
export const agendaBlockTypeEnum = pgEnum("agenda_block_type", ["ferias", "compromisso"]);
export const approvalStatusEnum = pgEnum("approval_status", ["pendente", "aprovado", "rejeitado"]);
export const gpsStatusEnum = pgEnum("gps_status", ["ativo", "inativo"]);
export const connectionStatusEnum = pgEnum("connection_status", ["online", "offline"]);
export const timeSourceEnum = pgEnum("time_source", ["manual", "timer", "import", "gps", "route_estimate", "ida_travel", "volta_travel"]);
export const travelStatusEnum = pgEnum("travel_status", ["planned", "enroute", "arrived", "reconciled"]);
export const travelSegmentTypeEnum = pgEnum("travel_segment_type", ["ida", "execucao", "volta"]);
export const notificationTypeEnum = pgEnum("notification_type", ["nova_atividade", "atividade_modificada", "lembrete_atividade", "aprovacao_pendente", "aprovacao_respondida", "mensagem_admin", "alerta_sistema"]);
export const ratStatusEnum = pgEnum("rat_status", ["pendente", "rascunho", "completa"]);
export const ratSendChannelEnum = pgEnum("rat_send_channel", ["whatsapp", "email", "ambos", "nenhum"]);
export const projectTypeEnum = pgEnum("project_type", ["manutencao", "nova"]);
export const componentCategoryEnum = pgEnum("component_category", ["componente_a", "componente_b", "componente_c", "diluente", "powder"]);
export const transportTypeEnum = pgEnum("transport_type", ["carro", "moto", "a_pe", "transporte_publico", "aviao"]);
export const timeRecordTypeEnum = pgEnum("time_record_type", ["ida", "execucao", "retorno_base"]);

// Users table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username"), // Optional - legacy field, use email for login
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  role: userRoleEnum("role").notNull().default("assistente"),
  name: text("name").notNull(),
  datasulUsername: text("datasul_username"), // login do Datasul associado (perfil Datasul)
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Technicians table
export const technicians = pgTable("technicians", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).unique().notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  team: text("team").notNull(),
  baseCity: text("base_city").notNull(),
  color: text("color").notNull(),
  avatarUrl: text("avatar_url"),
  vehicleInfo: text("vehicle_info"),
  licenseNumber: text("license_number"),
  workHoursPerDay: integer("work_hours_per_day").default(8),
  baseAddress: text("base_address"),
  baseNumero: text("base_numero"),
  baseBairro: text("base_bairro"),
  baseState: text("base_state"),
  baseLatitude: decimal("base_latitude", { precision: 10, scale: 7 }),
  baseLongitude: decimal("base_longitude", { precision: 10, scale: 7 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Clients table
export const clients = pgTable("clients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyName: text("company_name").notNull(),
  cnpj: text("cnpj"),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  internalCode: text("internal_code"),
  taxId: text("tax_id"),
  segment: text("segment"),
  region: text("region"),
  address: text("address"),
  numero: text("numero"),
  bairro: text("bairro"),
  city: text("city"),
  state: text("state"),
  country: text("country").default("Brasil"),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  responsibleUserId: varchar("responsible_user_id").references(() => users.id),
  teamId: text("team_id"),
  notes: text("notes"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Client sites/locations table
export const clientSites = pgTable("client_sites", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: varchar("client_id").references(() => clients.id).notNull(),
  siteName: text("site_name").notNull(),
  address: text("address").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  zipCode: text("zip_code"),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  accessRequirements: text("access_requirements"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Activity types table
export const activityTypes = pgTable("activity_types", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  category: activityCategoryEnum("category").notNull(),
  color: text("color").notNull(),
  icon: text("icon"),
  description: text("description"),
  displayOrder: integer("display_order").default(0),
  isAutomatic: boolean("is_automatic").default(false).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  parentId: varchar("parent_id"), // null = categoria principal, preenchido = subcategoria
  requiresRat: boolean("requires_rat").default(false).notNull(),
  requiresTravel: boolean("requires_travel").default(true).notNull(), // se false, fluxo do técnico pula IDA/VOLTA (só inicia e conclui execução)
  categorization: activityCategorizationEnum("categorization"), // Categorização manual do tipo (independente da categoria pai)
  locations: text("locations").array(), // Locais de realização permitidos para este tipo (cliente, renner, home_office, outro, trajeto)
  isHomeOffice: boolean("is_home_office"), // Coluna legada (não usada pelo código atual; mantida no schema para preservar dados em bancos antigos)
});

// Tabela de log de migração (criada/gerenciada pelo server/migrate.ts).
// Declarada aqui para que o `drizzle-kit push` NÃO tente removê-la.
export const migrationLog = pgTable("_migration_log", {
  id: serial("id").primaryKey(),
  version: varchar("version", { length: 50 }).notNull(),
  appliedAt: timestamp("applied_at").defaultNow(),
  description: text("description"),
  success: boolean("success").default(true),
});

// Segments table (Negócios de clientes)
export const segments = pgTable("segments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  description: text("description"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Regions table (Regiões de clientes)
export const regions = pgTable("regions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  description: text("description"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Activities/Schedule table
export const activities = pgTable("activities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  technicianId: varchar("technician_id").references(() => technicians.id).notNull(),
  clientId: varchar("client_id").references(() => clients.id),
  clientName: text("client_name"),
  siteId: varchar("site_id").references(() => clientSites.id),
  activityTypeId: varchar("activity_type_id").references(() => activityTypes.id).notNull(),
  location: text("location"), // Local de realização escolhido (dentre os locais definidos no tipo de atividade)
  title: text("title"), // Título da atividade
  description: text("description"),
  address: text("address"),
  numero: text("numero"),
  bairro: text("bairro"),
  city: text("city"),
  state: text("state"),
  country: text("country").default("Brasil"),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  scheduledDate: timestamp("scheduled_date").notNull(),
  endDate: timestamp("end_date"), // Para atividades multi-dia
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  status: activityStatusEnum("status").notNull().default("planejado"),
  navigationStartTime: timestamp("navigation_start_time"),
  checkInTime: timestamp("check_in_time"),
  checkOutTime: timestamp("check_out_time"),
  checkInLatitude: decimal("check_in_latitude", { precision: 10, scale: 7 }),
  checkInLongitude: decimal("check_in_longitude", { precision: 10, scale: 7 }),
  checkOutLatitude: decimal("check_out_latitude", { precision: 10, scale: 7 }),
  checkOutLongitude: decimal("check_out_longitude", { precision: 10, scale: 7 }),
  actualDurationMinutes: integer("actual_duration_minutes"),
  estimatedTravelMinutes: integer("estimated_travel_minutes"),
  actualTravelMinutes: integer("actual_travel_minutes"),
  travelClassification: activityCategoryEnum("travel_classification"),
  travelJustification: text("travel_justification"),
  transportMode: text("transport_mode"), // carro, aviao, onibus, outro, nenhum
  workCompleted: boolean("work_completed"),
  notes: text("notes"),
  // V3: Navigation and time tracking
  navigationEtaMinutes: integer("navigation_eta_minutes"), // ETA from GPS when navigation started
  suggestedExecMinutes: integer("suggested_exec_minutes"), // Suggested execution time (now - checkInTime)
  idaRecordedAt: timestamp("ida_recorded_at"), // When travel time was recorded
  returnBaseRecordedAt: timestamp("return_base_recorded_at"), // When return to base was recorded
  actualReturnMinutes: integer("actual_return_minutes"), // Actual return travel time reported by technician
  rescheduleCount: integer("reschedule_count").default(0).notNull(), // Number of times activity was rescheduled
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Activity travel times table (multiple transport types per activity)
export const activityTravelTimes = pgTable("activity_travel_times", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  activityId: varchar("activity_id").references(() => activities.id, { onDelete: "cascade" }).notNull(),
  transportType: transportTypeEnum("transport_type").notNull(),
  minutes: integer("minutes").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Activity time records table (V3: ida, execucao, retorno_base)
export const activityTimeRecords = pgTable("activity_time_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  activityId: varchar("activity_id").references(() => activities.id, { onDelete: "cascade" }).notNull(),
  recordType: timeRecordTypeEnum("record_type").notNull(), // 'ida', 'execucao', 'retorno_base'
  minutesReported: integer("minutes_reported").notNull(), // Actual time reported by technician
  gpsEtaMinutes: integer("gps_eta_minutes"), // GPS estimated time (nullable)
  transportType: transportTypeEnum("transport_type"), // For ida and retorno_base
  baseId: varchar("base_id"), // For retorno_base only (technician's base ID)
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Activity reschedules history table
export const activityReschedules = pgTable("activity_reschedules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  activityId: varchar("activity_id").references(() => activities.id, { onDelete: "cascade" }).notNull(),
  previousDate: timestamp("previous_date").notNull(),
  previousStartTime: text("previous_start_time").notNull(),
  previousEndTime: text("previous_end_time").notNull(),
  newDate: timestamp("new_date").notNull(),
  newStartTime: text("new_start_time").notNull(),
  newEndTime: text("new_end_time").notNull(),
  reason: text("reason").notNull(),
  rescheduledBy: varchar("rescheduled_by").references(() => users.id).notNull(),
  rescheduleNumber: integer("reschedule_number").notNull(), // 1, 2, 3...
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Multi-day activity daily status (per-day tracking for multi-day activities)
export const activityDayStatus = pgTable("activity_day_status", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  activityId: varchar("activity_id").references(() => activities.id, { onDelete: "cascade" }).notNull(),
  date: timestamp("date").notNull(), // The specific day
  status: activityStatusEnum("status").notNull().default("planejado"), // Status for this day
  startTime: text("start_time"), // Per-day start time override (HH:MM)
  endTime: text("end_time"), // Per-day end time override (HH:MM)
  checkInTime: timestamp("check_in_time"),
  checkOutTime: timestamp("check_out_time"),
  checkInLatitude: decimal("check_in_latitude", { precision: 10, scale: 7 }),
  checkInLongitude: decimal("check_in_longitude", { precision: 10, scale: 7 }),
  checkOutLatitude: decimal("check_out_latitude", { precision: 10, scale: 7 }),
  checkOutLongitude: decimal("check_out_longitude", { precision: 10, scale: 7 }),
  actualDurationMinutes: integer("actual_duration_minutes"),
  workCompleted: boolean("work_completed").default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  // Garante um único registro de status por dia para cada atividade (evita duplicatas em corrida de check-in)
  uniqActivityDate: unique("activity_day_status_activity_date_unique").on(table.activityId, table.date),
}));

// Day markers (for holidays, vacations, etc.)
export const dayMarkers = pgTable("day_markers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  technicianId: varchar("technician_id").references(() => technicians.id),
  date: timestamp("date").notNull(),
  markerType: dayMarkerEnum("marker_type").notNull(),
  description: text("description"),
  isGlobal: boolean("is_global").default(false),
});

// Bloqueios de agenda (indisponibilidade): férias e compromissos pessoais.
// NÃO são atividades — ficam totalmente fora dos cálculos (pizza/tempo/relatórios).
// Servem para ocupar a agenda e avisar o gestor ao tentar agendar.
export const agendaBlocks = pgTable("agenda_blocks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  technicianId: varchar("technician_id").references(() => technicians.id, { onDelete: "cascade" }).notNull(),
  blockType: agendaBlockTypeEnum("block_type").notNull(),
  startDate: timestamp("start_date").notNull(), // dia inicial (00:00)
  endDate: timestamp("end_date").notNull(),     // dia final (00:00) — igual a startDate p/ compromisso de 1 dia
  startTime: text("start_time"),                // "HH:MM" — só p/ compromisso (parcial)
  endTime: text("end_time"),                    // "HH:MM" — só p/ compromisso (parcial)
  description: text("description"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Approvals table
export const approvals = pgTable("approvals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  activityId: varchar("activity_id").references(() => activities.id).notNull(),
  submittedBy: varchar("submitted_by").references(() => users.id).notNull(),
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  status: approvalStatusEnum("status").notNull().default("pendente"),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
  reviewedAt: timestamp("reviewed_at"),
  comments: text("comments"),
  rejectionReason: text("rejection_reason"),
});

// Activity attachments table
export const activityAttachments = pgTable("activity_attachments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  activityId: varchar("activity_id").references(() => activities.id).notNull(),
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url").notNull(),
  fileType: text("file_type").notNull(),
  fileSize: integer("file_size"),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});

// Audit log table
export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: varchar("entity_id").notNull(),
  changes: text("changes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Technician locations table (GPS telemetry)
export const technicianLocations = pgTable("technician_locations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  technicianId: varchar("technician_id").references(() => technicians.id, { onDelete: "cascade" }).notNull(),
  latitude: decimal("latitude", { precision: 9, scale: 6 }).notNull(),
  longitude: decimal("longitude", { precision: 10, scale: 7 }).notNull(),
  accuracy: integer("accuracy"),
  battery: integer("battery"),
  gpsStatus: gpsStatusEnum("gps_status").notNull().default("inativo"),
  connectionStatus: connectionStatusEnum("connection_status").notNull().default("offline"),
  deviceModel: text("device_model"),
  androidVersion: text("android_version"),
  appVersion: text("app_version"),
  address: text("address"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Time entries table (for time tracking: efetivo/adicional/perda)
export const timeEntries = pgTable("time_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  technicianId: varchar("technician_id").references(() => technicians.id, { onDelete: "cascade" }).notNull(),
  activityTypeId: varchar("activity_type_id").references(() => activityTypes.id).notNull(),
  workDate: timestamp("work_date").notNull(),
  minutes: integer("minutes").notNull(),
  category: activityCategoryEnum("category").notNull(),
  source: timeSourceEnum("source").notNull().default("manual"),
  location: text("location"), // Local de realização ("Executado em") associado a estas horas; "Trajeto" para deslocamentos
  notes: text("notes"),
  createdBy: varchar("created_by").references(() => users.id).notNull(),
  agendaActivityId: varchar("agenda_activity_id").references(() => activities.id).unique(),
  travelSegmentId: varchar("travel_segment_id").references(() => travelSegments.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Travel segments table (for route planning and tracking)
export const travelSegments = pgTable("travel_segments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  technicianId: varchar("technician_id").references(() => technicians.id, { onDelete: "cascade" }).notNull(),
  agendaActivityId: varchar("agenda_activity_id").references(() => activities.id),
  originLat: decimal("origin_lat", { precision: 10, scale: 7 }).notNull(),
  originLng: decimal("origin_lng", { precision: 10, scale: 7 }).notNull(),
  originAddress: text("origin_address"),
  destLat: decimal("dest_lat", { precision: 10, scale: 7 }).notNull(),
  destLng: decimal("dest_lng", { precision: 10, scale: 7 }).notNull(),
  destAddress: text("dest_address"),
  provider: text("provider").default("osrm"),
  routePolyline: text("route_polyline"),
  distanceMeters: integer("distance_meters"),
  durationEstimatedSec: integer("duration_estimated_sec"),
  durationRealSec: integer("duration_real_sec"),
  startedAt: timestamp("started_at"),
  arrivedAt: timestamp("arrived_at"),
  status: travelStatusEnum("status").notNull().default("planned"),
  segmentType: travelSegmentTypeEnum("segment_type"), // ida, execucao, volta
  transportMode: text("transport_mode"), // carro, aviao, onibus, outro, nenhum
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Notifications table (for push notification history and in-app notifications)
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  type: notificationTypeEnum("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  data: text("data"), // JSON string with additional data (activityId, etc)
  isRead: boolean("is_read").default(false).notNull(),
  sentToPush: boolean("sent_to_push").default(false).notNull(), // Track if sent via OneSignal
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// User push subscriptions table (OneSignal player IDs per user/device)
export const userPushSubscriptions = pgTable("user_push_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  playerId: text("player_id").notNull().unique(), // OneSignal player ID
  deviceModel: text("device_model"),
  osVersion: text("os_version"),
  appVersion: text("app_version"),
  isActive: boolean("is_active").default(true).notNull(),
  lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Sent reminders tracking table (prevent duplicate reminder notifications)
export const sentReminders = pgTable("sent_reminders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  activityId: varchar("activity_id").references(() => activities.id, { onDelete: "cascade" }).notNull(),
  reminderType: text("reminder_type").notNull(), // "30min_before", "time_to_start", "time_to_complete"
  sentAt: timestamp("sent_at").defaultNow().notNull(),
});

// RAT (Relatório de Assistência Técnica) table
export const rats = pgTable("rats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  reportNumber: text("report_number").notNull().unique(), // RAT-2024-0001 (auto-generated)
  reportNumberManual: text("report_number_manual"), // Manual number entered by technician
  activityId: varchar("activity_id").references(() => activities.id, { onDelete: "cascade" }).notNull(),
  technicianId: varchar("technician_id").references(() => technicians.id, { onDelete: "cascade" }).notNull(),
  clientId: varchar("client_id").references(() => clients.id),
  clientName: text("client_name").notNull(), // Auto-populated from activity
  clientNameEditable: text("client_name_editable"), // Editable version of client name
  
  // Project type (Obra)
  projectType: projectTypeEnum("project_type"), // manutencao or nova
  
  // Status
  status: ratStatusEnum("status").notNull().default("pendente"),
  
  // Dates
  openDate: timestamp("open_date").notNull(), // Activity checkout date
  closeDate: timestamp("close_date"), // When RAT was completed
  openingDate: timestamp("opening_date"), // Manual opening date entered by technician (pre-filled from activity date)
  closingDate: timestamp("closing_date"), // Manual closing date entered by technician
  
  // Surface fields
  surfaceMaintenanceGrade: integer("surface_maintenance_grade"), // ASTM D0610 (0-10)
  
  // Application fields
  applicationNote: text("application_note"), // Observação da aplicação
  
  // Technician signature
  technicianSignature: text("technician_signature"), // Base64 image of signature
  technicianSignatureName: text("technician_signature_name"), // Name displayed with signature
  
  // Form data stored as JSON for flexibility
  formData: text("form_data"), // JSON string
  
  // Photos organized by section
  photos: text("photos"), // JSON array of photo URLs (legacy)
  photoSections: text("photo_sections"), // JSON object with photos per section (3-6)
  
  // Send info
  sentAt: timestamp("sent_at"),
  sendChannel: ratSendChannelEnum("send_channel"),
  
  // Generated file
  fileUrl: text("file_url"),
  
  // Imported PDF (alternative to manual form)
  importedPdfUrl: text("imported_pdf_url"),
  importedPdfFilename: text("imported_pdf_filename"),
  
  // Simplified RAT flag
  isSimplified: boolean("is_simplified").default(false),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(users, ({ one, many }) => ({
  technician: one(technicians, {
    fields: [users.id],
    references: [technicians.userId],
  }),
  auditLogs: many(auditLogs),
  notifications: many(notifications),
  pushSubscriptions: many(userPushSubscriptions),
}));

export const techniciansRelations = relations(technicians, ({ one, many }) => ({
  user: one(users, {
    fields: [technicians.userId],
    references: [users.id],
  }),
  activities: many(activities),
  dayMarkers: many(dayMarkers),
  locations: many(technicianLocations),
  timeEntries: many(timeEntries),
  travelSegments: many(travelSegments),
}));

export const clientsRelations = relations(clients, ({ many }) => ({
  sites: many(clientSites),
  activities: many(activities),
}));

export const clientSitesRelations = relations(clientSites, ({ one, many }) => ({
  client: one(clients, {
    fields: [clientSites.clientId],
    references: [clients.id],
  }),
  activities: many(activities),
}));

export const activityTypesRelations = relations(activityTypes, ({ many }) => ({
  activities: many(activities),
}));

export const activitiesRelations = relations(activities, ({ one, many }) => ({
  technician: one(technicians, {
    fields: [activities.technicianId],
    references: [technicians.id],
  }),
  client: one(clients, {
    fields: [activities.clientId],
    references: [clients.id],
  }),
  site: one(clientSites, {
    fields: [activities.siteId],
    references: [clientSites.id],
  }),
  activityType: one(activityTypes, {
    fields: [activities.activityTypeId],
    references: [activityTypes.id],
  }),
  approval: one(approvals),
  attachments: many(activityAttachments),
  timeRecords: many(activityTimeRecords),
}));

export const activityTimeRecordsRelations = relations(activityTimeRecords, ({ one }) => ({
  activity: one(activities, {
    fields: [activityTimeRecords.activityId],
    references: [activities.id],
  }),
}));

export const activityReschedulesRelations = relations(activityReschedules, ({ one }) => ({
  activity: one(activities, {
    fields: [activityReschedules.activityId],
    references: [activities.id],
  }),
  rescheduledByUser: one(users, {
    fields: [activityReschedules.rescheduledBy],
    references: [users.id],
  }),
}));

export const approvalsRelations = relations(approvals, ({ one }) => ({
  activity: one(activities, {
    fields: [approvals.activityId],
    references: [activities.id],
  }),
  submitter: one(users, {
    fields: [approvals.submittedBy],
    references: [users.id],
  }),
  reviewer: one(users, {
    fields: [approvals.reviewedBy],
    references: [users.id],
  }),
}));

export const activityAttachmentsRelations = relations(activityAttachments, ({ one }) => ({
  activity: one(activities, {
    fields: [activityAttachments.activityId],
    references: [activities.id],
  }),
}));

export const dayMarkersRelations = relations(dayMarkers, ({ one }) => ({
  technician: one(technicians, {
    fields: [dayMarkers.technicianId],
    references: [technicians.id],
  }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id],
  }),
}));

export const technicianLocationsRelations = relations(technicianLocations, ({ one }) => ({
  technician: one(technicians, {
    fields: [technicianLocations.technicianId],
    references: [technicians.id],
  }),
}));

export const timeEntriesRelations = relations(timeEntries, ({ one }) => ({
  technician: one(technicians, {
    fields: [timeEntries.technicianId],
    references: [technicians.id],
  }),
  activityType: one(activityTypes, {
    fields: [timeEntries.activityTypeId],
    references: [activityTypes.id],
  }),
  creator: one(users, {
    fields: [timeEntries.createdBy],
    references: [users.id],
  }),
  agendaActivity: one(activities, {
    fields: [timeEntries.agendaActivityId],
    references: [activities.id],
  }),
  travelSegment: one(travelSegments, {
    fields: [timeEntries.travelSegmentId],
    references: [travelSegments.id],
  }),
}));

export const travelSegmentsRelations = relations(travelSegments, ({ one, many }) => ({
  technician: one(technicians, {
    fields: [travelSegments.technicianId],
    references: [technicians.id],
  }),
  agendaActivity: one(activities, {
    fields: [travelSegments.agendaActivityId],
    references: [activities.id],
  }),
  timeEntries: many(timeEntries),
}));

export const ratsRelations = relations(rats, ({ one }) => ({
  activity: one(activities, {
    fields: [rats.activityId],
    references: [activities.id],
  }),
  technician: one(technicians, {
    fields: [rats.technicianId],
    references: [technicians.id],
  }),
  client: one(clients, {
    fields: [rats.clientId],
    references: [clients.id],
  }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export const insertTechnicianSchema = createInsertSchema(technicians).omit({
  id: true,
  createdAt: true,
}).extend({
  baseLatitude: z.union([z.number(), z.string(), z.null(), z.undefined()]).transform((val) => {
    if (typeof val === 'string') return val;
    if (typeof val === 'number') return val.toString();
    return val;
  }).optional().nullable(),
  baseLongitude: z.union([z.number(), z.string(), z.null(), z.undefined()]).transform((val) => {
    if (typeof val === 'string') return val;
    if (typeof val === 'number') return val.toString();
    return val;
  }).optional().nullable(),
});

export const insertClientSchema = createInsertSchema(clients).omit({
  id: true,
  createdAt: true,
});

export const insertClientSiteSchema = createInsertSchema(clientSites).omit({
  id: true,
  createdAt: true,
});

export const insertActivityTypeSchema = createInsertSchema(activityTypes).omit({
  id: true,
});

export const insertSegmentSchema = createInsertSchema(segments).omit({
  id: true,
  createdAt: true,
});

export const insertRegionSchema = createInsertSchema(regions).omit({
  id: true,
  createdAt: true,
});

export const insertActivitySchema = createInsertSchema(activities).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  scheduledDate: z.union([z.date(), z.string()]).transform((val) => {
    if (typeof val === 'string') {
      return new Date(val);
    }
    return val;
  }),
  endDate: z.union([z.date(), z.string(), z.null(), z.undefined()]).transform((val) => {
    if (typeof val === 'string' && val) {
      return new Date(val);
    }
    if (val instanceof Date) {
      return val;
    }
    return null;
  }).optional().nullable(),
  checkInTime: z.union([z.date(), z.string(), z.null(), z.undefined()]).transform((val) => {
    if (typeof val === 'string') {
      return new Date(val);
    }
    return val;
  }).optional().nullable(),
  checkOutTime: z.union([z.date(), z.string(), z.null(), z.undefined()]).transform((val) => {
    if (typeof val === 'string') {
      return new Date(val);
    }
    return val;
  }).optional().nullable(),
  latitude: z.union([z.number(), z.string(), z.null(), z.undefined()]).transform((val) => {
    if (typeof val === 'string') return val;
    if (typeof val === 'number') return val.toString();
    return val;
  }).optional().nullable(),
  longitude: z.union([z.number(), z.string(), z.null(), z.undefined()]).transform((val) => {
    if (typeof val === 'string') return val;
    if (typeof val === 'number') return val.toString();
    return val;
  }).optional().nullable(),
});

export const insertDayMarkerSchema = createInsertSchema(dayMarkers).omit({
  id: true,
});

export const insertAgendaBlockSchema = createInsertSchema(agendaBlocks).omit({
  id: true,
  createdAt: true,
}).extend({
  technicianId: z.string().optional(), // definido pelo servidor p/ assistente; obrigatório p/ admin (validado na rota)
  startDate: z.union([z.date(), z.string()]).transform((val) =>
    typeof val === "string" ? new Date(val) : val
  ),
  endDate: z.union([z.date(), z.string()]).transform((val) =>
    typeof val === "string" ? new Date(val) : val
  ),
  startTime: z.string().optional().nullable(),
  endTime: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  createdBy: z.string().optional().nullable(),
});

export const insertActivityTravelTimeSchema = createInsertSchema(activityTravelTimes).omit({
  id: true,
  createdAt: true,
});

export const insertActivityTimeRecordSchema = createInsertSchema(activityTimeRecords).omit({
  id: true,
  createdAt: true,
});

export const insertActivityRescheduleSchema = createInsertSchema(activityReschedules).omit({
  id: true,
  createdAt: true,
}).extend({
  previousDate: z.union([z.date(), z.string()]).transform((val) => {
    if (typeof val === 'string') return new Date(val);
    return val;
  }),
  newDate: z.union([z.date(), z.string()]).transform((val) => {
    if (typeof val === 'string') return new Date(val);
    return val;
  }),
});

export const insertActivityDayStatusSchema = createInsertSchema(activityDayStatus).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  date: z.union([z.date(), z.string()]).transform((val) => {
    if (typeof val === 'string') return new Date(val);
    return val;
  }),
  checkInTime: z.union([z.date(), z.string(), z.null(), z.undefined()]).optional().transform((val) => {
    if (!val) return undefined;
    if (typeof val === 'string') return new Date(val);
    return val;
  }),
  checkOutTime: z.union([z.date(), z.string(), z.null(), z.undefined()]).optional().transform((val) => {
    if (!val) return undefined;
    if (typeof val === 'string') return new Date(val);
    return val;
  }),
});

export const insertApprovalSchema = createInsertSchema(approvals).omit({
  id: true,
  submittedAt: true,
});

export const insertActivityAttachmentSchema = createInsertSchema(activityAttachments).omit({
  id: true,
  uploadedAt: true,
});

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({
  id: true,
  createdAt: true,
});

export const insertTechnicianLocationSchema = createInsertSchema(technicianLocations).omit({
  id: true,
  updatedAt: true,
});

export const insertTimeEntrySchema = createInsertSchema(timeEntries).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  workDate: z.union([z.date(), z.string()]).transform((val) => {
    if (typeof val === 'string') {
      return new Date(val);
    }
    return val;
  }),
});

export const insertTravelSegmentSchema = createInsertSchema(travelSegments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  startedAt: z.union([z.date(), z.string(), z.null(), z.undefined()]).transform((val) => {
    if (typeof val === 'string') {
      return new Date(val);
    }
    return val;
  }).optional().nullable(),
  arrivedAt: z.union([z.date(), z.string(), z.null(), z.undefined()]).transform((val) => {
    if (typeof val === 'string') {
      return new Date(val);
    }
    return val;
  }).optional().nullable(),
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
});

export const insertUserPushSubscriptionSchema = createInsertSchema(userPushSubscriptions).omit({
  id: true,
  createdAt: true,
  lastSeenAt: true,
});

export const insertSentReminderSchema = createInsertSchema(sentReminders).omit({
  id: true,
  sentAt: true,
});

export const insertRatSchema = createInsertSchema(rats).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  // Explicitly define status to ensure it works correctly with partial()
  status: z.enum(["pendente", "rascunho", "completa"]).optional(),
  openDate: z.union([z.date(), z.string()]).transform((val) => {
    if (typeof val === 'string') {
      return new Date(val);
    }
    return val;
  }),
  closeDate: z.union([z.date(), z.string(), z.null(), z.undefined()]).transform((val) => {
    if (typeof val === 'string') {
      return new Date(val);
    }
    return val;
  }).optional().nullable(),
  openingDate: z.union([z.date(), z.string(), z.null(), z.undefined()]).transform((val) => {
    if (typeof val === 'string') {
      return new Date(val);
    }
    return val;
  }).optional().nullable(),
  closingDate: z.union([z.date(), z.string(), z.null(), z.undefined()]).transform((val) => {
    if (typeof val === 'string') {
      return new Date(val);
    }
    return val;
  }).optional().nullable(),
  sentAt: z.union([z.date(), z.string(), z.null(), z.undefined()]).transform((val) => {
    if (typeof val === 'string') {
      return new Date(val);
    }
    return val;
  }).optional().nullable(),
});

// Schema for creating RAT from frontend - omits auto-generated fields
export const createRatSchema = z.object({
  activityId: z.string(),
  technicianId: z.string().optional(),
  formData: z.string().optional(),
  status: z.enum(["pendente", "rascunho", "completa"]).optional().default("pendente"),
  // New fields
  reportNumberManual: z.string().optional(),
  clientNameEditable: z.string().optional(),
  projectType: z.enum(["manutencao", "nova"]).optional(),
  openingDate: z.union([z.date(), z.string(), z.null(), z.undefined()]).transform((val) => {
    if (typeof val === 'string') return new Date(val);
    return val;
  }).optional().nullable(),
  closingDate: z.union([z.date(), z.string(), z.null(), z.undefined()]).transform((val) => {
    if (typeof val === 'string') return new Date(val);
    return val;
  }).optional().nullable(),
  surfaceMaintenanceGrade: z.number().min(0).max(10).optional(),
  applicationNote: z.string().optional(),
  technicianSignature: z.string().optional(),
  technicianSignatureName: z.string().optional(),
  photoSections: z.string().optional(),
  isSimplified: z.boolean().optional().default(false),
});

// Combined schema for creating user + technician atomically
export const createUserAndTechnicianSchema = z.object({
  // User fields
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
  role: z.enum(["admin", "assistente"]),
  datasulUsername: z.string().optional().nullable(),
  // Technician fields
  name: z.string().min(1, "Nome é obrigatório"),
  email: z.string().email("Email inválido"),
  phone: z.string().min(1, "Telefone é obrigatório"),
  team: z.string().min(1, "Equipe é obrigatória"),
  baseCity: z.string().min(1, "Cidade base é obrigatória"),
  color: z.string().default("#3b82f6"),
  avatarUrl: z.string().optional(),
  vehicleInfo: z.string().optional(),
  licenseNumber: z.string().optional(),
  workHoursPerDay: z.coerce.number().min(1).max(24).default(8),
  // Base address fields (home office)
  baseAddress: z.string().optional(),
  baseNumero: z.string().optional(),
  baseBairro: z.string().optional(),
  baseState: z.string().optional(),
  baseLatitude: z.union([z.number(), z.string(), z.null(), z.undefined()]).transform((val) => {
    if (typeof val === 'string') return val;
    if (typeof val === 'number') return val.toString();
    return undefined;
  }).optional(),
  baseLongitude: z.union([z.number(), z.string(), z.null(), z.undefined()]).transform((val) => {
    if (typeof val === 'string') return val;
    if (typeof val === 'number') return val.toString();
    return undefined;
  }).optional(),
});

// Update schemas - exclude auto-generated fields and make all fields optional
export const updateUserSchema = insertUserSchema.omit({ password: true }).partial();
export const updateTechnicianSchema = insertTechnicianSchema.partial().extend({
  baseLatitude: z.union([z.number(), z.string(), z.null(), z.undefined()]).transform((val) => {
    if (typeof val === 'string') return val;
    if (typeof val === 'number') return val.toString();
    return val;
  }).optional().nullable(),
  baseLongitude: z.union([z.number(), z.string(), z.null(), z.undefined()]).transform((val) => {
    if (typeof val === 'string') return val;
    if (typeof val === 'number') return val.toString();
    return val;
  }).optional().nullable(),
});
export const updateClientSchema = insertClientSchema.partial();
export const updateClientSiteSchema = insertClientSiteSchema.partial();
export const updateActivityTypeSchema = insertActivityTypeSchema.partial();
export const updateSegmentSchema = insertSegmentSchema.partial();
export const updateRegionSchema = insertRegionSchema.partial();
export const updateActivitySchema = insertActivitySchema.partial().extend({
  latitude: z.union([z.number(), z.string(), z.null(), z.undefined()]).transform((val) => {
    if (typeof val === 'string') return val;
    if (typeof val === 'number') return val.toString();
    return val;
  }).optional().nullable(),
  longitude: z.union([z.number(), z.string(), z.null(), z.undefined()]).transform((val) => {
    if (typeof val === 'string') return val;
    if (typeof val === 'number') return val.toString();
    return val;
  }).optional().nullable(),
});
export const updateApprovalSchema = insertApprovalSchema.partial();
export const updateTimeEntrySchema = insertTimeEntrySchema.partial();
export const updateTravelSegmentSchema = insertTravelSegmentSchema.partial();
export const updateRatSchema = insertRatSchema.partial();

// Update user and technician together (used when editing from Technicians tab)
export const updateUserAndTechnicianSchema = z.object({
  // User fields (optional) - empty string for password means "don't change"
  password: z.string().transform(val => val === "" ? undefined : val).pipe(z.string().min(6, "Senha deve ter pelo menos 6 caracteres")).optional(),
  role: z.enum(["admin", "assistente"]).optional(),
  datasulUsername: z.string().optional().nullable(),
  // Technician fields (partial) - these will also update user table for consistency
  name: z.string().min(1, "Nome é obrigatório").optional(),
  email: z.string().email("Email inválido").optional(),
  phone: z.string().min(1, "Telefone é obrigatório").optional(),
  team: z.string().min(1, "Equipe é obrigatória").optional(),
  baseCity: z.string().min(1, "Cidade base é obrigatória").optional(),
  color: z.string().optional(),
  avatarUrl: z.string().optional(),
  vehicleInfo: z.string().optional(),
  licenseNumber: z.string().optional(),
  workHoursPerDay: z.coerce.number().min(1).max(24).optional(),
  // Base address fields (home office)
  baseAddress: z.string().optional(),
  baseNumero: z.string().optional(),
  baseBairro: z.string().optional(),
  baseState: z.string().optional(),
  // Accept numbers/strings/null and convert numbers to strings for Drizzle decimal types
  baseLatitude: z.union([z.number(), z.string(), z.null(), z.undefined()]).transform((val) => {
    if (typeof val === 'string') return val;
    if (typeof val === 'number') return val.toString();
    return val;
  }).optional().nullable(),
  baseLongitude: z.union([z.number(), z.string(), z.null(), z.undefined()]).transform((val) => {
    if (typeof val === 'string') return val;
    if (typeof val === 'number') return val.toString();
    return val;
  }).optional().nullable(),
});

// Login schema
export const loginSchema = z.object({
  email: z.string().email("Email inválido").min(1, "Email é obrigatório"),
  password: z.string().min(1, "Senha é obrigatória"),
});

// Types
// Insert types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateUserAndTechnician = z.infer<typeof createUserAndTechnicianSchema>;

export type InsertTechnician = z.infer<typeof insertTechnicianSchema>;
export type Technician = typeof technicians.$inferSelect;

export type InsertClient = z.infer<typeof insertClientSchema>;
export type Client = typeof clients.$inferSelect;

export type InsertClientSite = z.infer<typeof insertClientSiteSchema>;
export type ClientSite = typeof clientSites.$inferSelect;

export type InsertActivityType = z.infer<typeof insertActivityTypeSchema>;
export type ActivityType = typeof activityTypes.$inferSelect;

export type InsertSegment = z.infer<typeof insertSegmentSchema>;
export type Segment = typeof segments.$inferSelect;

export type InsertRegion = z.infer<typeof insertRegionSchema>;
export type Region = typeof regions.$inferSelect;

export type InsertActivity = z.infer<typeof insertActivitySchema>;
export type Activity = typeof activities.$inferSelect;

export type InsertDayMarker = z.infer<typeof insertDayMarkerSchema>;
export type DayMarker = typeof dayMarkers.$inferSelect;

export type InsertAgendaBlock = z.infer<typeof insertAgendaBlockSchema>;
export type AgendaBlock = typeof agendaBlocks.$inferSelect;

export type InsertActivityTravelTime = z.infer<typeof insertActivityTravelTimeSchema>;
export type ActivityTravelTime = typeof activityTravelTimes.$inferSelect;

export type InsertActivityTimeRecord = z.infer<typeof insertActivityTimeRecordSchema>;
export type ActivityTimeRecord = typeof activityTimeRecords.$inferSelect;

export type InsertActivityReschedule = z.infer<typeof insertActivityRescheduleSchema>;
export type ActivityReschedule = typeof activityReschedules.$inferSelect;

export type InsertActivityDayStatus = z.infer<typeof insertActivityDayStatusSchema>;
export type ActivityDayStatus = typeof activityDayStatus.$inferSelect;

export type InsertApproval = z.infer<typeof insertApprovalSchema>;
export type Approval = typeof approvals.$inferSelect;

export type InsertActivityAttachment = z.infer<typeof insertActivityAttachmentSchema>;
export type ActivityAttachment = typeof activityAttachments.$inferSelect;

export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;

export type InsertTechnicianLocation = z.infer<typeof insertTechnicianLocationSchema>;
export type TechnicianLocation = typeof technicianLocations.$inferSelect;

export type InsertTimeEntry = z.infer<typeof insertTimeEntrySchema>;
export type TimeEntry = typeof timeEntries.$inferSelect;

export type InsertTravelSegment = z.infer<typeof insertTravelSegmentSchema>;
export type TravelSegment = typeof travelSegments.$inferSelect;

export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

export type InsertUserPushSubscription = z.infer<typeof insertUserPushSubscriptionSchema>;
export type UserPushSubscription = typeof userPushSubscriptions.$inferSelect;

export type InsertSentReminder = z.infer<typeof insertSentReminderSchema>;
export type SentReminder = typeof sentReminders.$inferSelect;

export type InsertRat = z.infer<typeof insertRatSchema>;
export type Rat = typeof rats.$inferSelect;

// Update types
export type UpdateUser = z.infer<typeof updateUserSchema>;
export type UpdateTechnician = z.infer<typeof updateTechnicianSchema>;
export type UpdateUserAndTechnician = z.infer<typeof updateUserAndTechnicianSchema>;
export type UpdateClient = z.infer<typeof updateClientSchema>;
export type UpdateClientSite = z.infer<typeof updateClientSiteSchema>;
export type UpdateActivity = z.infer<typeof updateActivitySchema>;
export type UpdateApproval = z.infer<typeof updateApprovalSchema>;
export type UpdateTimeEntry = z.infer<typeof updateTimeEntrySchema>;
export type UpdateTravelSegment = z.infer<typeof updateTravelSegmentSchema>;
export type UpdateRat = z.infer<typeof updateRatSchema>;
