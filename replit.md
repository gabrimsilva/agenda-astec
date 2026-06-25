# ASTEC Agenda Management System

## Overview
The ASTEC (Assistente Técnico) Agenda Management System is an enterprise SaaS application designed to centralize and optimize the management of technical assistants' schedules and activities for Renner Coatings. Its primary purpose is to streamline agenda planning, track activity execution (efetivo, adicional, perda), manage approvals, and generate KPI reports. Key capabilities include scheduling technical visits, real-time GPS tracking, and robust client management. The system aims to enhance operational efficiency, improve resource allocation, and provide actionable insights for technical service delivery.

## User Preferences
Preferred communication style: Simple, everyday language.
Preferred language: Always respond in Portuguese (pt-BR).

## System Architecture

### UI/UX Decisions
The frontend is a mobile-first PWA built with React 18, TypeScript, Radix UI primitives, shadcn/ui, and Tailwind CSS. It features an HSL-based color palette with dark/light modes and semantic colors, offering an installable experience with offline capabilities. Wouter handles routing with role-based protection.

### Technical Implementations
**Frontend**: Uses TanStack Query for server state and React Context for authentication. The PWA utilizes a service worker for offline asset caching.
**Backend**: Node.js with Express.js and TypeScript, providing a RESTful JSON API. Authentication uses JWT tokens with bcrypt and a simplified RBAC model. A Socket.IO server handles real-time GPS telemetry.
**Data Layer**: Drizzle ORM provides type-safe queries against PostgreSQL, with Zod schemas for validation.
**Geocoding & Routing**: Integrates Mapbox Geocoding API (primary) with Nominatim (fallback) for address geocoding, and Mapbox Directions API (primary) with OSRM (fallback) for route calculation. ViaCEP API is used for Brazilian postal code auto-fill.
**Time Tracking**: Implements automatic time entry creation for "efetivo", "adicional", and "perda" categories upon activity completion.
**Push Notifications**: Integrated with OneSignal for event-driven notifications.
**Home Office Base Management**: Allows technicians to configure a home office base address for activity scheduling.

### Feature Specifications
**Navigation**: Role-based menus for Admin (Dashboard, Agenda, Clients, Map & Routes, Profile, Settings) and Assistente (My Agenda, Calendar, Profile).
**Settings Module**: Admin-only CRUD for activity types, user management, and classification management.
**Routes/Map Module**: An interactive Leaflet-based map with real-time technician GPS tracking, client site clustering, and an OSRM-optimized route calculator. Includes an advanced nearby technician finder.
**Client Management**: Full CRUD for clients with pagination, filtering, Excel import, and an enhanced address model.
**Agenda Module**: React-big-calendar integration supporting activity creation, editing, drag & drop, filtering, and a productivity dashboard.
**My Agenda (Technician Weekly View)**: A dedicated weekly calendar for technicians with check-in/out functionality, navigation deep links, manual time adjustment, and support for multi-day activities. Displays journey time visualization for completed activities.
**Profile & Avatar**: Users can upload and manage profile avatars.
**Reports Module**: A comprehensive reports page with filters, category breakdowns, charts, and Excel export.
**PWA Mobile Optimizations**: Global calendar optimized for mobile devices with compact views.
**GPS Tracking**: A global "Field Mode" toggle enables GPS tracking via watchPosition API with smart throttling and heartbeat detection.
**Mapa TV Dashboard**: A fullscreen TV monitoring dashboard with real-time technician updates, proximity search, and animated markers.
**Activity Status System**: Automated status transitions for activities.
**RAT Module (Relatório de Assistência Técnica)**: A comprehensive post-visit technical report system with a multi-tab form, status workflow, component tracking, photographic report, digital signature capture, HTML preview, WhatsApp sharing, email structure, and hybrid PDF generation (server-side Puppeteer with client-side html2pdf.js fallback). Also supports PDF import as an alternative to manual form filling.

### System Design Choices
The system uses a serverless PostgreSQL database (Neon) with tables for Users, Technicians, Clients, Activities, and `TechnicianLocations`. Drizzle ORM and Drizzle Kit are used for schema management and migrations. An automatic database migration system runs on application startup, ensuring schema updates are applied safely and automatically.

## External Dependencies

