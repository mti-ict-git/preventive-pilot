# APK Publication and Updates

Last reviewed: 2026-09-10. Status: source-derived component inventory; an end-to-end publication procedure is not verified.

## Current components

| Component | Observed behavior |
| --- | --- |
| Local `mobile/pm-tech` | React/Capacitor source; `build:android` runs Vite build and Capacitor sync, not APK compilation/signing |
| Backend `backend/src/routes/appUpdates.ts` | App update metadata/policy, installation reporting, and signed download URLs from configured storage |
| Local `mobile/secure-apk` | Read-only Nginx share hosting, default host port 5057, `/version.json`, and `/apk/` |

The static host uses a CIFS volume and an external Docker network named `internal`. It does not implement an authenticated upload API in the supplied configuration.

## Superseded publication claims

The [previous guide](archive/apk-publish-before-baseline.md) references `mobile/secure_apk`, an upload API, `manifest.json`, port 9103, and `npm run push:android`. These do not match the supplied static stack and package scripts. Do not run that guide as the current release procedure.

## Build preparation

1. Establish the authoritative mobile source/version (Q-06).
2. Configure the intended API URL and application version.
3. Build the web bundle and sync the existing Android project with `npm run build:android` from `mobile/pm-tech`.
4. Compile/sign the native APK with the project's verified Android toolchain and signing configuration.
5. Record artifact version, hash, build revision, and signing identity without exposing signing secrets.

The native signing/version-code policy and publication target must be established before documenting an executable upload command.

## Publication decision needed — Q-07

Confirm whether the supported deployment uses the backend signed-download mechanism, the separate static host, or another managed uploader. Define the metadata format, directory layout, authentication, upload mechanism, version compatibility, rollback behavior, and responsible operator.

For the backend mechanism, inspect `APP_UPDATE_STORAGE_ROOT`, `APP_UPDATE_CONFIG_JSON`, `APP_UPDATE_SIGNING_SECRET`, and token lifetime settings. For the static host, verify the mounted share, `/version.json`, APK paths, TLS, and network availability. Do not treat their metadata formats as interchangeable.

## Acceptance before release

Install on a test device; verify update detection, version comparison, download integrity, expired signed URLs where applicable, installation compatibility, interrupted download behavior, and rollback/recovery expectations. Record evidence in D2/D3 of the [roadmap](implementation-roadmap.md).

No APK was built, uploaded, or published as part of D0.
