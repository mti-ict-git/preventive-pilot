# Project Plan

## Purpose

Preventive Pilot provides one operational record for preventive and corrective maintenance across assets and facilities. It is intended to help maintenance teams schedule work, execute checklists, preserve evidence, apply approval controls, report failures, and measure operational performance.

## Outcomes

1. Planned PM work is generated consistently from schedules and templates.
2. Technicians can execute work from web or mobile with traceable evidence.
3. Supervisors and superadmins can review and approve PM completion.
4. Breakdown reports become lifecycle-managed CM work orders.
5. Asset, facility, task, audit, notification, and reporting data remain explainable.
6. Operations can deploy, monitor, recover, and update the system without relying on undocumented knowledge.

## Users and Stakeholders

| Stakeholder | Primary need |
| --- | --- |
| Technician | Find assigned work, execute checklists, attach evidence, report breakdowns |
| Supervisor | Plan capacity, assign work, review submissions, correct/reopen work |
| Admin | Operate users, integrations, notifications, and general system configuration |
| Superadmin | Final approval, destructive administration, policy, and full system control |
| Maintenance management | Compliance, overdue, CM, MTTR, and audit reporting |
| IT/operations | Identity, database, storage, deployment, integration, and recovery |

## In Scope

- LDAP and local authentication with JWT sessions.
- Role-based access control.
- Snipe-IT asset synchronization and locally managed facilities.
- PM templates and checklist requirements.
- Asset/facility PM settings, schedules, blackout windows, assignment rules, and capacity views.
- PM task lifecycle, evidence, drafts, PDF export, and staged approval.
- CM work-order reporting, assignment, lifecycle, downtime, resolution, and reporting.
- Web application and field-oriented Capacitor application.
- Notification channels/rules/logs and Firebase device registration.
- System settings, logs, jobs, and app-update policy.
- SQL Server persistence and evidence-file storage.

## Out of Scope Unless Explicitly Approved

- Replacing Snipe-IT as the asset master.
- Payroll, spare-parts inventory, procurement, or full enterprise asset management.
- Offline conflict resolution beyond the current mobile queue behavior.
- Multi-tenant isolation.
- Rewriting published Git history.

## Delivery Strategy

Work is governed by [implementation-roadmap.md](implementation-roadmap.md). The current baseline phase reconciles documentation with the implementation already present. Later feature work must:

1. select one active phase/checklist item;
2. read its source documents;
3. record ambiguities;
4. implement the bounded change;
5. verify happy and failure paths;
6. update contracts, documentation, and evidence before completion.

## Success Measures

- PM compliance and overdue counts can be produced from the system.
- Scheduled jobs are idempotent and observable.
- Each completed PM task has valid checklist outcomes and required evidence.
- Approval and correction events are attributable.
- CM work orders expose reported, assigned, active, completed/cancelled, downtime, and resolution states.
- API/schema changes are documented in the same change.
- Critical operational workflows have repeatable verification or tests.

## Constraints

- SQL Server is the transactional source of record.
- Snipe-IT remains authoritative for synchronized asset identity/details.
- Evidence files are external to SQL and depend on configured storage.
- LDAP, database, and JWT values are currently mandatory at API startup.
- The repository syncs with Lovable; published history must not be rewritten.
- The local mobile tree is currently not Git-tracked and cannot yet be treated as reproducible repository content.

## Risks

- Embedded and version-controlled OpenAPI descriptions can drift.
- Large route modules and limited automated test coverage raise regression risk.
- Secrets or generated mobile artifacts may exist in the local untracked mobile tree.
- Historical plans and README statements may describe behavior not fully verified in code.
- Shared-storage and external-integration failures can degrade evidence, sync, email, push, or update workflows.

See [open-questions-and-challenges.md](open-questions-and-challenges.md) for active decisions.
