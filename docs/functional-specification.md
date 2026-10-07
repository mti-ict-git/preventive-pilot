# Functional Specification

Last reviewed: 2026-09-10. Baseline: observed source and reconciled product intent. Runtime acceptance remains open.

## Current delivery scope

The current priority is the desktop/browser application and its backend/database. Mobile-specific work and acceptance are deferred; retained mobile descriptions provide context and do not create desktop release gates. Follow the [desktop-first roadmap](implementation-roadmap.md) for the scoped checklist.

## Actors and terminology

Technician, Supervisor, Admin, and Superadmin are the main role names. Assignment may target a user or a role. See [security and access](security-and-access-model.md) for endpoint-specific distinctions.

An **asset** is synchronized equipment. A **facility** is a locally maintained maintenance context, including areas and server-specific UPS equipment under the user-confirmed scope. A **template** defines recurring PM and checklist requirements. A **PM task** is preventive work. A **CM work order** is reactive work stored in the same task entity with `MaintenanceType = CM`. Each task references exactly one asset or facility.

## F-01 — Assets and facilities

Assets support search, filters, detail, maintenance settings, history, images, and PM Now. Snipe-IT sync preserves its raw status label and a normalized operational status (`operational`, `broken`, `archived`). Assets missing from sync are archived to retain history.

Facilities support creation, editing, archive, cloning, and PM defaults, including bulk PM operations. They are not Snipe-IT hardware records.

Partial facility PM-setting updates preserve omitted template and due-date fields. Explicit null clears a supplied field; supplying a template without a date resets both due dates for recalculation. A PM enabled/disabled toggle alone does not clear the configured template or schedule dates and cancels only unstarted PM tasks when PM is disabled, as defined below. See [regression verification](verification-d1-regression.md).

Acceptance: maintenance settings persist for the selected context; history retains task/evidence relationships; archived/broken state is reflected in scheduling behavior.

### User-confirmed scope — 2026-09-11

Snipe-IT is the sole asset master source: create new assets there, then synchronize. PM is passive for synchronized asset master data while owning maintenance configuration and records. AC and electrical panels are excluded from the current maintenance scope; server-specific UPS is classified as a facility. Current sync imports returned Snipe-IT hardware without a special AC/panel filter; this inspection does not establish which categories are present upstream. No sync-filter change is authorized by the maintenance-scope exclusion alone.

Location represents the site and is not expected to change in normal operations. Admin/Superadmin own facility master-data changes; Supervisors communicate needs verbally and cannot create/edit/archive facilities. No in-app facility change-request workflow is required. Facility archival cancels only unstarted PM tasks, as confirmed on 2026-09-27. Broken assets now receive no new PM work, and unfinished PM asset tasks are automatically cancelled with history retained. AF-01 cancels all unfinished PM asset tasks, including approval-pending submissions, when Snipe-IT synchronization marks the asset `broken`; completed/cancelled history and CM work orders are untouched. PM Now and PM lifecycle actions that would make the task actionable again are rejected while the asset remains broken, and repeated sync/action retries are idempotent. Automatic archival of missing upstream assets does not require admin confirmation; upstream reappearance does not reopen previously cancelled PM tasks automatically.

Asset-to-facility mapping is deferred by user decision on 2026-09-27. Preserve current Snipe-IT synchronization without adding mapping or filtering; revisit only when explicitly requested. On 2026-09-27 the user confirmed that site and an active default template are required when enabling PM for either assets or facilities. Disabling PM or archiving a facility cancels only unstarted PM tasks; started/paused/submitted work and CM work orders remain intact. The primary daily desktop needs are schedules and PM tasks. See the [answer evaluation](implementation-roadmap.md) for confirmed versus tentative decisions; the listed activation/deactivation transitions now have live SQL evidence in [Q-14/Q-15 verification](verification-q14-q15.md), while deployed UI acceptance remains separate.

### PM activation and deactivation — confirmed 2026-09-27

