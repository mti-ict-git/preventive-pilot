# D1 Remaining Boundary Review

Reviewed: 2026-09-27. Supporting evidence for the [roadmap](implementation-roadmap.md), not a separate execution backlog.

## Q-01 desktop dependency inventory

Reviewed all 51 operations missing from the initial OpenAPI inventory against HTTP method/path calls in `src/lib/api.ts` and references in `src/`. 37 operations have desktop caller references. Absence of a static caller does not establish that an external consumer does not use an endpoint. Deferred update/device surfaces are not desktop acceptance gates. The table is dependency evidence, not payload/error or runtime certification; Q-01 remains open until applicable contracts and authorization/error paths are reconciled.

| Missing operation | Scope | Client wrapper | Desktop reference |
| --- | --- | --- | --- |
| `DELETE /api/notifications/channels/{channelId}` | Desktop caller found | `apiDeleteNotificationChannel` (`src/lib/api.ts:1953`) | `src/pages/Notifications.tsx` |
| `DELETE /api/tasks/{taskId}` | Desktop caller found | `apiDeleteTask` (`src/lib/api.ts:711`) | `src/pages/AssetDetail.tsx` |
| `DELETE /api/templates/{templateId}` | Desktop caller found | `apiDeleteTemplate` (`src/lib/api.ts:1677`) | `src/pages/Templates.tsx` |
| `DELETE /api/work-orders/{taskId}` | Desktop caller found | `apiDeleteWorkOrder` (`src/lib/api.ts:980`) | `src/pages/WorkOrderDetail.tsx` |
| `GET /api/app-updates/download` | Deferred mobile/update surface | — | — |
| `GET /api/app-updates/latest` | Deferred mobile/update surface | — | — |
| `GET /api/app-updates/policy` | Deferred mobile/update surface | — | — |
| `GET /api/assets/{assetId}/history` | No desktop caller found | — | — |
| `GET /api/auth/me/preferences` | Desktop caller found | `apiGetMyPreferences` (`src/lib/api.ts:144`) | `src/components/layout/Header.tsx` |
| `GET /api/docs.json` | No desktop caller found | — | — |
| `GET /api/facilities/{facilityId}` | Desktop caller found | `apiGetFacility` (`src/lib/api.ts:252`) | `src/pages/FacilityDetail.tsx` |
| `GET /api/system/ldap/search` | Desktop caller found | `apiSearchAdUsers` (`src/lib/api.ts:1530`) | `src/pages/UserManagement.tsx` |
| `GET /api/system/microsoft-graph-settings` | Desktop caller found | `apiGetMicrosoftGraphSettings` (`src/lib/api.ts:2211`) | `src/pages/SettingsNotifications.tsx` |
| `GET /api/system/pm-settings` | No desktop caller found | — | — |
| `GET /api/system/snipeit-settings` | Desktop caller found | `apiGetSnipeItSettings` (`src/lib/api.ts:2199`) | `src/pages/SystemSettings.tsx` |
| `GET /api/system/status` | Desktop caller found | `apiGetSystemStatus` (`src/lib/api.ts:2066`) | `src/pages/AssetDetail.tsx`, `src/pages/Assets.tsx`, `src/pages/LabelDesigner.tsx`, `src/pages/SystemSettings.tsx` |
| `GET /api/system/ui-settings/assets` | Desktop caller found | `apiGetAssetsUiSettings` (`src/lib/api.ts:2077`) | `src/pages/Assets.tsx`, `src/pages/SettingsCategories.tsx` |
| `GET /api/system/ui-settings/label-designer` | Desktop caller found | `apiGetLabelDesignerUiSettings` (`src/lib/api.ts:2115`) | `src/pages/LabelDesigner.tsx` |
| `GET /api/system/users/for-assignment` | Desktop caller found | `apiListAssignableUsers` (`src/lib/api.ts:1471`) | `src/pages/Tasks.tsx` |
| `GET /api/system/whatsapp-settings` | Desktop caller found | `apiGetWhatsAppSettings` (`src/lib/api.ts:2215`) | `src/pages/SettingsNotifications.tsx` |
| `GET /api/tasks/approvals` | No desktop caller found | — | — |
| `GET /api/tasks/my-outstanding-counts` | No desktop caller found | — | — |
| `GET /api/tasks/status-counts` | No desktop caller found | — | — |
| `GET /api/templates` | Desktop caller found | `apiListTemplates` (`src/lib/api.ts:1627`) | `src/pages/AssetDetail.tsx`, `src/pages/Assets.tsx`, `src/pages/Facilities.tsx`, `src/pages/FacilityDetail.tsx`, `src/pages/SystemSettings.tsx`, `src/pages/Templates.tsx` |
| `GET /api/templates/{templateId}` | Desktop caller found | `apiGetTemplate` (`src/lib/api.ts:1631`) | `src/pages/Templates.tsx` |
| `POST /api/app-updates/report` | Deferred mobile/update surface | — | — |
| `POST /api/devices/push-test` | Desktop caller found | `apiPushTest` (`src/lib/api.ts:2257`) | `src/pages/Notifications.tsx` |
| `POST /api/devices/register` | Deferred mobile/update surface | — | — |
| `POST /api/system/evidence-import/run` | Desktop caller found | `apiRunEvidenceImport` (`src/lib/api.ts:2387`) | `src/pages/SystemSettings.tsx` |
| `POST /api/system/jobs/{jobName}/run` | Desktop caller found | `apiRunJob` (`src/lib/api.ts:2336`) | `src/pages/Assets.tsx`, `src/pages/Notifications.tsx`, `src/pages/SettingsCategories.tsx`, `src/pages/SystemSettings.tsx` |
| `POST /api/system/microsoft-graph-settings/test` | Desktop caller found | `apiTestMicrosoftGraphSettings` (`src/lib/api.ts:2234`) | `src/pages/Notifications.tsx`, `src/pages/SettingsNotifications.tsx` |
| `POST /api/system/snipeit-settings/test` | Desktop caller found | `apiTestSnipeItSettings` (`src/lib/api.ts:2207`) | `src/pages/SystemSettings.tsx` |
| `POST /api/system/users/assign-ldap` | Desktop caller found | `apiAssignAdUser` (`src/lib/api.ts:1514`) | `src/pages/UserManagement.tsx` |
| `POST /api/system/users/local` | Desktop caller found | `apiCreateLocalUser` (`src/lib/api.ts:1506`) | `src/pages/UserManagement.tsx` |
| `POST /api/system/users/{userId}/refresh-ldap` | Desktop caller found | `apiRefreshLdapUser` (`src/lib/api.ts:1477`) | `src/pages/UserManagement.tsx` |
| `POST /api/system/whatsapp-settings/test` | Desktop caller found | `apiTestWhatsAppSettings` (`src/lib/api.ts:2241`) | `src/pages/Notifications.tsx`, `src/pages/SettingsNotifications.tsx` |
| `POST /api/tasks/bulk-assign-unassigned` | Desktop caller found | `apiBulkAssignUnassignedTasks` (`src/lib/api.ts:675`) | `src/pages/Scheduling.tsx` |
| `POST /api/tasks/{taskId}/checklist-items/{templateChecklistItemId}/evidence/upload` | Desktop caller found | `apiUploadTaskChecklistEvidenceFile` (`src/lib/api.ts:1167`) | `src/pages/Tasks.tsx` |
| `POST /api/tasks/{taskId}/evidence/upload` | Desktop caller found | `apiUploadTaskEvidenceFile` (`src/lib/api.ts:1133`) | `src/pages/Tasks.tsx`, `src/pages/WorkOrderDetail.tsx` |
| `POST /api/tasks/{taskId}/superadmin-update-checklist` | No desktop caller found | — | — |
| `POST /api/templates` | Desktop caller found | `apiCreateTemplate` (`src/lib/api.ts:1658`) | `src/pages/Templates.tsx` |
| `POST /api/work-orders/{taskId}/resolution` | Desktop caller found | `apiUpdateWorkOrderResolution` (`src/lib/api.ts:976`) | `src/pages/WorkOrderDetail.tsx` |
| `PUT /api/app-updates/policy` | Deferred mobile/update surface | — | — |
| `PUT /api/auth/me/preferences` | Desktop caller found | `apiUpdateMyPreferences` (`src/lib/api.ts:151`) | `src/components/layout/Header.tsx` |
| `PUT /api/system/microsoft-graph-settings` | Desktop caller found | `apiUpdateMicrosoftGraphSettings` (`src/lib/api.ts:2221`) | `src/pages/SettingsNotifications.tsx` |
| `PUT /api/system/pm-settings` | No desktop caller found | — | — |
| `PUT /api/system/snipeit-settings` | Desktop caller found | `apiUpdateSnipeItSettings` (`src/lib/api.ts:2203`) | `src/pages/SystemSettings.tsx` |
| `PUT /api/system/ui-settings/assets` | Desktop caller found | `apiUpdateAssetsUiSettings` (`src/lib/api.ts:2083`) | `src/pages/SettingsCategories.tsx` |
| `PUT /api/system/ui-settings/label-designer` | Desktop caller found | `apiUpdateLabelDesignerUiSettings` (`src/lib/api.ts:2121`) | `src/pages/LabelDesigner.tsx` |
| `PUT /api/system/whatsapp-settings` | Desktop caller found | `apiUpdateWhatsAppSettings` (`src/lib/api.ts:2228`) | `src/pages/SettingsNotifications.tsx` |
| `PUT /api/templates/{templateId}` | Desktop caller found | `apiUpdateTemplate` (`src/lib/api.ts:1670`) | `src/pages/Templates.tsx` |

