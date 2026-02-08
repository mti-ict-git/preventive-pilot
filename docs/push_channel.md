
# Push Notifications Plan (Web + Mobile)

## Goal
Create a Push notification channel in the web Notification menu, support broadcast announcements, and deliver role-based + time-based notifications for PM tasks.

## Scope Summary
- Add Push as a Notification Channel type in web UI.
- Add Broadcast Announcement UI in Notifications menu.
- Add backend endpoints for push broadcast and role-based sends.
- Add rule templates for assignment, revise, reject, approvals, due today, overdue.
- Ensure push delivery uses existing device tokens (pm.Devices).

## UX Flow (High-Level)
1. Admin opens Notifications page.
2. Admin sees Channels (Mail, WhatsApp, Push).
3. Admin can enable Push channel and run a quick Push Test.
4. Admin can open a Broadcast dialog and send to all devices or by role.
5. Rule-based notifications run automatically (assignment, approvals, due, overdue).

## Placement in UI
- Use existing Notifications page.
- Add Push channel card alongside Mail and WhatsApp in Channels section.
- Add a Broadcast button in the top action row near “Run Now” and “Push Test”.

## Wireframe Descriptions (Web)
### Notifications Page
- **Header**: Title + action row (Run Now, Push Test, Broadcast, Send Test Email, Settings).
- **Channels Grid**: Cards for Mail, WhatsApp, Push.
- **Push Card**: Active badge, toggle, Test button, small helper text.
- **Broadcast Dialog**: Title, Message, Audience selector (All, Technician, Supervisor, Superadmin), Send button.

### Notifications Log
- Filter by channel type including Push.
- Show broadcast entries distinctly (badge: Broadcast).

## Component Tree (Web: Shadcn UI + Tailwind)
- NotificationsPage
  - Header
  - ActionRow
    - RunNowButton
    - PushTestButton
    - PushBroadcastButton
  - ChannelsGrid
    - ChannelCard (Mail)
    - ChannelCard (WhatsApp)
    - ChannelCard (Push)
  - RuleList
    - RuleEditorDialog
  - NotificationLogTable

## Component Tree (Mobile: React Native Paper/Tamagui)
- NotificationsPage
  - SegmentedTabs (Rules, Channels, Log)
  - ChannelList
    - ChannelItem (Push)
  - RuleList
  - LogList
  - BroadcastDialog (admin only)

## Responsive Layout (Web)
```tsx
<div className="grid grid-cols-12 gap-4">
  <div className="col-span-12 md:col-span-6 lg:col-span-4">Push Card</div>
  <div className="col-span-12 md:col-span-6 lg:col-span-4">Mail Card</div>
  <div className="col-span-12 md:col-span-6 lg:col-span-4">WhatsApp Card</div>
</div>
```

## Accessibility (WCAG 2.1)
- Buttons have visible focus state.
- Status is shown with text + color.
- Dialogs trap focus and restore on close.
- Contrast >= 4.5:1 for all text.

## Notification Templates
### Immediate Events
- task_assigned (Technician)
  - Title: Task Assigned
  - Body: You have been assigned {{taskNumber}} ({{assetName}}). Due {{dueAt}}.

- task_revised (Technician)
  - Title: Task Revised
  - Body: {{taskNumber}} was revised. Please review the latest checklist and notes.

- task_rejected (Technician)
  - Title: Task Rejected
  - Body: {{taskNumber}} was rejected. Reason: {{rejectionReason}}.

- task_submitted_for_approval (Supervisor)
  - Title: Approval Needed
  - Body: {{taskNumber}} is waiting for your review.

- task_pending_superadmin (Superadmin)
  - Title: Final Approval Needed
  - Body: {{taskNumber}} is ready for superadmin approval.

### Time-Based Events
- task_due_today (Assignee)
  - Title: Task Due Today
  - Body: {{taskNumber}} is due today. Please complete by end of day.

- task_overdue (Assignee)
  - Title: Task Overdue
  - Body: {{taskNumber}} is overdue since {{dueAt}}. Please complete ASAP.

