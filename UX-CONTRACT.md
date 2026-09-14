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
