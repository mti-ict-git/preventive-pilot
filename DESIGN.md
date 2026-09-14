---
version: 1
status: existing-product-scan
omitted:
  - section: colors
    reason: Canonical semantic HSL values live in src/index.css; no duplicate token source.
  - section: spacing
    reason: Existing Tailwind utilities and shared components remain canonical.
  - section: components
    reason: Existing shadcn/Radix component implementations own presentation.
typography:
  sans:
    fontFamily: Inter, sans-serif
rounded:
  lg: 0.75rem
---

# Preventive Pilot design context

## Product context

An operational maintenance web application for technicians and maintenance managers. Current scope is browser use on laptops/desktops; repository documentation is English and current controls are English. User discussion is Indonesian. No Japan-specific market or locale requirements are established.

## Existing visual identity

Preserve the dense maintenance tables, left navigation, bordered cards and restrained semantic badges. The dark navy base, blue primary, cyan accent, red destructive and green success colors are defined in `src/index.css`, including existing theme/palette overrides. `tailwind.config.ts` maps those variables into shared components. This file records intent; it does not generate or replace runtime tokens. Typography uses Inter; the base radius is 0.75rem. No rebrand is part of AF-02.

## Interaction owners

Reuse `src/components/ui/button.tsx`, Radix-backed dialog/alert-dialog/select primitives, shared table/input components, existing Header and layout. Keep permissions consistent between facility list and detail using `src/lib/auth.ts`; backend authorization remains authoritative. Follow [UX contract](UX-CONTRACT.md) and [access policy](docs/security-and-access-model.md).

## AF-02 scope

Hide unauthorized master action triggers, preserve readable detail fields and PM planning controls, show actionable errors and prevent repeat submits while pending. Keep established card/table geometry. Existing unrelated responsive/layout and UI-consistency debt is not authorization to redesign the app.
