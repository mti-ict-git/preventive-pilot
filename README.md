# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev

# (Optional) Start frontend + backend together
npm run dev:full
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## Database schema (SQL Server)

This repo includes an idempotent SQL Server schema script at `db/schema.sql` and a runner that reads database connection settings from `.env`.
Schema includes a centralized due-date calculation function `pm.fn_CalculateNextDueAt` used by scheduling queries.

Run:

```sh
npm run db:apply-schema
```

Required environment variables:

- `DB_SERVER`
- `DB_DATABASE`
- `DB_USER`
- `DB_PASSWORD`
- `DB_PORT`
- `DB_ENCRYPT`
- `DB_TRUST_SERVER_CERTIFICATE`

## Backend auth

- Start backend (from repo root): `npm run dev:full` or `npm --prefix backend run dev`
- Backend base URL: `http://localhost:3001`
- Configure frontend API base URL with `VITE_API_BASE_URL` (defaults to same-origin in production, `http://localhost:3001` in dev)

### Mobile auth (pm-tech)

- Mobile app at `mobile/pm-tech` uses an AuthProvider and calls `/api/auth/login` and `/api/auth/refresh`.
- Set `VITE_API_BASE_URL` in `mobile/pm-tech/.env.local` (e.g., `http://localhost:3001`).
- Login supports `provider: ldap|local`.
- Run mobile dev with `npm run dev` inside `mobile/pm-tech`.

### Mobile API client and models

- Shared helpers: `apiGet(path)`, `apiPost(path, body)` with normalized `ApiError`.
- Types aligned to backend: `Asset`, `TaskListItem`, `TaskDetail`, `WorkOrderListItem`, `WorkOrderDetail`.
- 401 auto-refresh and retry are handled in the client.

### Mobile PM Tasks

- Tasks list loads `/api/tasks?assigned=me` with status filters.
- Detail page loads `/api/tasks/{taskId}` and shows checklist.
- Lifecycle actions wired: start, pause, resume, complete.

## Snipe-IT asset sync

- Assets are synced from Snipe-IT hardware into `pm.Assets`.
- `AssetStatus` stores the raw Snipe-IT status label name.
- `AssetOperationalStatus` is normalized for PM decisions: `operational`, `broken`, `archived`.
- If an asset disappears from Snipe-IT (deleted), the next sync archives it in PM (`IsArchived=1`, `AssetOperationalStatus=archived`) to preserve history.
- When available, the Snipe-IT hardware image is synced into `pm.Assets.ImageUrl` and the binary is stored in `pm.Assets.ImageData` (with `ImageContentType` and `ImageFileName`) for durable storage, while `imageUrl` is exposed on the Assets APIs and Asset Detail page preview. The backend also exposes `GET /api/assets/{assetId}/image` to stream the stored image binary.

## Evidence attachments

- Configure server-side file storage with `EVIDENCE_STORAGE_ROOT`.
- Evidence uploads are stored under the existing `Qx YYYY` folder structure.
- Max upload size is 50MB per file.
- Evidence upload/delete is blocked during approval states for non-superadmins.
- Attachments can be viewed, downloaded, deleted, and replaced from Task Detail.
- File uploads occur immediately when a user selects a file to attach.

### Checklist attachment behavior

- Each template checklist item now has two attachment flags:
  - **Enable Attachment** – shows the Attach file control for that item in Task Detail.
  - **Attachment Required** – when enabled attachment is on, requires at least one file before completion.
- Mandatory checklist items cannot be skipped and must have a non-skip outcome with notes.
- If attachment is enabled but not required, technicians can complete the item without uploading evidence.

## Task actions (web)

- Task Detail dialog supports Start, Pause, Cancel, and Complete.
- Start moves task to In Progress; Pause sets task to Paused.
- Cancel records CancelledBy and timestamp; Complete enforces checklist rules.
- PM Task Detail includes a Create Work Order action to report breakdowns; it opens a dialog pre-filled with the task's asset or facility context.
- PM Tasks list includes a Calendar View button that navigates directly to the PM Scheduling calendar for capacity-aware planning.
- PM Tasks list Filters dialog supports Assigned (any/me/unassigned), Approved only toggle, Due date range, and Status (All, Upcoming, In Progress, Due Today, Overdue, Completed, Cancelled) filters.
 - PM Tasks list supports sorting by due date (soonest/latest first) and created date (latest/oldest submitted) so supervisors can quickly focus on recent completions or upcoming work.
 - Supervisors and above can assign/reassign PM tasks and pick technicians using a restricted user list that does not expose full user administration.

