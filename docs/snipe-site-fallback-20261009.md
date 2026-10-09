# Snipe-IT site fallback correction - 2026-10-09

Selected integration correction authorized by the user. Snipe-IT remains authoritative. Sync selects a valid positive integer location.id first, then rtd_location.id when actual location is absent/invalid. The selected ID must still resolve through the existing imported location map; absent or unmapped sites remain null and PM activation eligibility is unchanged. No hardcoded site or permission bypass. No routes, payloads or response schema changed; docs/openapi.yaml reviewed and unchanged.

Production read verification found MTI-PC-051 and MTI-PC-127 with null master sites while Snipe-IT default location is Morowali (ID 2). Recent failed activation PATCH requests target PC-127; error bodies are not retained. PC-051 currently has PM enabled, PC-127 disabled. Correction must not enable PM or alter checklist/task history by manual SQL.

Checklist: implementation and location policy regressions; backend typecheck/build; exact-source production release; authorized normal sync; read-only site and task-history verification. Release evidence will be appended after completion. This document supplements the existing functional specification/roadmap for this selected correction and does not close broader mobile or D2/D3 gates.
