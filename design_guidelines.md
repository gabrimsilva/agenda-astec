# ASTEC Agenda Management System - Design Guidelines

## Design Approach

**Selected Approach:** Design System with Material Design + Linear-inspired aesthetics

**Justification:** Enterprise productivity tool requiring data-dense interfaces (calendars, schedules, KPIs, approvals) where efficiency and clarity are paramount. The system serves multiple user roles with different workflows, demanding consistent, learnable patterns.

**Reference Inspirations:**
- **Linear:** Clean typography, subtle interactions, professional color restraint
- **Google Calendar:** Calendar interaction patterns, event density management
- **Material Design:** Enterprise-grade components for data tables, forms, dashboards

---

## Core Design Elements

### A. Color Palette

**Primary Colors:**
- **Dark Mode Primary:** 220 70% 50% (Professional blue - main actions, selected states)
- **Dark Mode Background:** 220 15% 10% (Deep navy-gray base)
- **Dark Mode Surface:** 220 12% 15% (Cards, modals, elevated elements)
- **Dark Mode Border:** 220 10% 25% (Subtle divisions)

**Light Mode:**
- **Light Primary:** 220 70% 45%
- **Light Background:** 0 0% 100%
- **Light Surface:** 220 15% 98%
- **Light Border:** 220 10% 90%

**Semantic Colors:**
- **Success:** 142 70% 45% (Approved activities, completed check-ins)
- **Warning:** 38 95% 50% (Conflicts, pending approvals)
- **Error:** 0 70% 50% (Rejected items, schedule conflicts)
- **Info:** 200 70% 50% (Informational alerts, tips)

**Activity Category Colors** (10 categories - high contrast for calendar density):
- Efetivo Group (1-4): Blue variations (220 65% 50%, 210 60% 55%, 230 70% 48%, 200 65% 52%)
- Adicional Group (5-8): Green/Teal variations (160 55% 45%, 180 50% 48%, 170 60% 42%, 190 55% 50%)
- Perda Group (9-10): Orange/Red variations (25 80% 55%, 10 75% 50%)

**Technician Avatar Colors:** Assign from palette (280, 320, 340, 40, 180, 160, 200) with 60% saturation, 55% lightness

**Day Markers:**
- F (Feriado): 0 70% 50%
- FE (Férias): 280 60% 55%
- S/D: 220 8% 60%
- P: 38 70% 55%
- H: 200 55% 50%

### B. Typography

**Font Stack:**
- Primary: Inter (Google Fonts) - body text, UI elements, data tables
- Headings: Inter Semi-Bold/Bold
- Code/Data: JetBrains Mono (for IDs, technical references)

**Scale:**
- **Headings:** text-3xl (30px) for page titles, text-2xl (24px) for section headers, text-xl (20px) for card titles
- **Body:** text-base (16px) for primary content, text-sm (14px) for secondary info/labels
- **Small:** text-xs (12px) for metadata, timestamps, captions
- **Calendar Events:** text-sm for event titles, text-xs for time/details

**Weights:** 400 (regular), 500 (medium for buttons/emphasis), 600 (semibold for headings), 700 (bold sparingly)

### C. Layout System

**Spacing Primitives:** Use Tailwind units of **2, 4, 6, 8, 12, 16** consistently
- Component padding: p-4 (cards), p-6 (modals), p-8 (main containers)
- Section spacing: space-y-6 (forms), gap-4 (grids), space-y-8 (page sections)
- Margins: mb-2 (tight grouping), mb-4 (standard separation), mb-8 (major sections)

**Grid System:**
- Desktop dashboard: 12-column grid with gap-6
- Calendar views: Full-width with sidebar (w-64 to w-80)
- Matrix spreadsheet: CSS Grid with auto-fit columns for days 1-31
- Mobile: Single column with full-width cards, stack navigation

**Container Max-widths:**
- Dashboard/Admin: max-w-7xl (1280px)
- Forms/Details: max-w-4xl (896px)
- Calendar: Full-width with controlled padding

### D. Component Library

#### Navigation
- **Top Bar:** Fixed, h-16, with logo, user role indicator, notification bell, profile menu
- **Sidebar (Desktop):** w-64, collapsible to w-16, persistent navigation for Admin/Gestor
- **Mobile Nav:** Bottom tab bar (h-16) for Assistente role with: Agenda, Rota, Atividades, Perfil
- **Breadcrumbs:** text-sm with chevron separators for deep navigation

#### Calendar Components
- **FullCalendar Integration:** Month/week/day views with custom event rendering
- **Event Cards:** Rounded corners (rounded-md), left border (w-1) in activity color, text-xs with truncation
- **Day Markers:** Small badges (top-right corner) with icon + letter (F/FE/S/D/P/H)
- **Conflict Indicators:** Diagonal striped pattern overlay with warning icon

