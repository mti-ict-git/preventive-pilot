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

## Evidence attachments

- Configure server-side file storage with `EVIDENCE_STORAGE_ROOT`.
- Evidence uploads are stored under the existing `Qx YYYY` folder structure.
- Max upload size is 50MB per file.

## Task actions (web)

- Task Detail dialog supports Start, Pause, Cancel, and Complete.
- Start moves task to In Progress; Pause sets task to Paused.
- Cancel records CancelledBy and timestamp; Complete enforces checklist rules.

## Scheduling

- Open PM Scheduling to view calendar counts and select a day to see tasks.
- Calendar/day views include projected upcoming PM occurrences when tasks have not been generated yet.
- Asset Detail → Schedule tab shows upcoming scheduled + projected occurrences (blackout-aware).

### Asset-level PM schedule recalc

- Open an Asset and use the PM section to enable PM and choose a template.
- Managers can use the Recalculate PM button on Asset Detail to force recomputation of the next PM date for that asset.
- This uses the same scheduling engine as the global Recalculate/Force Recalculate actions on the Scheduling page.

## Microsoft Graph notifications

- Configure in Settings → Notification Settings → Microsoft Graph.
- Use Test Connection with the Send test email toggle to verify delivery.

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
