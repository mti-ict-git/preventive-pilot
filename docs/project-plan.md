# Project Plan

Last reviewed: 2026-09-10. Status: current product baseline, reconstructed from existing documentation and source.

## Purpose

Preventive Pilot is a maintenance management system centered on preventive maintenance (PM), with corrective maintenance (CM) work orders for breakdowns. It supports asset and facility maintenance from planning through execution, evidence collection, approval, and reporting.

The project is connected to Lovable. That connection does not replace the Express backend, SQL Server, storage, or deployment requirements.

## Users and outcomes

| User | Primary outcome |
| --- | --- |
| Technician | Find assigned work, execute checklists, attach evidence, and report breakdowns |
| Supervisor | Plan and assign work, review submissions, and track overdue maintenance |
| Admin | Perform permitted management actions and configure supported operational features |
| Superadmin | Finalize approval and manage privileged configuration and administration |
| Operations/support | Run services, diagnose jobs and integrations, and recover supported deployments |

Role names are not a complete authorization specification; see the [access model](security-and-access-model.md).

## Current scope

- Synchronize asset data from Snipe-IT; maintain facilities separately.
- Configure PM templates, checklist order, notes, outcomes, attachment requirements, and default PM settings.
- Generate recurring tasks and immediate PM Now tasks; manage assignment, blackouts, frozen schedules, and capacity displays.
- Execute tasks with evidence and a technician/supervisor/superadmin review flow.
- Create and execute CM work orders for an asset or facility, with symptom, impact, failure details, downtime, and resolution.
- Provide dashboard/reporting, CSV/PDF output, notification channels, and job/system visibility.
- Provide the available PM Tech mobile application with shared backend access and Android integration.

These capabilities are present in source to varying degrees. Presence is not evidence of end-to-end acceptance; the [roadmap](implementation-roadmap.md) separates documentation from application verification.

## Current delivery priority

User direction, 2026-09-10: focus first on the browser-based desktop/web application and its backend/database. PM Tech remains part of the broader product baseline but is deferred from the current delivery scope. Mobile source ownership, APK distribution, offline behavior, native features, and mobile-specific acceptance are not desktop blockers. Shared backend contracts must remain compatible with existing consumers.

## Boundaries

Inventory/spare-parts control, procurement, purchase orders, vendor contracts, cost accounting, predictive maintenance, and IoT ingestion are not established scope in this baseline. They must enter through a separate documented proposal if required.

Snipe-IT remains the source for synchronized asset attributes. The PM database owns maintenance settings, tasks, checklists, approvals, evidence references, and maintenance history. Facility records are managed in this application.

## Asset/facility scope clarification — 2026-09-11

All assets originate in Snipe-IT; PM does not create independent assets or own synchronized master-data edits. AC and electrical panels are outside current maintenance scope, and server-specific UPS is a facility context. Location means site location. Daily desktop work prioritizes schedules and PM tasks. Potential asset/facility mapping and general exclusion rules are not approved implementation scope. See [asset/facility evaluation](implementation-roadmap.md).

## Delivery approach

D0 documentation baseline is complete. The desktop-first priority is recorded as a documentation follow-up. D1 requirements discussion is active, beginning with assets/facilities. Later implementation and proposed D2–D3 work reconcile desktop contracts/workflows, make web/backend setup and delivery reproducible, and validate desktop operational acceptance. Mobile work is deferred. No delivery dates, business KPIs, or production-readiness claim are implied by this reconstruction.

## Success criteria

- A new contributor can find the current scope, architecture, environment requirements, and active work phase.
- Every workflow has defined expected behavior and visible unresolved differences.
- API and schema changes have a maintained contract and verification path.
- PM and CM acceptance can be demonstrated using recorded role, workflow, and failure-path evidence.
- Operators have a reproducible setup and recovery procedure before production acceptance.

## Constraints and decisions still needed

SQL Server and integration credentials are environment-specific. Desktop approval, scheduling, API coverage, reports, and operational setup require further reconciliation. Mobile source and APK uncertainties are retained as deferred items and do not block this desktop-first effort. Track these in [open questions](open-questions-and-challenges.md), not as assumed completed work.
