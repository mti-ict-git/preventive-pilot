> Historical snapshot — superseded by the unified implementation roadmap on 2026-09-11. Old task statuses below are historical, not current instructions.

# PM Settings and Scheduling Review

Review date: 2026-09-11. Status: first five product decisions confirmed; implementation pending. Active scope: D1 desktop requirements discussion, F-03.

## Observed implementation

Sources: `backend/src/routes/assets.ts`, `backend/src/routes/facilities.ts`, `backend/src/jobs/scheduleCalc.ts`, `backend/src/routes/scheduling.ts`, `backend/src/routes/tasks.ts`, `backend/src/config/env.ts`, and `db/schema.sql`.

- Automatic candidate selection uses PMEnabled and a single DefaultTemplateId per asset/facility. This does not mean that the task/schedule tables cannot reference other templates; it describes the default generation path.
- Asset PM settings accept an explicit NextPMDueAt. SQL fn_CalculateNextDueAt prioritizes that stored date; otherwise it adds the template interval to task completion, stored last completion, or current UTC time when no history exists.
- Intervals 30/90/180/365 map to calendar month/quarter/half-year/year additions; other intervals add days. Do not describe 30 as always exactly thirty elapsed days.
- Complete/final-approval paths also contain inline next-due updates. Full parity and facility behavior remain Q-04; a fixed-versus-completion-based business decision must be reconciled across paths.
- The generation job selects the next due candidate inside JOB_TASK_HORIZON_DAYS (default 30), ensuring one due occurrence per candidate in the inspected loop. It does not loop over every future recurrence. Calendar projections and persisted task generation are distinct.
- PM configuration and recalculate routes use manager authorization (Supervisor/Admin/Superadmin); this is distinct from the agreed facility master-data restriction.
- Broken/archived assets and frozen schedules are excluded from applicable generation. Broken-asset cancellation remains AF-01, not a new question.
- SQL blackout handling moves a date inside an active blackout to the latest matching EndsAt. Blackout management routes use Superadmin. Weekend/public-holiday semantics must not be assumed from this mechanism.

No database, scheduler, API, or UI execution was performed in this review.

## Confirmed decisions — 2026-09-11

| Topic | User decision |
| --- | --- |
| Template scope | One default template per asset/facility is sufficient |
| Recurrence | Keep the planned schedule anchor; late completion does not shift subsequent periods |
| First PM | Retain the existing fallback of current time plus template interval when no explicit due date or history exists |
| Generation horizon | Retain the default 30-day window for next-due candidate generation |
| Planning permissions | Retain Supervisor/Admin/Superadmin PM settings and recalculation access |

Example: a monthly task due 1 September and completed 10 September is followed by a task due 1 October, not 10 October. Preserve actual completion/submission/approval timestamps separately from planned due dates. Delayed approval must not shift the recurrence anchor either.

## SC-01 — Anchor recurring PM to the planned schedule

Observed gap: completion and final-approval paths currently include next-due calculations based on completion time; the SQL primitive prioritizes an existing next-due value and otherwise can also use completion history. The confirmed policy therefore requires reconciliation across writers and readers, not only a calendar-label change.

- [ ] Inventory next-due writers/readers: generation, SQL primitive, normal/force recalculate, completion, final approval, projections, asset/facility settings, and PM Now.
- [ ] Define and preserve a durable planned anchor and distinguish it from effective work dates. Initialize a first schedule according to the confirmed fallback without repeatedly moving it on each job run.
- [ ] Calculate recurrence from the planned schedule consistently for assets and facilities; retain actual completion and lateness history.
- [ ] Inspect and resolve multi-period overdue handling, PM Now effects, blackout shifts, manual date/interval changes, frozen schedules, and month-end behavior before dependent changes. Do not assume whether missed cycles are skipped or backfilled.
- [ ] Define migration/reconciliation for existing due dates and already-generated tasks without silently changing historical records or creating duplicates.
- [ ] Synchronize functional/API/schema documentation where the selected implementation changes those contracts.
- [ ] Verify a monthly task due 1 September and completed 10 September yields 1 October; late approval does not shift it. Test equivalent asset/facility cases, retries, repeated recalculation, first activation, history retention, and the agreed boundary cases.

No implementation or acceptance item above is complete. The fixed-schedule decision is settled; remaining operational details are tracked as Q-18 and parity work remains Q-04.

## Later discussion

After the first decisions, inspect and discuss PM Now effects, postponed/overdue cycles, blackout boundaries, frozen schedules, calendar projections/capacity, and assignment rules. Record decisions before changing behavior; avoid re-asking settled broken-asset rules.