## Roles and Audiences
- Technician: assignment, revise, reject, due/overdue.
- Supervisor: approval review.
- Superadmin: final approval review.
- Broadcast: all devices or by role (Technician/Supervisor/Superadmin).

## Phase Plan (Step-by-Step)

### Phase 1 — Data + API Foundations
1. Verify device tokens source
   - Locate backend devices router at [devices.ts](file:///Users/widjis/Documents/Projects/Preventive%20Maintenance/preventive-pilot/backend/src/routes/devices.ts).
   - Confirm existing registration uses pm.Devices table with fields: DeviceId, UserId, Token, Platform, IsActive.
   - If pm.Devices does not exist, add migration SQL at [schema.sql](file:///Users/widjis/Documents/Projects/Preventive%20Maintenance/preventive-pilot/backend/db/schema.sql) with create table and indexes on UserId and IsActive.
   - Ensure API stores platform values from Capacitor: "ios" | "android" | "web".
2. Define request model and validation
   - Add PushBroadcastSchema using zod in [schemas.ts](file:///Users/widjis/Documents/Projects/Preventive%20Maintenance/preventive-pilot/backend/src/schemas/schemas.ts) with fields: title (string, min 1, max 120), body (string, min 1, max 2000), audience (enum: all | technician | supervisor | superadmin).
   - Export TypeScript type PushBroadcastRequest for strong typing.
3. Implement endpoint
   - In [devices.ts](file:///Users/widjis/Documents/Projects/Preventive%20Maintenance/preventive-pilot/backend/src/routes/devices.ts), add POST /api/devices/push-broadcast guarded by requireAnyRole(["Superadmin", "Admin"]).
   - Parse and validate req.body with PushBroadcastSchema; on failure return 400 { code: "invalid_request", issues }.
   - Normalize audience to lowercase and default to "all" when missing.
4. Query audience tokens
   - For audience "all": SELECT Token, Platform FROM pm.Devices WHERE IsActive = 1.
   - For role audiences: SELECT d.Token, d.Platform FROM pm.Devices d JOIN pm.Users u ON u.UserId = d.UserId JOIN pm.UserRoles ur ON ur.UserId = u.UserId JOIN pm.Roles r ON r.RoleId = ur.RoleId WHERE d.IsActive = 1 AND LOWER(r.RoleName) = @role.
   - Bind parameter @role using lowercase of audience, and protect against SQL injection with parameterized queries.
   - If recordset empty: return 400 { code: "no_tokens", message: "No device tokens registered" }.
5. Send push messages
   - Import sendPush helper from [push.ts](file:///Users/widjis/Documents/Projects/Preventive%20Maintenance/preventive-pilot/backend/src/services/push.ts) or create it if missing.
   - Iterate tokens and call sendPush({ token, title, body, data: { kind: "broadcast" } }).
   - Collect per-token results: success boolean, error message if any.
6. Response structure and logging
   - Return 200 { ok: true, attempted, sent, failed, errors: Array<{ token, error }> }.
   - Log summary with attempted/sent/failed at info level and individual failures at warn level.
7. Environment configuration
   - Ensure Firebase Admin initialization reads FIREBASE_SERVICE_ACCOUNT_PATH.
   - In docker-compose, mount host path to /app/firebase-adminsdk.json and set FIREBASE_SERVICE_ACCOUNT_PATH=/app/firebase-adminsdk.json.
   - For local dev, allow default path ./firebase-adminsdk.json when env missing, with safe error message if file not found.
8. Acceptance criteria
   - Authenticated Admin calls POST /api/devices/push-broadcast and receives sent>0 when tokens exist.
   - Returns no_tokens when none exist.
   - Typecheck passes and endpoint appears in OpenAPI if project exposes it.

### Phase 2 — Web UI: Push Channel Card
1. Placement
   - Open Notifications page component at [NotificationsPage.tsx](file:///Users/widjis/Documents/Projects/Preventive%20Maintenance/preventive-pilot/frontend/src/pages/NotificationsPage.tsx).
   - In ChannelsGrid, add PushChannelCard using Shadcn UI components: Card, Button, Badge.
2. State and props
   - Wire active state from server config: GET /api/settings/notifications or existing settings store.
   - Implement onToggle to call PATCH /api/settings/notifications { pushEnabled } and optimistic update.
3. Test button
   - Implement onTest to call POST /api/devices/push-test { title, body } using currently logged-in user’s device token.
   - Show toast success or error using [useToast](file:///Users/widjis/Documents/Projects/Preventive%20Maintenance/preventive-pilot/frontend/src/components/ui/use-toast.ts).
4. Accessibility and layout
   - Ensure buttons have focus ring classes and aria-pressed for toggle.
   - Place card in grid with className "col-span-12 md:col-span-6 lg:col-span-4".
5. Acceptance criteria
   - Card renders alongside Mail and WhatsApp.
   - Toggle persists and reflects server state.
   - Test button executes and shows result.

### Phase 3 — Web UI: Broadcast Dialog
1. Trigger and dialog
   - In ActionRow, add PushBroadcastButton opening Dialog.
   - Use Shadcn Dialog, Input for title, Textarea for message, Select for audience.
2. Form validation
   - Client-side length checks: title 1–120, message 1–2000.
   - Disable submit until valid; show helper error text.
3. Submit and API call
   - POST to /api/devices/push-broadcast with JSON body.
   - Handle 200 -> toast with sent count, 400 -> show specific message for no_tokens or invalid_request.
4. Logging and UX
   - After success, optionally write an entry into NotificationLogTable via client cache update.
   - Reset form and close dialog.
5. Acceptance criteria
   - Admin can send broadcast to all or by role and gets a clear success or error toast.

### Phase 4 — Rule Templates and Mapping
1. Extend rule model
   - In rule types file [notificationRules.ts](file:///Users/widjis/Documents/Projects/Preventive%20Maintenance/preventive-pilot/frontend/src/models/notificationRules.ts), add Push channel option and default templates for events listed.
   - Add validator ensuring compatible audiences per role.
2. UI mapping
   - In RuleEditorDialog, add Channel Type select including Push.
   - When Push selected, show title/body fields with template preview and variables (taskNumber, assetName, dueAt, rejectionReason).
3. Backend handling
   - Extend server-side rule executor to route Push events to sendPush with correct audience.
   - Immediate events: trigger on task lifecycle transitions; time-based: integrate with scheduler.
4. Acceptance criteria
   - Rules can be configured with Push channel and save correctly.
   - Preview renders with variable placeholders.

### Phase 5 — Scheduler + Immediate Events
1. Scheduler integration
   - Locate existing scheduler job at [jobs/notifications.ts](file:///Users/widjis/Documents/Projects/Preventive%20Maintenance/preventive-pilot/backend/src/jobs/notifications.ts).
   - Add queries to detect tasks due today and overdue, mapped to Push templates.
   - For each task, resolve assignee’s device tokens and sendPush with template data.
2. Immediate events
   - Hook into task service at [tasks.ts](file:///Users/widjis/Documents/Projects/Preventive%20Maintenance/preventive-pilot/backend/src/services/tasks.ts) to emit events on assignment, revise, reject, submit for approval, pending superadmin.
   - Implement event dispatcher that checks configured channels and sends Push accordingly.
3. Role routing
   - Supervisor approval: resolve supervisor user from task context and fetch devices.
   - Superadmin approval: filter by role "superadmin" across org.
4. Observability
   - Add logs and metrics counters: push_sent_total, push_failed_total.
   - Add NotificationLog persistence if feature exists; else skip.
5. Acceptance criteria
   - Time-based jobs send expected pushes.
   - Immediate events produce pushes to correct roles.

### Phase 6 — QA and Rollout
1. Test matrix
   - Devices: iOS, Android, Web PWA if applicable.
   - Roles: Technician, Supervisor, Superadmin.
   - Cases: assignment, revise, reject, submit for approval, pending superadmin, due today, overdue, broadcast-all, broadcast-role.
2. Fixtures and data
   - Seed test users with roles and register device tokens.
   - Use known tasks with due dates to exercise scheduler.
3. Validation steps
   - Run broadcast dialog and confirm receipt on target devices.
   - Toggle Push channel active state and confirm effects.
   - Review logs and metrics for sent/failed counts.
4. Deployment checklist
   - Ensure FIREBASE_SERVICE_ACCOUNT_HOST_PATH mounted in docker-compose for production.
   - Confirm env var FIREBASE_SERVICE_ACCOUNT_PATH points to /app/firebase-adminsdk.json in container.
   - Run npm run dev:full locally and smoke test UI + API.
5. Acceptance criteria
   - All test cases pass end-to-end on real devices.
   - Production containers have correct mounts and envs.

## Sample Web UI (Push Card)
```tsx
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type PushCardProps = {
  active: boolean;
  onToggle: () => void;
  onTest: () => void;
};

export function PushChannelCard({ active, onToggle, onTest }: PushCardProps) {
  return (
    <Card className="border-border">
      <CardHeader className="flex items-center justify-between">
        <CardTitle>Push</CardTitle>
        <Badge variant={active ? "default" : "secondary"}>{active ? "Active" : "Inactive"}</Badge>
      </CardHeader>
      <CardContent className="flex items-center gap-2">
        <Button variant="outline" onClick={onToggle}>{active ? "Disable" : "Enable"}</Button>
        <Button variant="outline" onClick={onTest}>Test</Button>
      </CardContent>
    </Card>
  );
}
```

## Sample Mobile UI (Push Card)
```tsx
import { Button, Card, Text } from "react-native-paper";

type Props = { active: boolean; onToggle: () => void; onTest: () => void };

export function PushChannelItem({ active, onToggle, onTest }: Props) {
  return (
    <Card>
      <Card.Title title="Push" right={() => <Text>{active ? "Active" : "Inactive"}</Text>} />
      <Card.Content>
        <Button mode="contained" onPress={onToggle}>{active ? "Disable" : "Enable"}</Button>
        <Button mode="outlined" onPress={onTest}>Test</Button>
      </Card.Content>
    </Card>
  );
}
```

## Backend Endpoint Sketch
```ts
devicesRouter.post("/push-broadcast", requireAnyRole(["Superadmin", "Admin"]), async (req, res) => {
  const parsed = PushTestSchema.safeParse(req.body ?? undefined);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const audienceRaw = typeof req.body?.audience === "string" ? req.body.audience : "all";
  const audience = ["all", "technician", "supervisor", "superadmin"].includes(audienceRaw) ? audienceRaw : "all";

  const title = parsed.data?.title ?? "Announcement";
  const body = parsed.data?.body ?? "";

  const db = await getDb();
  const tokensResult = await db.request().query(
    audience === "all"
      ? "SELECT Token AS Token, Platform AS Platform FROM pm.Devices WHERE IsActive = 1"
      : "SELECT d.Token AS Token, d.Platform AS Platform FROM pm.Devices d JOIN pm.Users u ON u.UserId = d.UserId JOIN pm.UserRoles ur ON ur.UserId = u.UserId JOIN pm.Roles r ON r.RoleId = ur.RoleId WHERE d.IsActive = 1 AND LOWER(r.RoleName) = @role"
  );

  const tokens = tokensResult.recordset as Array<{ Token: string; Platform: string }>;
  if (tokens.length === 0) {
    res.status(400).json({ message: "No device tokens registered" });
    return;
  }

  for (const row of tokens) {
    await sendPush({ token: row.Token, title, body, data: { kind: "broadcast" } });
  }

  res.json({ ok: true, attempted: tokens.length, sent: tokens.length });
});
```

## Decisions Confirmed
- Broadcast push should support all devices and by-role audiences.
- Push channel is placed alongside Mail and WhatsApp in Notifications menu.
- Templates defined above are the defaults.
