# Product Principles

## 1. Traceability Before Convenience

Maintenance work must be attributable. Lifecycle changes, assignment, evidence, completion, approval, rejection, revision, and administrative actions should preserve actor and timestamp information.

## 2. Safety-Critical Validation Happens on the Server

Clients may guide users, but the API must enforce permissions, lifecycle transitions, mandatory checklist outcomes, notes, evidence requirements, and approval locks.

## 3. One Work Record, Two Maintenance Modes

PM and CM share task/checklist/evidence infrastructure where useful, while retaining explicit `MaintenanceType` semantics and CM-specific reporting, impact, downtime, and resolution fields.

## 4. Assets and Facilities Are First-Class Maintenance Subjects

Every maintenance task targets exactly one asset or one facility. Scheduling, display, reporting, and permissions must not assume assets only.

## 5. External Masters Are Synchronized, Not Silently Replaced

Snipe-IT is the upstream asset source. Local records preserve maintenance history and normalize operational status. Missing upstream assets are archived rather than deleted.

## 6. Scheduling Must Be Deterministic and Idempotent

Schedule calculation, PM Now, blackout handling, frozen schedules, and job retries must not create duplicate work. Broken or archived assets do not receive new projected/generated PM work.

## 7. Approval Is a Controlled State Machine

Technician submission, supervisor review, superadmin approval, rejection, revision, and reopen operations are explicit transitions. Non-authorized edits are blocked while approval is pending or final.

## 8. Evidence Must Be Durable and Explainable

Metadata belongs in SQL Server; file content belongs in configured storage. Upload, replacement, deletion, import, and download behavior must be permission-aware and auditable.

## 9. Least Privilege

Technicians modify work they are allowed to execute. Manager capabilities are shared by Supervisor, Admin, and Superadmin where appropriate. Sensitive configuration and destructive actions require Admin or Superadmin, with Superadmin reserved for the highest-impact operations.

## 10. Web and Mobile Share Contracts

Web and mobile clients consume the same REST contract. Platform-specific UX may differ, but status names, validation, permissions, and response meaning must not diverge.

## 11. Degraded Integrations Must Be Visible

Snipe-IT, LDAP, Graph email, Firebase push, shared storage, and APK hosting are external failure domains. Failures should be logged and surfaced without corrupting core maintenance records.

## 12. Documentation Is Part of the Product

The mandatory documents, OpenAPI contract, database specification, roadmap, and verification evidence are updated with the behavior they describe. Historical plans are supporting context, not automatic truth.
