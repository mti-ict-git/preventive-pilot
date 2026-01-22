# PM Task Enhancement Plan

## Goal
Deliver the approved PM enhancements with a phased rollout that strengthens scheduling accuracy, reduces duplicates, improves assignment logic, and adds capacity-aware planning with consistent API validation and documentation.

## Scope
- Facility scheduling support (recurring tasks beyond PM Now)
- Centralized next-due calculation with blackout handling
- PM Now idempotency and duplicate prevention
- Assignment fallback to template required role
- Category enforcement for template assignment
- Scheduling freeze for broken assets
- Capacity-aware planning in calendar and assignment
- OpenAPI documentation and consistent validation errors

## Phase 0 — Foundation and Schema
### Objectives
- Add schema support for facility scheduling and idempotency.
- Centralize next-due calculation primitives.
- Add indexes for new read/write paths.

### Work Breakdown
- Define facility schedule storage model and enforce Asset vs Facility exclusivity.
- Introduce an idempotency constraint for PM tasks.
- Publish a single SQL due-date calculation primitive used by all consumers.
- Add indexes aligned to scheduling, calendar, and task list queries.

### Deliverables
- Schema updates in db/schema.sql for facility schedules.
- Unique index for PM task idempotency.
- Centralized next-due calculation as SQL function or view.

### Database Changes
- Add pm.FacilityPMSchedules with FacilityId, TemplateId, NextDueAt, Frozen, Source, UpdatedAt.
- Add unique index on pm.PMTasks (AssetId, TemplateId, ScheduledDueAt).
- Add computed helper or SQL function for due-date calculation with blackout support.

### Dependencies
- Facility PM settings table already exists.
- Template intervals and blackout windows are present and trusted.

### Risks and Mitigations
- Risk: due-date logic mismatch between SQL and TS.
  - Mitigation: deprecate TS duplication and migrate all consumers to SQL primitive.
- Risk: unique index blocks legitimate duplicates for different assets.
  - Mitigation: include asset or facility keys in the unique constraint, not template alone.

### Acceptance Criteria
- Schema applies idempotently in new and existing environments.
- PM Now and job-created tasks cannot duplicate by AssetId + TemplateId + ScheduledDueAt.
- Due-date logic is defined once and can be reused by jobs and API routes.

## Phase 1 — Backend API and Validation
### Objectives
- Enforce category matching and assignment fallback.
- Prevent PM Now duplicates and align error shapes.
- Add facility scheduling endpoints and OpenAPI coverage.

### Deliverables
- Facility scheduling CRUD endpoints.
- PM Now idempotency guard using the unique index or pre-check.
- Assignment fallback using template.requiredRole when no assignment rule matches.
- Category enforcement when setting defaultTemplateId.
- Unified 4xx error format and OpenAPI documentation.

### Work Breakdown
- Add facility schedule calculation API endpoints and include facility occurrences in calendar/day views.
- Update PM Now handler to return existing task when a duplicate is attempted.
- Enforce template category validation on asset PM settings update.
- Implement assignment fallback when rule lookup returns null.
- Standardize validation errors to include code and details fields.

### Backend Endpoints
- POST /api/scheduling/recalculate with facility support and consistent response format.
- GET /api/scheduling/calendar and /day include facility occurrences.
- POST /api/tasks/pm-now returns existing task when duplicate detected.
- PATCH /api/assets/:assetId/pm enforces template category match.

### Sample Error Shape
```json
{
  "message": "Invalid request",
  "code": "VALIDATION_ERROR",
  "details": [
    { "field": "defaultTemplateId", "issue": "Category mismatch" }
  ]
}
```

### Acceptance Criteria
- Asset PM settings reject mismatched template categories when template.applicableCategoryId is set.
- PM Now is idempotent within the same due timestamp and returns existing task id.
- When assignment rules return null, tasks are assigned to template.requiredRole.
- All touched endpoints are documented in OpenAPI with consistent error shapes.

### OpenAPI Coverage
- Scheduling: calendar, day, recalc (asset and facility).
- Tasks: PM Now, task list, task detail, completion.
- Templates: list, detail, create, update, deactivate.

## Phase 2 — Job Scheduler Enhancements
### Objectives
- Generate facility tasks using the same schedule engine.
- Respect broken assets and frozen schedules.
- Use centralized due-date logic for all schedule calculations.

### Deliverables
- Facility schedule calculation job.
- Asset scheduling respects assetOperationalStatus and PMSchedules.Frozen.
- Unified next-due calculation used in jobs and API routes.

### Work Breakdown
- Add facility schedule candidate query and task creation pipeline.
- Skip candidates when assetOperationalStatus is broken or schedules are frozen.
- Write unified schedule updates to both PMSchedules and FacilityPMSchedules.
- Ensure schedule calculation respects blackout windows using the SQL primitive.

