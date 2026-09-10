# Product Principles

Last reviewed: 2026-09-10. These principles guide future changes; they do not claim that every existing route already complies.

1. **Maintenance work stays traceable.** Preserve the relationship between asset/facility, template, task, checklist results, evidence, responsible users, and timestamps. Destructive operations need explicit lifecycle rules.
2. **PM and CM remain distinguishable.** Reuse shared infrastructure while making planned maintenance and breakdown work identifiable in screens, API filters, and reports.
3. **Completion and approval are separate concepts.** A technician submission, supervisor review, and final approval have different meanings. Never infer final approval from a completed label alone.
4. **The backend enforces access.** Hidden or disabled UI controls improve usability but do not establish authorization. Role and assignment checks belong at the operation boundary.
5. **Scheduling must be explainable.** Existing tasks and projected occurrences are different. Blackout, operational state, freeze, idempotency, and completion-date effects must be documented and tested.
6. **Evidence requirements are explicit.** Attachment visibility and mandatory evidence are distinct flags. Users must understand what prevents completion and how to correct it.
7. **Field work must expose synchronization state.** Offline actions, pending evidence, failures, and conflicts must be visible. Local persistence does not prove that a server accepted an action.
8. **Metrics need stable definitions.** State the population, dates, maintenance type, approval inclusion, and exclusions behind compliance, overdue, and CM metrics.
9. **Integrations fail visibly.** Surface sync/job failures and notification outcomes without conflating queued work with successful delivery.
10. **Documentation and evidence move with the change.** Update active contracts and roadmap evidence; keep unresolved questions visible. Avoid rewriting published Git history because the repository is connected to Lovable.

Use the [functional specification](functional-specification.md) for expected behavior and the [question register](open-questions-and-challenges.md) when observed behavior falls short or is ambiguous.