## PM Task Approval

- Technicians complete and submit PM tasks for approval; supervisors review; superadmins finalize approval.
- Task Detail shows Approval Status with badges and an Approval Trail (technician, supervisor, superadmin).
- Revise records a correction note and can optionally reopen the task for technician edits.
- Rejection records reason, who rejected, and timestamp; Task Detail displays a Rejected block with this metadata.
- PDF export for a PM task includes sign-off sections labeled "Submitted By (Technician)", "Reviewed By (Supervisor)", and "Approved By (Superadmin)", with names and dates.
 - Approvals Inbox at `/approvals` provides tabs for **Pending Supervisor** and **Pending Superadmin** with inline Approve/Reject actions; supervisors can perform bulk approve on the supervisor tab.

## Corrective Maintenance (CM) Work Orders

- Dedicated API mounted at `/api/work-orders` for CM tasks.
- Endpoints include create, list, detail, assign, start/pause/resume, complete, cancel, and close-downtime.
- Work orders reuse PM templates/checklists and permission model (technician vs manager roles).
- OpenAPI docs available at `/api/docs` include all Work Orders schemas and paths.

### Web UI

- Work Orders page at `/work-orders` with filters for status, impact, assigned, location, category, and reported date range.
- Work Order detail view at `/work-orders/:taskId`, reachable by clicking a row or the View button.
- Work Order detail includes reported by/channel and downtime tracking with Close Downtime action.
- Asset Detail and Facility Detail include a **Report Breakdown** dialog to create a new work order with symptom, impact level, optional failure category/code, optional downtime start, and reported channel.
- PM Task Detail provides a **Create Work Order** button for cross-flow from PM to CM when issues are found during inspection.
- Work Orders behave like a lightweight ticket queue: each row shows a Subject combining asset or facility context with the reported symptom, and Work Order detail adds a Resolution section summarizing completed or cancelled work and notes.

### Field-Ready mobile

- Home screen includes a **Report Breakdown** quick action that opens a unified bottom sheet.
- Technicians can choose whether they are reporting against an asset or a facility, then search and select the specific context.
- Asset Detail screen includes a **Corrective Maintenance** card whose Report button opens the same sheet with the current asset pre-selected.
- Breakdown form collects symptom, impact level, optional failure category/code, optional downtime start, and reported channel, then creates a CM Work Order and navigates to its detail view.

### PM Tech mobile

- Work Orders tab lists CM work orders with status tabs and search.
- Work Order detail supports checklist completion, evidence upload, and CM lifecycle actions.
- Asset Detail Breakdown button opens a report form that creates CM work orders.
- Supervisors and above can assign or reassign PM tasks and work orders to technicians.
- PM Tasks tabs show status count badges.
- PM Tech mobile prefers ngrok discovery for API base and falls back to direct backend on timeout.
- Home recent tasks show asset thumbnails when image URLs are available.
- Home highlights overdue tasks with an attention banner and resolve action.
- Asset Detail displays real asset images when available.
- Asset Detail shows asset notes and Assets list previews notes when available.
- Android back button navigates to the previous in-app screen before exiting.
- Profile & Settings shows authenticated user info and local preferences for theme and notifications.

### Backdated completion (supervisor+)

- Supervisors and above can optionally backdate task completion from the Task Detail dialog.
- When enabled, they must provide a past completion date/time and a reason for backdating.
- Backdated completions update PM history and next-due scheduling using the chosen completion date, while the system still records when the entry was made.

## Reports and CM metrics