Master data may be saved incomplete while PM is disabled. Enabling PM requires a site and an active default template; asset category compatibility remains enforced. Apply this to individual and bulk settings and to cloning enabled facility settings. An enabled context cannot have its site/default template cleared through these settings routes; disable PM first. Reject invalid batches atomically.

Disabling PM on an asset/facility, or archiving a facility, cancels only PM tasks still open with no StartedAt, no work sessions, no technician submission, and no approval/review/rejection history. Preserve the task, results/evidence, cancellation reason, actor/time and audit record. Started, paused, submitted, completed, cancelled, rejected, and CM work are retained. Re-enabling/reactivating never automatically reopens cancelled work. Broken-asset AF-01 remains the distinct broader cancellation rule.

Implementation and local verification are tracked in the roadmap; this decision alone is not deployment acceptance.

## F-02 — Templates and checklists

Templates define intervals, applicable category, required assignment role, estimated duration, and ordered checklist items. Attachment enablement controls whether an attachment is offered; attachment requirement controls completion validation. Required items cannot be skipped. Outcomes use `0 = skip`, `1 = pass`, `2 = fail` for pass/fail checklist items; non-pass/fail items display nonzero completion as done.

PM completion and technician submission now share the same checklist-validation baseline for active item membership, mandatory non-skip outcomes, fail notes, explicit notes-on-pass/done flags, and attachment requirements. Submission does not set lifecycle `Status = completed`; this boundary is documented and locally verified under Q-02. Unused template deletion and references must be checked against the route rather than assuming all deletions are soft deletes.

Acceptance: ordering survives save/reload; applicable category restrictions hold; required evidence/notes failures are rejected and explained.

### User decisions — 2026-09-11

Template management remains available to Supervisor/Admin/Superadmin. Notes are required on failure rather than merely because an item is mandatory. For checklist items explicitly configured with `RequiresNotes`, notes are also required on Pass/Done. Existing per-item attachment rules remain unchanged.

