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

## Tasks list refinement — 2026-10-03

Preserve the existing semantic CSS/Tailwind tokens, Inter typography and shared Card/Button/Radix Tabs owners. Task views use wrapping rectangular tabs with quiet numeric badges, visible focus and explicit selection; every tab remains visible at laptop widths. Cards keep the existing maintenance vocabulary with tighter spacing and a named keyboard-operable task opener. No new palette or global theme tokens are introduced. Counts are dataset totals rather than unread-message notifications.


## Unified label safe area - 2026-10-08

Label Designer retains existing shared Radix controls and visual tokens. PDF and SVG share one calibrated content area for logo, text, QR quiet zone and warning. On 18mm-height labels the effective border inset is at least 1.5mm plus absolute vertical offset. Content inset is the maximum of requested padding, calibrated printable clearance and effective border inset plus 0.6mm when enabled. The UI displays requested/effective margins and safe dimensions. One batch output query owns preview and print/export availability; invalid configurations show an actionable error and disable output without reducing the requested QR size. Company Asset uses reserved rows/columns; its warning splits into two vertical word columns when necessary to maintain legible type. Physical page dimensions remain unchanged.