*   **Database Service**: Neon serverless PostgreSQL
*   **Geocoding Service**: Mapbox Geocoding API (primary) + Nominatim (fallback)
*   **Routing Service**: Mapbox Directions API (primary) + OSRM (fallback)
*   **Push Notifications**: OneSignal
*   **CEP Lookup**: ViaCEP (Brazilian postal code API)
*   **UI Component Libraries**: Radix UI, Recharts, Lucide React, React Hook Form

## Recent Changes (Feb 2026)

### Activity Workflow Improvements
- **IDA Time Registration**: Button "Iniciar Atividade" only appears after IDA travel time is registered via "Cheguei no local"
- **Conditional RAT Workflow**: RAT options only shown when workCompleted=true; dialog cannot be dismissed until RAT selection is made
- **VOLTA Time Registration**: "Encerrar jornada" now opens ReturnBaseModal to register travel time before finalizing journey

### Reusable Form Components
Created `client/src/components/activities/ActivityFormFields.tsx` with reusable components:
- ActivityTypeSelector - Activity type grouped selector
- ClientSearchField - Client autocomplete with home office option
- CepSearchField - CEP lookup with auto-fill
- AddressFields - Address input fields
- DateTimeFields - Date/time fields with multi-day support
- DescriptionField - Description textarea

Integrated in MyAgenda and Calendar forms, removing ~400+ lines of duplicate code.

### Navigation Enhancement
- **CEP Lookup in NavigationDialog**: Users can now enter CEP to auto-fill the origin address instead of relying solely on GPS

### Hierarchical Activity Types (Subcategories)
- **parentId field**: Activity types can now have a parent category, creating a two-level hierarchy
- **Settings UI**: Added "Categoria Pai" dropdown in activity type form; list displays subcategories indented under their parents
- **Selector UI**: ActivityTypeSelector displays types hierarchically with parent > child notation in selection trigger
- **API**: New endpoint `GET /api/activity-types/tree` returns hierarchical structure with children arrays

### Multi-Day Activity Per-Day Status Tracking
- **activity_day_status table**: New database table to track individual day status for multi-day activities
- **Per-day check-in/out**: Each day of a multi-day activity can have independent check-in/out times
- **Day-specific status**: Status (planejado, em_andamento, concluido) tracked per day instead of per activity
- **GPS coordinates**: Check-in/out coordinates stored per day
- **API endpoints**:
  - `GET /api/activities/:id/day-status` - Get all day statuses for activity
  - `GET /api/activities/:id/day-status/:date` - Get status for specific date
  - `PUT /api/activities/:id/day-status/:date` - Update/create status for date
  - `POST /api/activities/:id/day-status/:date/check-in` - Check-in for specific day
  - `POST /api/activities/:id/day-status/:date/check-out` - Check-out for specific day

### Reschedule Statistics in Reports
- **Reschedule stats endpoint**: `GET /api/reports/reschedule-stats` with date range and technician filtering
- **Security**: Uses reportsScopeMiddleware to restrict data for assistente users
- **UI card**: Displays total reschedules, affected activities, multiple reschedule counts, and reason breakdown

### Reports Detail Tab Enhancements
- **Technician filter**: Added technician dropdown filter in the "Detalhamento" tab for filtering time entries by technician
- **Technician column**: Added "Técnico" column in the detail table showing the technician name for each time entry

### Automatic Cache Clearing on Deploy
- **Server version endpoint**: `GET /api/version` returns `{ buildId }` generated at server startup
- **Frontend detection**: On app load and every 2 minutes, checks `/api/version` against stored `astec_build_id` in localStorage
- **Auto-clear on new deploy**: When buildId changes, clears TanStack Query cache, all browser caches (via Cache API), updates stored version, and reloads page
- **Service Worker**: Clears old caches on activation, notifies clients via postMessage
- **Result**: Users always get fresh data after a new deploy without manual cache clearing

### Home Office Activity Flow
- **Direct check-in**: Home office activities ("Base do técnico (Home office)") skip IDA navigation and show "Iniciar Atividade" button directly
- **NextStepPanel filtering**: Home office activities are excluded from "próxima atividade" options
- **Skip VOLTA**: "Encerrar jornada" and "Retornar à base" skip VOLTA time registration for home office activities
- **Identification**: Home office detected via `clientName === "Base do técnico (Home office)"`