Nonfinal tasks follow template changes, while final-submitted/historical tasks retain their original checklist definitions. The cutoff is successful technician submission for approval (`submit-for-approval`, entering `PendingSupervisor`), not final Superadmin approval. TC-02 now preserves an additive per-task checklist snapshot at the first successful submission and reuses it for later review, revision/resubmission, task detail, checklist progress counts, evidence labeling, and PDF/history export. Returned/reopened work keeps the original submitted definition; later template edits must not silently replace it. Legacy historical tasks that predate the snapshot model fall back to the current template, but the API/export must make that uncertainty explicit rather than claiming the live definition is the original historical one. Use [TC-02](implementation-roadmap.md#tc-02) as the action reference.

## F-03 — Scheduling and assignment

Recurring schedules exist for assets and facilities. The background job calculates upcoming work within its configured horizon. PM Now can create immediate work and includes idempotency checks. Assignment rules can fall back to the template's required role.

Broken/archived assets and frozen schedule rows are excluded from applicable new-task generation. AF-01 also rechecks asset availability at PM Now creation time and at the schedule-insert boundary so a stale candidate cannot recreate actionable PM work after the asset has already become broken. Existing tasks remain visible. Calendar/day responses can include projected occurrences that are not yet persisted tasks. Estimated duration uses the template value with a 60-minute fallback; the web capacity display uses an eight-hour default threshold. This is a planning display, not proof of per-technician staffing optimization.

Final PM approval uses the shared scheduling-policy helper for assets and facilities; planned-anchor and blackout parity is locally verified under Q-04. Live SQL acceptance remains separate.

Acceptance: test duplicate requests, frozen rows, broken assets, blackouts, interval boundaries, asset/facility parity, and the distinction between actual and projected work.

### Confirmed scheduling policy — 2026-09-11

Use one default template per asset/facility. Recurring PM remains anchored to planned due dates: monthly work due 1 September and completed 10 September is next due 1 October. Completion or approval delays must not shift the planned cadence. SC-01 now persists this with separate planned and effective due dates so approval/completion delays do not move the regular anchor.

Retain the existing first-date fallback (current time plus template interval when no date/history exists), 30-day default generation horizon, and Supervisor/Admin/Superadmin planning permissions. See [SC-01](implementation-roadmap.md#sc-01) for implementation and verification. Missed-period and PM Now behavior is defined below. Blackout/manual changes and technical/migration boundaries still require scoped reconciliation before dependent changes.

Q-04 verification now confirms that final PM approval uses the same scheduling-policy path for both asset and facility contexts. Asset and facility completion both advance `NextPlannedPMDueAt` from the fulfilled planned anchor and apply blackout through the same helper logic rather than diverging per context.

### Missed periods, early PM, and PM Now — agreed 2026-09-11

Maintain one actionable PM job for the current maintenance need rather than requiring several repeated checklists for one physical execution. Preserve missed periods as not performed, never implicitly completed. Do not automatically replace in-progress or approval-stage work. For work caught up in November, preserve September/October misses and keep the next planned date at 1 December.

Early execution fulfills the next regular occurrence: performing a 1 October task on 20 September leaves 1 November as the next planned date. Preserve the original planned date and actual execution date separately.

For the same asset/facility and template, PM Now reuses applicable due/overdue work first, then an existing next regular task. If no applicable task exists, create a task representing the next regular occurrence and prevent duplicate generation. SC-01 now applies this reuse order for asset and facility PM Now flows and keeps missed periods recorded separately as not performed.

### Blackout and Skip next PM — 2026-09-11

Retain existing global blackout behavior; no blackout expansion or separate indefinite suspension workflow is requested. Skip next PM intentionally omits one upcoming occurrence and leaves PM enabled on its original cadence. Supervisor, Admin, and Superadmin may perform it with a required reason. Preserve the occurrence, actor/time, and any existing task history; do not record the skip as completed work or automatically replace in-progress/approval-stage tasks.

Example: skipping 1 October leaves 1 November as the next regular occurrence. A deliberately skipped occurrence must be distinguishable from ordinary overdue nonperformance. SC-01 now records the skipped occurrence with reason, actor and time, cancels an unstarted generated task for that planned occurrence when necessary, and advances only one planned cycle. Current reporting continues to use the effective due window (`ScheduledDueAt`) and keeps skip history distinguishable for later policy refinement. Skip privileges do not broaden existing blackout-administration privileges.

### Role queue and capacity — agreed 2026-09-11

Routine PM work is routed to an appropriate role queue using assignment rules/template-role fallback. An eligible technician claims the task and becomes its single responsible person. Claims must be exclusive under concurrency; role membership does not permit takeover of a task already assigned to another technician. Managers retain direct assignment/reassignment for operational exceptions, and existing individual assignments must not be silently cleared.

AS-01 now implements this with an atomic `POST /api/tasks/{taskId}/claim` flow for PM tasks that are still queued to a role, plus ownership precedence of assigned user over role membership across execution and shared work-order/task mutation paths. Repeating the claim by the current owner is idempotent and returns `claimed=false`; another technician receives a conflict instead of silently taking over.

Supervisor/Admin/Superadmin may reassign before technician submission, including while work is in progress. After submission, reassignment is locked until the Supervisor explicitly returns the work for revision. Submitted PM tasks are also locked from technician claim and non-Superadmin draft editing while pending approval or already approved. Preserve actor/result/evidence history across a handoff; returning for revision does not implicitly change the submitted checklist definition.

Assignment-rule editing remains Superadmin-only. Keep the current aggregate estimated workload per day; no per-technician capacity, shift management, or automatic balancing is requested. Task-list "assigned to me" and outstanding-count semantics only match a role queue when the task does not yet have an individual assignee. See [AS-01](implementation-roadmap.md#as-01) and [verification evidence](verification-as01.md) for the implemented behavior and local verification scope.

## F-04 — Task execution and evidence

Task APIs expose start, pause, resume, cancel, reopen, complete, assignment, draft, evidence, and export operations. Stored lifecycle values and UI filters must not be treated as one enum: due-today/overdue/upcoming labels may be derived from dates and state.

Evidence supports task-level and checklist-level attachments. Storage is configured server-side; the existing convention uses quarter/year folders. The documented upload limit is 50 MB per file. Access and approval locks must be enforced server-side. Backdated completion is restricted to management roles and requires a non-future timestamp and a reason; effective completion time and data-entry time remain separate.

Acceptance: successful execution persists results and evidence; missing/invalid data, forbidden ownership, approval locks, oversized files, and future backdates fail appropriately. Verify upload limits and formats against each operation rather than assuming generic multipart behavior.

### Execution decisions — 2026-09-11

Support Start/Pause/Resume to measure PM work time; Pause does not require a reason for now. EX-01 now persists additive PM work-session rows rather than deriving active duration from `StartedAt`/`CompletedAt` alone. Active work is distinguished from paused or approval-waiting time, and task detail exposes a `workSessionSummary` with total active seconds, session count, and the currently open session start time when applicable. Timing starts only from explicit Start/Resume, not merely from assignment or draft entry.

An inspection containing Fail may be submitted with required notes and configured evidence. Offer explicit work-order creation for the finding; this is optional, not automatic or a prerequisite to submitting the PM inspection. Repair completion is distinct from inspection submission.

## F-05 — PM approval

Expected review path:

```mermaid
flowchart LR
  N[None or returned work] -->|Submit| S[PendingSupervisor]
  S -->|Supervisor-level review| A[PendingSuperadmin]
  A -->|Superadmin approval| F[Approved]
  S -->|Reject| R[Rejected]
  A -->|Reject| R
```

Revision is a separate action and can reopen work; its exact reset behavior must be read together with the endpoint contract. The overview above is not a complete transition validator.

| Operation | Observed behavior |
| --- | --- |
| `complete` | Sets lifecycle completion fields after validation; not equivalent to final approval |
| `submit-for-approval` | Applies the PM checklist validation baseline, writes technician trail and `PendingSupervisor`; the handler does not itself set lifecycle `Status = completed` |
| `approve-by-supervisor` | Requires `PendingSupervisor`; allows Supervisor, Admin, or Superadmin; moves to `PendingSuperadmin`; a Supervisor may review their own submission at this stage; other same-user reviewers remain forbidden |
| `approve-by-superadmin` | Requires `PendingSuperadmin`; Superadmin only; sets `Approved`, lifecycle completion, and closes any open PM work session; the reviewer must not be the same user who submitted the PM work |
| `revise-approval` | Separate correction path with Supervisor/Superadmin route guard; requires a nonblank written reason, closes any open PM work session, and applies the Q-03 Supervisor own-submission exception only at PendingSupervisor |
| `reject-approval` | Requires a nonblank written reason, preserves the rejected task history, creates or reuses one linked replacement PM task instead of reopening the same task, and applies the Q-03 Supervisor own-submission exception only at PendingSupervisor |

The web Approvals page provides review queues. Task detail and PDF export expose sign-off information. Historical statements that submission always marks lifecycle completion are superseded by this distinction. Q-02 verification now confirms that repeated `submit-for-approval` attempts are rejected once the task is already waiting for approval. PM checklist validation at submission is aligned with completion. EX-01 now also closes active PM work sessions on submission and final approval so review waiting time is not counted as active execution time. Q-03 updated by user direction on 2026-10-05: a Supervisor may approve, revise or reject their own PM submission at PendingSupervisor, including a combined Technician/Supervisor role. The exception does not grant new route roles, does not apply at PendingSuperadmin or final approval, and does not change CM self-verification restrictions. Facility finalization remains under Q-04.

Acceptance: test each actor and valid/invalid transition, repeated submission, required evidence, returned work, own-work approval policy, and facility/asset finalization. Do not count source inspection as acceptance.

### Return-to-work decisions — 2026-09-11

Revise means the existing task can be corrected and requires a written reason. Reject means the work is incorrect and must be repeated. User confirmed that repeated work uses a new replacement task linked to the rejected original. Retain original results, evidence, work time, and rejection reason. Creation trigger, duplicate prevention, assignment, template selection, and recurrence/compliance attribution remain implementation boundaries (Q-20). Preserve rejected history and the submitted checklist definition; do not silently discard prior results/evidence or treat every rejected state as a revision unlock.

See [EX-01](implementation-roadmap.md#ex-01) for implementation/verification. The implemented flow now enforces the mandatory revision/rejection reason and linked replacement-task behavior; remaining follow-up is limited to reporting/compliance interpretation rather than core workflow semantics.

## F-06 — Corrective maintenance

Create a work order from an asset/facility breakdown or a PM finding. Collect symptom, impact, optional failure category/code, reported channel, and downtime start. CM reuses task/checklist/evidence infrastructure through `/api/work-orders` and shared task operations where applicable. EX-01 now adds optional `sourceTaskId` and `sourceTemplateChecklistItemId` linkage for failed PM findings so the same finding can reuse its existing linked work order on repeated clicks. Automatic creation is still not requested.

Work orders support list/detail, assignment, start/pause/resume, technician repair submission, manager verify-close, same-WO return for correction, independent restoration logging, downtime reopening before closure, linked recurrence after closure, cancel, and resolution updates. The web provides a ticket-style subject, downtime history, review state, and event history view. Do not assume the PM approval chain applies to CM.

Confirmed user direction, 2026-09-11, now implemented locally by CM-01: the technician reports repair completion; the Supervisor verifies the repair and closes the WO. Equipment restoration ends downtime even if administrative WO closure is still pending. Restoration, technician completion, and manager closure are stored as distinct events. Incomplete repair is returned to the technician on the same WO with a mandatory written reason and preserved work/evidence history. Supervisor, Admin or Superadmin may perform the single verification and close the WO; no second approval stage is required. A repair performer must never verify their own WO, regardless of role.

Confirmed restoration and recurrence policy, 2026-09-11, now implemented locally by CM-01: the assigned technician or Supervisor/Admin/Superadmin may record equipment restoration; recording restoration does not approve or close the WO. Default to the current time, but allow an actual past restoration time with a mandatory written reason and change history. If the same fault recurs before WO closure, retain that WO and append a new downtime interval. If it recurs after closure, create a new WO linked to the previous WO. Exclude the intervening operational time from downtime; retain previous intervals. An unrelated fault is separate work.

Acceptance: a breakdown remains associated with exactly one context; assignment and lifecycle access are enforced; closing downtime and completing work have distinguishable effects; PM views exclude CM where required.

## F-07 — Reports and notifications

Reports cover compliance, overdue work, assets without PM, and system logs. CSV exports and task PDF exports are available in the existing implementation.

Current implemented metric contract, 2026-09-17:

- Compliance uses UTC `ScheduledDueAt` between the requested `from` and `to` timestamps as the denominator. Cancelled work is excluded from the denominator. `approvedOnly=true` narrows only the completion numerators (`completedOnTime`, `completedTotal`); it does not change the denominator.
- `currentlyOverdue` is evaluated at request time for the same filtered population using unfinished, uncancelled tasks whose `ScheduledDueAt` is already in the past.
- Overdue reporting also uses UTC `ScheduledDueAt` versus the request time and now includes both asset and facility task contexts. Location filters apply to either asset or facility context; category filters remain asset-only because facilities do not have asset categories.
- CM metrics use UTC `ReportedAt` between the requested `from` and `to` timestamps. MTTR is the average reported-to-completed duration (`ReportedAt` to `CompletedAt`), grouped by category/location; it is not downtime-interval duration and not technician active labor time.
- The dashboard overview is a PM overview: due today, overdue, upcoming 7 days, and compliance trend queries are PM-only and exclude cancelled tasks from those PM KPI aggregates.

Notification configuration supports mail/Microsoft Graph, WhatsApp, and push. Rules cover reminders/escalations and task/approval events. Admin/Superadmin broadcast is a separate action. See [integration contracts](integration-contracts.md) for routing and delivery limitations.

## F-08 — Mobile

The available client is `mobile/pm-tech`: React + Vite + Capacitor, not React Native. It includes PM tasks, CM work orders, assets/facilities, schedule, offline, and profile pages, plus native QR/biometric/push/update integrations.

Production API fallback is a fixed HTTPS domain in the client. Discovery is opt-in. Offline replay, native installation, and biometric storage guarantees require device testing. Mobile is currently ignored by Git; local presence is not fresh-checkout availability (Q-06).

## Traceability

Source evidence: `src/pages`, `src/lib/api.ts`, `backend/src/routes`, `backend/src/jobs`, `db/schema.sql`, and the available `mobile/pm-tech` source. Contract gaps are in [API coverage](api-coverage.md). Verification scenarios and phase gates are in [testing strategy](testing-strategy.md) and the [roadmap](implementation-roadmap.md).

## AF-02 implementation evidence — 2026-09-11

Facility creation, master edits/archival/activation and cloning now enforce Admin/Superadmin in the backend and corresponding desktop controls. Supervisor retains PM settings/PM Now rights and read access. See [AF-02 verification](verification-af02.md) for route, browser and static/build evidence and its database/deployment limits. No facility lifecycle or task-cancellation behavior was added by this permission change.

## Task and work-order deletion — D1, 2026-09-27

Manual hard deletion remains available under existing permissions: managers for PM (subject to task access) and Superadmin for CM. The task endpoint accepts PM only; the work-order endpoint accepts CM only. Wrong-type and missing IDs return 404.

Deletion removes the task and its owned checklist results/snapshot, evidence metadata, drafts, work sessions, CM events and downtime intervals in one transaction, together with its audit entry. Incoming source/recurrence links from another task, missed/skipped occurrence history, or notification logs block deletion with 409 `TASK_REFERENCED`. No related task or independent historical record is cascaded or detached. Cancellation remains available where history must be retained. Evidence-file cleanup is best-effort after database commit. See [verification](verification-task-deletion.md).

## Local-only authentication (Q-05)

Local login can operate without LDAP configuration. The existing Local login tab sends `provider: "local"`. LDAP remains available when all eight directory connection/search fields are configured. No automatic credential fallback is performed; omitted API provider retains its LDAP default. Unconfigured LDAP operations return 503 with `LDAP_NOT_CONFIGURED`, after applicable authorization and validation.

### Task-list views — 2026-10-03

Desktop Tasks applies view, search, assignment, approved-only, date range and secondary status filters server-side before pagination. Badge counts cover the complete shared-filter scope, not the first 100/200 rows, and remain independent of the selected view/page. Tabs show total matching tasks, not unread notifications.

All includes historical records. Due Today covers the browser-local calendar day, passed as inclusive/exclusive UTC boundaries. Overdue retains request-time ScheduledDueAt semantics and can overlap Due Today when a due time has already passed. Upcoming starts at the next calendar day with no seven-day cap; the dashboard's Upcoming 7 Days contract is unchanged. Scheduling tabs include open work, including paused/in-progress work when dates match, but exclude completed, cancelled, PendingSupervisor, PendingSuperadmin and Approved records. In Progress requires stored in_progress with no submitted/final approval lock; Paused requires stored paused. Completed excludes pending approval. Approval tabs use their exact ApprovalStatus and exclude cancelled records, including legacy submitted rows whose stored lifecycle is completed. These stage labels take precedence on displayed task cards; no stored historical statuses are rewritten.

Advanced filters intersect the chosen tab and affect all badges. Search matches literal substrings in task number, asset tag/name, facility or site. Approved only means ApprovalStatus=Approved. Task list pages contain 25 records with exact matching totals and page controls; changes reset/clamp paging. Existing assignment/role access remains authoritative; this is a list correction, not a permission change or change to report/dashboard KPI semantics.

### Task approval return context — 2026-10-05

After supervisor or final approval from a task detail modal, closing the modal returns to the same Tasks tab and retains search, shared filters and page. Successful approval refreshes rows/counts so the approved record moves out of its former pending queue. If that removes the final page, clamp to the nearest valid page within the same filtered view. Deep-link cleanup removes only the task identifier. Cancelling/closing without approval also retains context; an approval error leaves the modal available for retry.

### Approvals list completeness — 2026-10-05

The desktop Approvals inbox must use the same pending-stage predicates and totals as PM Tasks, within the same PM/search scope. Filtering precedes pagination; all matching tasks remain reachable beyond the first 100 general tasks. Queue badges count matching records, not unread notifications. Search applies to the entire queue and preserves route state. Review actions refresh queue and task totals without resetting the selected tab. Unsupported location/category placeholder filters are not presented as functional filters. This correction does not alter approval permissions or transitions.

### PM history reconciliation — authorized 2026-10-06

A scheduled occurrence fulfilled by a separate legacy PM Now is linked through PMOccurrenceResolutions. Only an untouched open duplicate is retired as cancelled with an explicit fulfilled-by reason; the actual execution, approval, checklist and evidence remain on the performing task. One execution resolves one occurrence. Planned/effective dates and actual completion remain separate. Resolved missed-history rows remain as historical snapshots and must be interpreted with the resolution ledger. Early PM fulfils the next occurrence; late PM fulfils the applicable overdue occurrence, never every missed cycle. Active/paused/submitted work is protected; ambiguous historical mappings remain listed for review. Final completion/approval uses the task planned period before the current schedule cursor and does not rewind later recurrence or execution history. Reopening a resolved duplicate returns 409 PM_OCCURRENCE_FULFILLED; the mutation predicate rechecks the resolution under locks to cover concurrent reconciliation. Deletion of either linked record returns TASK_REFERENCED; the fulfilment ledger is independent history.

Calendar/day responses include completed, completed-late and pending buckets. A reconciled execution appears once on the original effective due date and exposes its actual completedAt and replacedTaskNumber. Pending review and completed work contribute zero remaining capacity. Cancelled duplicates, CM tasks and unsupported projections are excluded; projected work is suppressed if persisted execution already represents that occurrence.


Reviewed legacy exception (2026-10-06, PC-010/PC-049 only): a started-only PM Now alias may be retired by an explicit transactional reconciliation when the same context/template has a unique completed/approved normal execution after the alias was created/started, and the alias has no checklist results, task/checklist evidence, work sessions, drafts, submission/completion, source-task link or resolution notes. Preserve StartedAt and all performing-task history; record the fulfilment link and cancellation reason. Do not approve the alias, change recurrence, or consume the August period. This is a reviewed operational exception for PM-NOW-20260302-EEEC7150 and PM-NOW-20260302-5EA1A61C, not automatic cancellation of active work or a relaxation of the general planner.


### Automatic single active PM execution (2026-10-06 clarification)

For the same asset or facility and template, starting or resuming PM work makes it the single active maintenance need, including when launched through PM Now. Untouched open schedule tasks are automatically cancelled as superseded with the active task ID retained in their cancellation reason and audit record. This is not completion or approval. Started work, paused work, submitted work, checklist results, evidence, sessions and drafts must never be discarded. A second protected execution is rejected with a conflict. The generator must find protected work across dates before advancing a schedule, and must not generate later jobs while that execution remains active. Once work is completed, normal cadence resumes from its fulfilled planned occurrence; elapsed unperformed occurrences remain missed. Superseded and missed tasks cannot be reopened or deleted to bypass this policy. Historical missed records remain available.

Missed periods whose untouched task remains open are retired automatically. Calendar projections use the same site/category eligibility as task creation and are suppressed while protected work exists for that context/template. Calendar overdue totals can include eligible projected work; global navigation counts and search-filtered counts must be explicitly distinguished.

The generator may restore an untouched automatically superseded future occurrence when it becomes the current need and no protected execution remains. It reuses the same task ID to respect unique occurrence indexes, retains the previous cancellation reason in an audit event, and never restores missed, skipped, manually cancelled or worked records. User-facing reopen remains blocked for automatic history. Evidence writes fence the task row; draft writes share the context lock and recheck editable status.

When a long-running PM finally completes, elapsed intervening planned periods are recorded as missed and the next due date is the first later planned period. They are not silently completed, and an immediate duplicate PM for an elapsed period is not generated after the actual execution finishes. Final approval uses the technician execution date, so delayed approval alone does not move cadence.

### PM Tasks date sorting - 2026-10-06

PM Tasks exposes a visible Sort by selector for due date earliest/latest and created date oldest/newest. The backend sorts the complete matching dataset before pagination; defaults preserve due-date ascending behavior. Stable TaskId tie-breaking prevents repeated dates from destabilizing pages. Sort never changes task membership or totals. Committed sort lives in the URL, survives tab/filter/detail return and reload, and resets pagination to page 1 when changed. Due date means stored ScheduledDueAt; created date means CreatedAt. No lifecycle or permissions change.

### Outstanding PM schedule precedence — 2026-10-07

Asset and facility next planned/effective dates must prefer outstanding work for the current template over a stored cursor that has advanced past it. Started, paused and submitted work retains precedence. For untouched work, explicit skipped/missed history remains authoritative; older elapsed cycles may still be reconciled as missed under the existing cadence policy. The generator recovers an earlier outstanding occurrence before trusting the cursor, does not let a future task conceal a nearer unmaterialized obligation, and synchronizes schedule settings under the existing context transaction lock. Legacy PM Now effective dates use the fulfilled occurrence resolution or its superseded scheduled task, matching the calendar, rather than moving a normal due date back to the raw PM Now creation date. Interval 180 continues to mean six calendar months; this correction does not change intervals, actual completion, approval, checklist or evidence history.

### Historical attribution correction — 2026-10-07

The user-directed On Track audit reversed two unsupported legacy mappings (MTI-PC-051 and MTI-PC-052): February/March completed PM Now executions had been attributed to untouched July tasks created in June. Matching context/template and a nearby date does not establish historical occurrence ownership. The reviewed July tasks are restored to their pre-reconciliation open state, the unsupported resolution links are removed with their complete before-images retained in the private audit and compensating AuditLog entries, and the performing tasks retain actual completion, approval and evidence. Their unsupported FulfilledPlannedDueAt values are cleared; the existing July planned/effective dates become the outstanding cursor. This scoped correction does not introduce a maximum early-execution window or change legitimate early PM replacement. Future historical reconciliation must prove occurrence ownership from contemporaneous task/schedule evidence; ambiguous mappings must remain unresolved.

## Label Designer printing — 2026-10-07

Print and export share one PDF renderer; SVG preview uses its exact geometry and QR image and use the currently displayed settings, without requiring a defaults save. Label length and tape width define exact page dimensions; orientation rotates those dimensions. QR size includes the quiet border. Invalid geometry or text overflow produces an actionable error rather than silent clipping/rescaling. One asset produces one PDF page; grid columns affect preview only. Unsupported logo/corner-radius affordances are hidden.

Admin/Superadmin editing and server defaults permissions remain unchanged. Unsaved edits survive defaults refetch and are retained as a validated, user-scoped browser draft across reloads. Save Defaults persists shared settings through the existing PUT endpoint and clears the saved draft; failure retains edits. Browser storage failure is explicit. Printer media length/width and actual-size scaling must match the PDF; cutter/feed margins remain driver/hardware settings.

### Company Asset label layout

Label Designer offers an optional Company Asset layout and an 82x18mm tape preset. It prints the asset name prominently on the left, Company Asset, a reconstructed monochrome MTI logo, replaceable PNG/JPG logo or explicit text fallback when hidden, QR on the right and a vertical DON'T REMOVE warning. Standard layout remains the default for existing settings. QR payload selection is unchanged; logo/layout are included in validated local drafts and explicit shared Save Defaults. PNG/JPG uploads are limited to 2 MB; invalid files and insufficient space fail explicitly. No printer-driver changes or physical-print acceptance are implied.
