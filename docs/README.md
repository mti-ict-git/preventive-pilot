# Documentation Index

Last reviewed: 2026-09-10. Baseline: source inspection of this checkout; production behavior has not been certified.

## Current delivery scope

The current priority is the desktop/browser application and its backend/database. Mobile-specific work and acceptance are deferred; retained mobile descriptions provide context and do not create desktop release gates. Follow the [desktop-first roadmap](implementation-roadmap.md) for the scoped checklist.

## Start here

Read the [project plan](project-plan.md), [functional specification](functional-specification.md), and [active roadmap phase](implementation-roadmap.md) before planning a change. Follow [AGENTS.md](../AGENTS.md) for execution and verification.

The documents below are the active source of truth. Code is evidence of existing behavior; a conflict with a documented requirement must be recorded and resolved before changing behavior. Historical documents are reference material, not a competing specification.

## Mandatory baseline

| Document | Responsibility |
| --- | --- |
| [Project plan](project-plan.md) | Product purpose, scope, boundaries, and delivery expectations |
| [Product principles](product-principles.md) | Rules for product and implementation decisions |
| [Functional specification](functional-specification.md) | User roles, workflows, states, and acceptance expectations |
| [Technical implementation plan](technical-implementation-plan.md) | Architecture, implementation boundaries, and change procedure |
| [OpenAPI](openapi.yaml) | Versioned API contract baseline; known coverage limitations are explicit |
| [Database schema specification](database-schema-specification.md) | Entities, relationships, constraints, and schema evolution |
| [Implementation roadmap](implementation-roadmap.md) | Active phase, checklists, outputs, and verification gates |
| [Open questions and challenges](open-questions-and-challenges.md) | Unresolved decisions, observed discrepancies, and closure criteria |

## Supporting references

| Document | Responsibility |
| --- | --- |
| [Architecture decisions](architecture-decisions.md) | Reconciled architectural choices and their evidence |
| [Deployment and environment](deployment-and-environment.md) | Local setup, configuration, ports, Docker, and mobile setup |
| [Security and access model](security-and-access-model.md) | Authentication, roles, ownership, and approval restrictions |
| [Integration contracts](integration-contracts.md) | Snipe-IT, storage, notifications, discovery, and app updates |
| [Operational runbook](operational-runbook.md) | Health checks, diagnosis, recovery, and deployment checks |
| [Testing strategy](testing-strategy.md) | Verification commands and scenario-based acceptance |
| [API coverage](api-coverage.md) | Static route inventory and embedded-contract coverage gaps |
| [Documentation verification](documentation-verification.md) | Evidence for the D0 documentation phase |
| [APK publication](apk-publish.md) | Current delivery components and unresolved publication procedure |
| [Release notes](release-notes.md) | Supplied release note; version/date provenance is not established |

## Historical sources

These documents are retained at their existing paths to preserve references. Their banners identify them as historical. Do not execute their setup/deployment instructions without checking the active guidance.

| Historical document | Use active document instead |
| --- | --- |
| [Original implementation plan](implementation-plan.md) | Project plan, technical plan, and roadmap |
| [PM enhancement plan](PM-Task-Enhancement-Plan.md) | Functional specification and roadmap |
| [PM delta plan](PM-Task-Enhance-DeltaPlan.md) | Roadmap and open questions |
| [CM implementation plan](cm-implementation-plan.md) | Functional specification and data model |
| [CM mobile plan](cm-mobile-plan.md) | Functional specification and deployment guidance |
| [Mobile integration plan](mobile_apps_developmentplan.md) | Technical plan, access model, and testing strategy |
| [Mobile approval plan](PM-workflow-mobile-plan.md) | Functional specification and access model |
| [Ngrok proposal](implement-ngrok.md) | Integration contracts |
| [Push channel plan](push_channel.md) | Integration contracts and functional specification |
| [Development journal](journal.md) | Historical evidence only; entries are not consistently chronological |
| [Previous root README](archive/readme-before-baseline.md) | Root README and this index |
| [Previous mobile README](archive/mobile-readme-before-baseline.md) | Deployment guidance and mobile README |
| [Previous APK publication guide](archive/apk-publish-before-baseline.md) | Current APK publication guide |

## Maintenance rules

1. Update the responsible active document with every behavior, contract, or schema change.
2. Record uncertain behavior in the question register with evidence and a closure criterion; do not silently turn a proposal into a requirement.
3. Update the roadmap checklist only after recording verification evidence.
4. Preserve historical entries. Put new decisions and verification in active documents instead of extending old plans.
5. Keep documentation in English. Store examples without credentials or deployment secrets.

Dates identify documentation review, not a release date. “Observed” means found in source. “Verified” requires a recorded check. “Proposed” means future work that has not started.
