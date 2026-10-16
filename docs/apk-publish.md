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


## Local debug APK verification - 2026-10-08

User requested an APK from current local session/task corrections. Web Vite build and Capacitor Android sync passed. Gradle assembleDebug passed (197 executed tasks) with Microsoft OpenJDK 17.0.20.1 and Gradle 8.2.1. Windows Java pipe initialization failed with the normal temporary path; setting both jdk.net.unixdomain.tmpdir and java.io.tmpdir to C:/Scripts/Projects/snipeit-project/.apk-build-tmp resolved it. No security settings were weakened or system Java replaced.

Artifact: mobile/pm-tech/artifacts/MTI-Mobile-PM-1.0.0-debug-20261008.apk, 20970662 bytes. SHA-256: c4a9120015f379ff74288706859332591c53744ac285871a146ef5afc28c8a2c. Package com.merdekatsingshan.pmtech, versionName 1.0.0, versionCode 2, min SDK22, target34. Existing version values were retained. apksigner verified v1/v2 signing with Android Debug certificate SHA-256 7dc12d1f39db323946cb4bf47d671913f1926db82093dfbb9fd7fda1e57d434a. Existing META-INF signing warnings are retained; no signature failure. ZIP integrity passed; embedded bundle contains pmit.merdekabattery.com and session/task corrections and excludes the former API domain. Adjacent JSON records artifact provenance. Source is the local working tree, not a published source commit.

This is a local debug artifact, not a signed production release or published update. No device install or production upload occurred. Compatibility with the installed application's signing certificate is unverified; native login/session/QR/push/biometric acceptance remains a device test. SDK XML-version, flatDir and existing web-build warnings remain. Native project/publication ownership remains Q-06/Q-07.


## Regenerated mobile UI debug APK - 2026-10-08

Artifact: mobile/pm-tech/artifacts/MTI-Mobile-PM-1.0.0-debug-ui-20261008.apk (21021600 bytes). SHA-256 f96658fb930ec661e95b029b4337fd76dc592f24ab60947ea461b064a8c2ad1b. Vite build, Capacitor sync and Gradle assembleDebug passed (23 executed tasks, 174 up-to-date). apksigner verifies v1/v2 with the same Android Debug certificate as the earlier APK. ZIP integrity, UI correction markers, production API destination and embedded asset byte comparison with current dist passed. VersionName 1.0.0/versionCode 2 retained. Local working-tree debug build; no publication or device installation. Existing build/signature metadata warnings remain. Adjacent JSON records provenance.


## Checklist sync bug fix APK - 2026-10-08

{"file": "MTI-Mobile-PM-1.0.0-debug-checklist-fix-20261008.apk", "bytes": 21170299, "sha256": "fc48c967f54a17850fd03177b1fee65a42526ba037c3fe975a3132ceb8e498b5", "variant": "debug", "versionName": "1.0.0", "versionCode": 2, "fix": "server checklist outcome/notes take precedence over stale local cache; refresh updates state", "verification": "typecheck, merge regressions, web build, Android sync, Gradle, apksigner, zip and bundle equality passed"}

Local debug artifact; no production task mutation or device installation. Native retest remains required.