- Reports page shows compliance summary, overdue tasks, system logs, and assets without PM.
- A maintenance type filter (PM, CM, PM+CM) applies to compliance and overdue reports.
- Corrective Maintenance metrics widget shows breakdowns by category, location, failure category, and impact level.
- CM metrics also include MTTR (reported-to-complete) by category and location, plus monthly incident counts.
- All report cards include CSV export actions for offline analysis.

## Scheduling

- Open PM Scheduling to view calendar counts and select a day to see tasks.
- Calendar/day views include projected upcoming PM occurrences when tasks have not been generated yet.
- Asset Detail  Schedule tab shows upcoming scheduled + projected occurrences (blackout-aware).
 - The global schedule calculation job only generates new PM tasks for assets whose `AssetOperationalStatus` is not `broken` or `archived`, so broken assets are automatically excluded from new PM schedules.
 - When a schedule row in `pm.PMSchedules` or `pm.FacilityPMSchedules` has `Frozen = 1`, both the background schedule job and the manual Recalculate action skip creating new tasks and skip updating `NextPMDueAt` for that asset or facility until it is unfrozen.
 - Calendar and day APIs still return existing PM tasks for frozen schedules, but they no longer project new occurrences for broken assets or frozen schedule rows; only non-frozen, operational assets/facilities contribute projected events.
 - The day API now includes an `estimatedMinutes` field per item, derived from the linked PM template `EstimatedDurationMinutes` with a 60-minute fallback when the template duration is null, so the UI can show total minutes for the selected date.
 - The calendar API now returns `capacityMinutes` per date alongside the existing scheduled/due/overdue counts, using the same `EstimatedDurationMinutes` + 60-minute fallback rules as the day API so the UI can render utilization states per day.
 - The PM Scheduling calendar overlays each day with a capacity badge showing total estimated minutes versus an 8-hour default threshold, with color-coded states for within, near, and over capacity.
 - The selected day view includes a capacity summary card displaying used versus threshold minutes for that date, alongside each task's estimated duration.

### Phase 1 PM backend validation

- Asset PM settings enforce template category matching when `template.applicableCategoryId` is set.
- PM Now is idempotent for assets and facilities and returns the existing task id when a duplicate is attempted.
- When no assignment rule matches, PM tasks fall back to the template's required role for assignment.
- Core PM endpoints use a unified 4xx error shape `{ message, code, details[] }` and are documented under `/api/docs`.

### Asset-level PM: "PM Now" and schedule recalc

- Open an Asset and use the PM section to enable PM and choose a template.
- Managers can use the **PM Now** button on Asset Detail to create a new PM task that is due immediately for the asset's default template, then complete the checklist and attach evidence directly from the asset page. This works even if there is no task currently due.
- PM Now is idempotent within a configurable window (env `PM_NOW_IDEMPOTENCY_WINDOW_MINUTES` with system setting override).
- After completing PM Now, the system automatically recalculates the next PM date for that asset using the same scheduling engine as the global Recalculate/Force Recalculate actions on the Scheduling page.

## Facilities

- Open Facilities to manage non-asset areas and their PM defaults.
- Use **Create Facility** to add new facilities with name and location.
- Click **Details** on a facility row to edit its name, location, and description, and to manage PM settings.
- Select multiple facilities to run bulk PM actions (enable, disable, set template) or **Archive Facilities** to soft-delete them from the active list while keeping history.
 - Use **Clone** to duplicate a facility; optionally copy PM settings.
 - Facility PM defaults participate in the same schedule calculation job as assets: the job creates facility PM tasks up to the configured horizon, and keeps `pm.FacilityPMSchedules` and `pm.FacilityPMSettings` in sync with the latest calculated next-due dates.

## PM Templates checklist editor

- Open PM Templates and create or edit a template to configure its checklist.
- Use the drag handle next to each checklist item to reorder items via drag-and-drop.
- The order you set in the checklist editor is saved and used when technicians complete PM tasks.

## Microsoft Graph notifications

- Configure in Settings → Notification Settings → Microsoft Graph.
- Use Test Connection with the Send test email toggle to verify delivery.

### Notification rules and templates