## Q-12 through Q-15 source findings

- Q-12: `backend/src/jobs/snipeSync.ts` imports `/hardware` into assets using upstream category/location mappings. It does not create facility relationships or an AC/panel filter. Preserve the approved boundary: no new mapping or filtering without a product decision; no upstream inventory was queried.
- Q-13: broken-asset cancellation remains implemented under AF-01; repaired regression tests retain the expected `ASSET_BROKEN` rejection.
- Q-14/Q-15: the user confirmed site and active template at activation, and cancellation of unstarted PM on disable/archive. Implemented across individual, bulk and clone paths, with generation/reopen guards. See [verification](verification-q14-q15.md).
- Facility partial updates preserve omitted fields; explicit template clearing is allowed only when effective PM is disabled.

## Contract follow-up

All 37 desktop-referenced operations in the historical table above now have contracts: 15 core operations and 22 system/device operations. Coverage is 127/141; the remaining 14 operations have no static desktop caller or belong to deferred mobile surfaces. See [contract verification](verification-q01-desktop.md).

The task/work-order deletion boundary is now implemented and locally verified: PM-only generic deletion, complete owned-row cleanup, atomic audit and explicit conflicts for incoming history/recurrence references. See [deletion verification](verification-task-deletion.md). Q-01 still retains the 14 remaining contracts and live database/storage/provider acceptance; Q-12 mapping is deferred by user decision on 2026-09-27.

## Q-12 follow-up source inspection — 2026-09-27

Rechecked `snipeSync.ts`: `/categories`, `/locations` and `/hardware` are imported; category/site IDs are resolved before asset upsert, followed by missing-asset archival. There is no facility lookup, asset-to-facility link or AC/panel-specific filtering. Asset and facility routes do not expose such a relationship; task context remains exactly one asset or one facility.

The user confirmed deferral on 2026-09-27. Retain current synchronization; do not implement asset-to-facility mapping or new category filters. Q-12 is deferred rather than implemented and is no longer a current D1 blocker. No upstream inventory query, synchronization job, mapping or filter change was performed in this follow-up.