### Acceptance Criteria
- Facility PM tasks are generated automatically when PM is enabled and template active.
- Broken assets do not receive new PM tasks until operational again.
- Schedule calculation uses a single due-date logic definition everywhere.

## Phase 3 — UI and Capacity Planning
### Objectives
- Add capacity-aware overlays in scheduling views.
- Surface facility scheduling and freeze states in the UI.

### Deliverables
- Calendar and day view show capacity vs estimated duration.
- Assignment suggestions consider workload and due dates.
- Facilities show upcoming scheduled tasks, not only PM Now.

### Work Breakdown
- Add capacity calculations using template.estimatedDurationMinutes or fallback defaults.
- Render capacity badges by day with warning thresholds.
- Add facility occurrences to calendar and day lists.
- Expose schedule freeze state and broken-asset status in task rows.

### Responsive Layout Example
```tsx
<div className="grid grid-cols-12 gap-4">
  <div className="col-span-12 md:col-span-6">...</div>
  <div className="col-span-12 md:col-span-6">...</div>
</div>
```

### Acceptance Criteria
- Calendar overlays show daily total estimated minutes with warning badges.
- Scheduling views remain usable on mobile and desktop.

### Wireframe Notes
- Calendar View: left pane calendar, right pane day list, top-row capacity badge.
- Day Detail: task list with estimated minutes and assignment chips.
- Facility Detail: PM settings + upcoming schedule preview.

## Phase 4 — UX Flow and Component Tree
### High-Level UX Flow
- Scheduler reviews capacity by day and drills into due tasks.
- Manager enables facility PM and sees upcoming tasks in scheduling views.
- Technician runs PM Now and receives a task without duplicates.

### Web Component Tree (Shadcn UI + Tailwind)
- SchedulingPage
- CalendarView
- DayDetailDrawer
- CapacitySummaryCard
- TaskListTable
- TaskAssignmentDialog
- FacilityDetailPage
- FacilityPmSettingsCard

### Mobile Component Tree (React Native Paper or Tamagui)
- SchedulingScreen
- CalendarStrip
- DayTaskList
- CapacityChip
- TaskCard
- AssignmentBottomSheet

### Accessibility
- Keyboard navigation for calendar and task lists.
- ARIA labels on capacity badges and date selectors.
- Contrast-safe status badges and focus-visible outlines.

### Responsive Guidelines
- Use 12-column grids with md:col-span-6 for two-column layouts.
- Calendar collapses to a stacked list on small screens.
- Capacity badges remain visible on mobile as compact chips.

## Phase 5 — Sample Implementations
### Web Theming Example
```tsx
import { ThemeProvider } from "@/components/theme-provider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return <ThemeProvider defaultTheme="system">{children}</ThemeProvider>;
}
```

### Mobile Theming Example
```tsx
import { Provider as PaperProvider, MD3LightTheme } from "react-native-paper";

const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: "#2563eb",
  },
};

export function MobileProviders({ children }: { children: React.ReactNode }) {
  return <PaperProvider theme={theme}>{children}</PaperProvider>;
}
```

### Backend Endpoint Example
```ts
import { Router } from "express";

export const facilitySchedulingRouter = Router();

facilitySchedulingRouter.get("/facility-calendar", async (_req, res) => {
  res.json({ items: [] });
});
```

### Load Calculation Example
```ts
type CapacityItem = { date: string; estimatedMinutes: number; thresholdMinutes: number };

const evaluateCapacity = (item: CapacityItem) => {
  const utilization = item.estimatedMinutes / item.thresholdMinutes;
  return { utilization, state: utilization >= 1 ? "over" : utilization >= 0.8 ? "near" : "ok" };
};
```

## Phase 6 — QA, Ops, and Documentation
### Objectives
- Validate schema, lint, typecheck, and job stability.
- Update OpenAPI and verify consistency.

### Acceptance Criteria
- npm run db:verify, npm run lint, and npx tsc --noEmit pass.
- OpenAPI docs cover all updated scheduling, task, and template endpoints.
- Rollout checklist includes data migration and monitoring steps.

### Rollout Checklist
- Apply schema changes and verify indexes in staging.
- Run schedule calculation for assets and facilities.
- Validate PM Now idempotency and category enforcement.
- Confirm calendar capacity overlays and mobile responsiveness.

## Rollout Order
- Apply schema updates and indexes.
- Deploy backend with unified due-date logic and idempotency.
- Deploy job scheduler changes for assets and facilities.
- Deploy UI updates with capacity overlays.
- Verify metrics, logs, and audit trails.
