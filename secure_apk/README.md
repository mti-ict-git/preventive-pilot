# secure-apk

Nginx container that mounts the Windows SMB share (CIFS) and serves APK files.

Includes an optional uploader API that writes APK files and updates `manifest.json`.

## Required env

Create a `.env` file in this directory on the Linux host (do not commit it):

Use [./.env.example](file:///Users/widjis/Documents/Projects/Preventive%20Maintenance/preventive-pilot/mobile/secure_apk/.env.example) as a template.

- `DOMAIN_USERNAME=...`
- `DOMAIN_PASSWORD=...`
- `CIFS_DOMAIN=mbma`
- `CIFS_SHARE_PATH=//10.60.10.44/ict`
- `CIFS_PREFIX_PATH=Apps\040Standard/Android/Release/apk`
- `SECURE_APK_PORT=9103`

For uploads:

- `SECURE_APK_UPLOAD_TOKEN=...` (required for `/api/upload`)
- `SECURE_APK_ALLOWED_PREFIXES=pm-tech_v` (comma-separated)
- `SECURE_APK_UPLOAD_MAX_BYTES=419430400`

`CIFS_PREFIX_PATH` must escape spaces using `\040`.

## Run

```bash
docker compose down -v
docker compose up -d
```

If you change CIFS settings, you must recreate the Docker volume (`down -v`) because CIFS volume options are fixed at creation.

## Endpoints

- `GET /health`
- `GET /apk/manifest.json`
- `GET /apk/<file>.apk`

Uploader:

- `GET /api/health`
- `GET /api/manifest`
- `POST /api/upload` (multipart form-data, field name `file`, Bearer token)

## Upload

```bash
curl -X POST \
  -H "Authorization: Bearer $SECURE_APK_UPLOAD_TOKEN" \
  -F "file=@pm-tech_v1.0.1.apk" \
  http://<host>:${SECURE_APK_PORT}/api/upload
```

## Manifest format

Place `manifest.json` in the mounted folder root (same folder as the APK files). Supported formats:

```json
["pm-tech_v1.3.0.apk"]
```

or:

```json
{
  "files": [
    {
      "fileName": "pm-tech_v1.3.0.apk",
      "sizeBytes": 0,
      "sha256": "",
      "modifiedAt": "2026-02-14T00:00:00.000Z"
    }
  ]
}
```
