# APK Publish (PM Tech) — Upload + Manifest Update (secure_apk)

This project uses the `mobile/secure_apk` stack to host APKs under `/apk/*` and provides an authenticated upload API that:

- Stores the uploaded APK into the share directory
- Updates `manifest.json` so clients can discover the latest version

## Prerequisites

- A running `secure_apk` deployment reachable at:
  - `https://store.justanapi.my.id` (recommended), or
  - `http://<host>:9103` (local/LAN without TLS)
- A valid upload token set in the server `.env`:
  - `SECURE_APK_UPLOAD_TOKEN=<your-random-token>`

## Option A (Recommended): Use the repo script

The repo includes a script that:

- Reads the current app version from `mobile/pm-tech/package.json`
- Chooses an APK file (debug by default, release if configured)
- Uploads it to `secure_apk` via `POST /api/upload`
- Ensures `manifest.json` includes the uploaded file

### 1) Build the APK

Build using Capacitor / Android Studio (release recommended for production).

If you want the script to pick a release build automatically, build a release APK to:

- `mobile/pm-tech/android/app/build/outputs/apk/release/app-release.apk`

### 2) Upload and update manifest

From repo root:

```bash
export SECURE_APK_BASE_URL=https://store.justanapi.my.id
export SECURE_APK_UPLOAD_TOKEN=<your-token>

npm run push:android
```

Optional overrides:

```bash
export APK_PATH=/absolute/path/to/app-release.apk
export ANDROID_BUILD_VARIANT=release

npm run push:android
```

### 3) Verify

```bash
curl -i https://store.justanapi.my.id/apk/manifest.json
curl -I https://store.justanapi.my.id/apk/pm-tech_v<version>.apk
```

## Option B: Upload directly using curl

This does the same upload as the script.

```bash
curl -i \
  -H "Authorization: Bearer $SECURE_APK_UPLOAD_TOKEN" \
  -F "file=@/absolute/path/to/app-release.apk;type=application/vnd.android.package-archive" \
  "https://store.justanapi.my.id/api/upload"
```

Expected success response includes the stored filename and manifest entry count.

## Filename + Manifest format

- Filename convention: `pm-tech_v<semver>.apk` (example: `pm-tech_v1.3.0.apk`)
- Manifest endpoint: `GET /apk/manifest.json`

Supported manifest shapes:

```json
["pm-tech_v1.3.0.apk"]
```

or

```json
{
  "files": [
    { "fileName": "pm-tech_v1.3.0.apk", "sizeBytes": 123, "sha256": "..." }
  ]
}
```

The upload API updates the manifest automatically after a successful upload.

## Backend (API) integration check

The mobile app does not download directly from the store. It calls the backend update endpoints:

- `GET /api/app-updates/latest?appId=pm-tech` → returns `latest.downloadUrl`
- `GET /api/app-updates/download?token=...` → redirects to `https://store.justanapi.my.id/apk/<file>.apk`

Make sure backend env is configured:

- `APP_UPDATE_SIGNING_SECRET=<strong-secret>`
- `APP_UPDATE_STORE_BASE_URL=https://store.justanapi.my.id`

## Security notes

- Treat `SECURE_APK_UPLOAD_TOKEN` as a secret (do not commit it, do not paste to logs).
- Rotate the token if it is exposed.
