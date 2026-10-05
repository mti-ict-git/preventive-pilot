# UI behavior contract

Scope: existing product, with AF-02 facility master permissions as the first verified slice. Product rules remain in [functional specification](docs/functional-specification.md), [access model](docs/security-and-access-model.md), and [OpenAPI](docs/openapi.yaml).

| Capability | Canonical owner | AF-02 behavior / verification |
| --- | --- | --- |
| Permissions | Backend facility guard; frontend canManageFacilities in src/lib/auth.ts | Hide create/clone/archive/save-master for unauthorized roles; retain read and PM planning behavior; HTTP role matrix and browser fixture |
| CRUD | Facilities and FacilityDetail with React Query | Create/clone close dialog and refresh list; detail save stays on detail; failures preserve input and show text |
| Dialog | src/components/ui/dialog.tsx and alert-dialog.tsx | Existing confirmation for archive, Escape/cancel/focus restoration; no native confirmation |
| Form | Shared Input; existing field handlers | Scope read-only state to master fields; pending submit disabled; named fields and visible errors |
| Select/Listbox | Shared Radix Select; existing native create-location select | Preserve existing popup owners for this permission change; detail location disabled for read-only master |
| Table Selection | Existing facility list selection | Retain bulk PM selection; remove bulk archive trigger for unauthorized role |
| Feedback | Inline role=alert for mutation errors; existing toaster provider | Errors remain visible after failed save; modal errors inside dialog |

Visual tokens and theme ownership are recorded in [DESIGN.md](DESIGN.md). AF-02 does not establish new pagination, locale, scrollbar or global form contracts. Those existing surfaces require separate reconciliation if modified. A browser fixture verifies UI behavior with synthetic data; it does not certify production DB persistence.

## Tasks list contract — 2026-10-03

Source: [task lifecycle and list policy](docs/functional-specification.md#task-list-views--2026-10-03), [GET /api/tasks](docs/openapi.yaml). Use the existing backend assignment scope; this change grants no new permissions. Counts are matching task totals, never unread notifications; zero is meaningful, unavailable/loading is shown separately. Counts apply the shared search/assignment/date/status/approved-only scope independently of active tab and page. Stored approval stage takes display precedence over completed/in-progress legacy state, except cancelled records.

### Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
| --- | --- | --- | --- | --- |
| Tabs | src/components/ui/tabs.tsx (Radix) | DESIGN.md and task list policy | Tasks wrapping counted views; manual keyboard activation | Browser tab, keyboard, narrow viewport checks |
| Select/Listbox | src/components/ui/select.tsx (Radix) | Existing shared authored popup | Tasks assignment/status filters | Open popup, keyboard and selection |
| Date | src/components/ui/input.tsx | Native date input with explicit labels; browser/OS picker locale accepted for existing desktop filters | Native Tasks due-range inputs; serialize browser-local days to UTC | Label activation and date boundary tests |
| Lists | Tasks React Query + GET /api/tasks | OpenAPI shared-filter predicates | 25-row pagination; view/search/filter/page in URL; clamped page after change | More than 200 records, empty/error, refresh and pagination tests |
| Feedback | Existing task toaster + list role=alert/status | Existing application feedback owners | Inline list/count error with retry; no-results with clear | Browser failure and empty checks |
| Navigation | Existing Header/layout and task detail dialog | Existing list/detail workflow | Named task opener; separate assignment control | Keyboard focus and opener |

React Query keys include the complete request so stale responses cannot overwrite another view. Search is debounced 300 ms, skips IME composition, clears immediately and exposes an explicit clear control. Day boundaries refresh on calendar rollover; reads revalidate every 30 seconds. Schedule/date and lifecycle views may overlap; the panel text explains the selected view. Each page keeps document scrolling; no ancestor viewport-height or hidden-overflow constraint is introduced. Existing task-detail mutations and unrelated global UI debt are outside this slice.

### Task detail return context — 2026-10-05

Closing a Tasks detail modal preserves the current route-backed view, search, assignment, status, approval/date filters and page. A deep-linked modal removes only `taskId`, using history replacement; closing an ordinary list-opened modal does not navigate. Successful supervisor or final approval refreshes Tasks lists/counts and approval queues while preserving that context. Existing pagination may clamp a page that becomes empty after the count changes. Failed approval preserves the open modal and context. Shared Radix Dialog remains the modal/focus owner; no new navigation primitive is introduced.

## Approvals queue reconciliation — 2026-10-05

The Approvals inbox reuses GET /api/tasks pending views, server totals and shared search scope. Pending stage filtering happens before 25-row pagination, matching PM Tasks. Tab, committed search and page persist in the URL; filter changes reset the page and refreshed totals clamp an empty last page. Radix Tabs, shared Button/Input/Checkbox and the existing toaster remain canonical owners. Counts show loading/unavailable separately from zero; read failures expose retry. Page selection cannot act on hidden selections, and mutations invalidate Approvals, Tasks and task-stat queries. Search follows the Tasks 300 ms/IME-safe/explicit-clear behavior. Unsupported location/category placeholder selects are removed. Waiting Submit uses personal completed-but-unsubmitted records (`ApprovalStatus = None`, non-cancelled, technician timestamp present) while reading every server page in the assigned-me scope before local 25-row pagination; this is a read-side compatibility fallback, not a lifecycle transition.