- Configure notification channels and rules from the Notifications page.
- Reminder and escalation rules are time-based (due/due-today/overdue), while immediate rules fire on lifecycle transitions:
  - `task_assigned` when a task is assigned or reassigned to a technician
  - `task_submitted_for_approval` when a technician submits a PM task for approval
  - `task_pending_superadmin` when a supervisor approves and escalates to superadmin approval
  - `task_revised` when an approval is revised back to the technician
  - `task_approved` when a supervisor or superadmin approves a PM task
  - `task_rejected` when a supervisor or superadmin rejects a PM task
- Push broadcast is available via `POST /api/devices/push-broadcast` for Admin/Superadmin announcements.
- Admin/Superadmin can also send a push broadcast from the Notifications page via the Broadcast dialog.
- Notifications page includes a Push channel card to enable/disable push and run push tests.
- Existing reminder and escalation rules can be edited from the Notifications page using the pencil icon next to each rule.
- Reminder rules send Microsoft Graph emails (and optional WhatsApp messages) primarily to the task's assigned technician; if a task is unassigned or the technician has no email/phone, the system falls back to the rule's global recipients.
- Message templates support the following placeholders, which are replaced per task when notifications are sent:
  - `{{taskNumber}}`
  - `{{dueAt}}`
  - `{{assetName}}`
  - `{{templateName}}`
  - `{{technicianNumber}}` (the assigned technician's phone number when available)
  - `{{approvalStage}}` (`supervisor` or `superadmin` for approvals/rejections)
  - `{{approvedAt}}` and `{{approvedByName}}`
  - `{{rejectedAt}}`, `{{rejectionReason}}`, and `{{rejectedByName}}`
  - `{{revisionNote}}` (when an approval is revised)
  - `{{message}}` (the rendered per-rule message body)
- Notification Channel config is typed per channel and overrides global settings:
  - Mail: to, cc, bcc, senderEmail, subjectTemplate, bodyTemplate, mergeMode (override|append).
  - WhatsApp: target (single|group), number, groupId/groupName, mentionNumbers, baseUrlOverride.
  - Global Microsoft Graph and WhatsApp settings provide credentials and defaults; channel config customizes recipients and routing per audience.
  - Channels can be deleted from the Notifications page; deletion is blocked if rules or logs still reference the channel.

## Docker (web + api)

This repo ships a docker-compose setup that serves the frontend and proxies API requests via the same origin.

- Web: `http://localhost:9102`
- API (internal): `http://api:5056`
- API (from browser): `http://localhost:9102/api/...`

Run:

```sh
docker compose up --build
```

### SMB mount (PM folder)

Bind-mount (when the host mounts SMB itself):

```sh
PM_SHARE_HOST_PATH=/path/to/mounted/share docker compose -f docker-compose.yml -f docker-compose.bind.yml up --build
```

CIFS mount (Docker mounts SMB directly on Linux):

```sh
docker compose -f docker-compose.yml -f docker-compose.cifs.yml up --build
```

### Create a local superadmin (DB-backed)

```sh
npm --prefix backend run create-local-superadmin -- --username <user> --password <password>
```

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)

## Ngrok API gateway (mobile) with GitHub Gist discovery

- Start the backend locally and open a public tunnel:

```sh
ngrok http http://localhost:5056
```

- Run the gist watcher to publish the current public API base URL:

```sh
GITHUB_PAT=<token_with_gist_scope> \
NGROK_GIST_ID=<gist_id> \
NGROK_GIST_FILE=ngrok.json \
npm run ngrok:gist-watch
```

- The watcher polls the local ngrok API and updates the gist content to:

```json
{
  "apiBaseUrl": "https://<random>.ngrok.app",
  "updatedAt": "<ISO8601>"
}
```

- Mobile clients should fetch this gist (or its raw URL) on startup and periodically to discover the current API base, switching automatically when it changes.

### Dev shortcuts

- Run frontend + backend together:

```sh
npm run dev:full
```

- Run ngrok tunnel + gist watcher together (uses BACKEND_PORT or 3001):

```sh
GITHUB_PAT=<token_with_gist_scope> \
NGROK_GIST_ID=<gist_id> \
NGROK_GIST_FILE=ngrok.json \
npm run ngrok:full
```