#### Matrix Spreadsheet (Monthly View)
- **Column Headers:** Days 1-31 with weekday abbreviation
- **Row Headers:** Technician names with avatar
- **Cells:** min-h-12, color-coded background at 20% opacity, hover to expand details
- **Totals Row:** Sticky bottom with bold text, category summaries

#### Forms & Inputs
- **Text Inputs:** h-10, rounded-md, border-2, focus ring in primary color
- **Selects/Dropdowns:** Consistent height, chevron icon, searchable for long lists (clients, sites)
- **Date Pickers:** Calendar popover with month navigation, range selection support
- **File Upload:** Drag-drop zone with preview thumbnails for RAT/RAD/checklists
- **Geolocation Inputs:** Address autocomplete with Google Places, map preview on focus

#### Data Display
- **Tables:** Alternating row colors (subtle), sortable headers, sticky header on scroll, row actions dropdown
- **KPI Cards:** Statistic in text-3xl, label in text-sm text-muted, trend indicator (arrow + %), comparison period
- **Progress Bars:** h-2 rounded-full for % Efetivo/Adicional/Perda visualization
- **Badges:** Activity status (Planejado/Em execução/Concluído) with dot indicator + label

#### Maps
- **Map Container:** min-h-96 for desktop, min-h-screen for mobile route view
- **Marker Clusters:** Custom pins with technician avatar or activity icon
- **Route Polyline:** Animated dotted line in primary color, thickness 3px
- **Info Windows:** Card with client name, address, scheduled time, action buttons (Iniciar navegação)

#### Mobile Execution Views
- **Daily Route List:** Card-based with swipe actions, check-in button (large, rounded-full, floating)
- **Check-in Modal:** Full-screen overlay, camera access for photos, geolocation confirmation
- **Activity Logger:** Multi-step form with progress indicator, category selection with visual icons

#### Approval Workflow
- **Approval Queue:** List view with expandable cards, side-by-side comparison (submitted vs. adjusted)
- **Action Buttons:** Aprovar (success), Devolver (warning), Editar (secondary) - all size-lg
- **Comment Thread:** Collapsed by default, expandable with timestamp + user attribution

#### Dashboards
- **Widget Grid:** responsive (grid-cols-1 md:grid-cols-2 lg:grid-cols-3) with gap-6
- **Chart Types:** Bar charts for category distribution, line charts for trends, donut for percentages
- **Filters Panel:** Sidebar or collapsible top section with multi-select for técnico/equipe/cliente/período

### E. Animations

**Minimal, Purposeful Only:**
- **Transitions:** 150ms ease-in-out for hover states, 200ms for modal open/close
- **Loading States:** Subtle skeleton screens (shimmer effect) for calendar/table data
- **Check-in Success:** Single confetti burst or checkmark scale animation (500ms)
- **Drag-and-Drop:** Smooth position transitions, drop zone highlight
- **NO:** Auto-playing carousels, scrolling parallax, decorative animations

---

## Accessibility

- **Dark Mode:** System-wide with toggle in user profile, persistent preference
- **Form Inputs (Dark):** bg-surface with lighter border, text in high-contrast
- **Focus States:** 2px solid ring in primary color, never remove outlines
- **ARIA Labels:** All interactive elements, calendar events, map markers
- **Keyboard Navigation:** Tab order logical, Esc closes modals, Enter submits forms
- **Color Contrast:** WCAG AA minimum (4.5:1 for text, 3:1 for UI components)

---

## Images

**Usage Strategy:**
- **Login/Landing (if public):** Hero image of Renner facilities or technicians at work (1920x1080, optimized)
- **Empty States:** Illustrations for "No activities scheduled," "No approvals pending" (SVG, light/playful)
- **Technician Profiles:** Avatar photos (circular, 40x40 to 128x128 depending on context)
- **Activity Attachments:** RAT/RAD thumbnails in 4:3 aspect ratio, lightbox on click
- **NO hero image for main app:** This is a productivity tool, launch directly into calendar/dashboard

**Placeholder Strategy:**
- Use initials in colored circles for missing avatars
- Icon-based empty states (FullCalendar default or custom SVG)
- Google Maps static images for location previews

---

## Role-Specific UI Adaptations

- **Admin:** Full sidebar with settings/configurations, badge for pending user approvals
- **Gestor:** Approval queue prominent in navigation, bulk action toolbar for monthly closure
- **Assistente:** Simplified mobile-first with today's route emphasized, quick check-in FAB
- **Comercial/Viewer:** Read-only indicators, export-focused actions, hide all edit buttons