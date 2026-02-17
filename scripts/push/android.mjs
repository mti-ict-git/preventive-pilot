import 'dotenv/config';
import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import sql from 'mssql';

const readJsonFile = async (filePath) => {
  const raw = await fsp.readFile(filePath, 'utf-8');
  const json = JSON.parse(raw);
  return json;
};

const readTextFile = async (filePath) => {
  return await fsp.readFile(filePath, 'utf-8');
};

const getPmTechVersion = async (repoRootAbs) => {
  const pkgPath = path.join(repoRootAbs, 'mobile', 'pm-tech', 'package.json');
  const pkg = await readJsonFile(pkgPath);
  if (!pkg || typeof pkg !== 'object' || typeof pkg.version !== 'string' || pkg.version.trim().length === 0) {
    throw new Error('Unable to read pm-tech version from mobile/pm-tech/package.json');
  }
  return pkg.version.trim();
};

const getAndroidAppVersion = async (repoRootAbs) => {
  const gradlePath = path.join(repoRootAbs, 'mobile', 'pm-tech', 'android', 'app', 'build.gradle');
  const raw = await readTextFile(gradlePath);

  const versionCodeMatch = raw.match(/^\s*versionCode\s+(\d+)\s*$/m);
  const versionNameMatch = raw.match(/^\s*versionName\s+["']([^"']+)["']\s*$/m);

  const versionCode = versionCodeMatch ? Number.parseInt(versionCodeMatch[1], 10) : NaN;
  const versionName = versionNameMatch ? String(versionNameMatch[1]).trim() : '';

  if (!Number.isFinite(versionCode) || versionCode < 1) {
    throw new Error('Unable to read Android versionCode from mobile/pm-tech/android/app/build.gradle');
  }
  if (!versionName) {
    throw new Error('Unable to read Android versionName from mobile/pm-tech/android/app/build.gradle');
  }

  return { versionCode, versionName };
};

const fileExists = async (filePath) => {
  try {
    await fsp.access(filePath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
};

const resolveApkPath = async (repoRootAbs) => {
  const override = (process.env.APK_PATH ?? '').trim();
  if (override) return override;

  const variant = (process.env.ANDROID_BUILD_VARIANT ?? 'debug').trim().toLowerCase();
  const candidateDebug = path.join(repoRootAbs, 'mobile', 'pm-tech', 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
  const candidateRelease = path.join(repoRootAbs, 'mobile', 'pm-tech', 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');

  if (variant === 'release') {
    if (await fileExists(candidateRelease)) return candidateRelease;
    if (await fileExists(candidateDebug)) return candidateDebug;
  } else {
    if (await fileExists(candidateDebug)) return candidateDebug;
    if (await fileExists(candidateRelease)) return candidateRelease;
  }

  throw new Error('APK not found. Build Android APK first, or set APK_PATH=/absolute/path/to.apk');
};

const resolveUploadUrl = () => {
  const full = (process.env.SECURE_APK_UPLOAD_URL ?? '').trim();
  if (full) return full;
  const base = ((process.env.SECURE_APK_BASE_URL ?? process.env.APP_UPDATE_STORE_BASE_URL) ?? '').trim();
  if (!base) throw new Error('Missing SECURE_APK_UPLOAD_URL or SECURE_APK_BASE_URL or APP_UPDATE_STORE_BASE_URL');
  return `${base.replace(/\/$/, '')}/api/upload`;
};

const resolveUploadToken = () => {
  const token = ((process.env.SECURE_APK_UPLOAD_TOKEN ?? process.env.APP_UPDATE_STORE_UPLOAD_TOKEN) ?? '').trim();
  if (!token) throw new Error('Missing SECURE_APK_UPLOAD_TOKEN or APP_UPDATE_STORE_UPLOAD_TOKEN');
  return token;
};

const toBoolean = (value, defaultValue) => {
  if (value === undefined || value === null || value === '') return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n'].includes(normalized)) return false;
  return defaultValue;
};

const toNumber = (value, defaultValue) => {
  if (value === undefined || value === null || value === '') return defaultValue;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
};

const required = (value, name) => {
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const setForcedUpdatePolicy = async (input) => {
  const shouldWritePolicy = toBoolean(process.env.PUSH_ANDROID_SET_POLICY, true);
  if (!shouldWritePolicy) return { skipped: true };

  let dbConfig;
  try {
    dbConfig = {
      server: required(process.env.DB_SERVER, 'DB_SERVER'),
      database: required(process.env.DB_DATABASE, 'DB_DATABASE'),
      user: required(process.env.DB_USER, 'DB_USER'),
      password: required(process.env.DB_PASSWORD, 'DB_PASSWORD'),
      port: toNumber(process.env.DB_PORT, 1433),
      options: {
        encrypt: toBoolean(process.env.DB_ENCRYPT, false),
        trustServerCertificate: toBoolean(process.env.DB_TRUST_SERVER_CERTIFICATE, true),
      },
      pool: {
        max: 5,
        min: 0,
        idleTimeoutMillis: 30000,
      },
    };
  } catch (err) {
    const message = err instanceof Error && err.message.trim().length > 0 ? err.message : 'DB config missing';
    return { skipped: true, reason: message };
  }

  const enabled = toBoolean(process.env.PUSH_ANDROID_POLICY_ENABLED, true);
  const messageRaw = (process.env.PUSH_ANDROID_POLICY_MESSAGE ?? '').trim();
  const message = messageRaw ? messageRaw : null;

  const settingKey = `appUpdates.force.${input.appId}.${input.platform}`;
  const valueJson = JSON.stringify({
    enabled,
    requiredVersionCode: input.requiredVersionCode,
    ...(message ? { message } : {}),
  });

  const pool = await sql.connect(dbConfig);
  try {
    await pool
      .request()
      .input('settingKey', sql.NVarChar(128), settingKey)
      .input('settingValueJson', sql.NVarChar(sql.MAX), valueJson)
      .query(
        [
          'MERGE pm.SystemSettings WITH (HOLDLOCK) AS target',
          'USING (SELECT @settingKey AS SettingKey) AS source',
          'ON target.SettingKey = source.SettingKey',
          'WHEN MATCHED THEN',
          '  UPDATE SET',
          '    SettingValueJson = @settingValueJson,',
          '    UpdatedAt = sysutcdatetime(),',
          '    UpdatedByUserId = NULL',
          'WHEN NOT MATCHED THEN',
          '  INSERT (SettingKey, SettingValueJson, UpdatedByUserId)',
          '  VALUES (@settingKey, @settingValueJson, NULL);',
        ].join('\n')
      );
  } finally {
    await pool.close();
  }

  return { skipped: false, enabled, requiredVersionCode: input.requiredVersionCode, message };
};

const postMultipartFile = async (input) => {
  const fileBuffer = await fsp.readFile(input.filePath);
  let res;
  try {
    res = await fetch(input.uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.token}`,
        'Content-Type': 'application/vnd.android.package-archive',
        'X-File-Name': input.fileName,
      },
      body: fileBuffer,
    });
  } catch (err) {
    const causeMessage =
      err && typeof err === 'object' && 'cause' in err && err.cause instanceof Error && err.cause.message.trim()
        ? err.cause.message.trim()
        : null;
    const message = err instanceof Error && err.message.trim() ? err.message.trim() : 'fetch failed';
    throw new Error(`Upload request failed: ${message}${causeMessage ? ` (${causeMessage})` : ''} url=${input.uploadUrl}`);
  }

  const body = await res.text();
  let json = null;
  try {
    json = JSON.parse(body);
  } catch {
    json = null;
  }

  const status = res.status;
  if (status < 200 || status >= 300) {
    const msg = json && typeof json === 'object' && typeof json.message === 'string' ? json.message : body.trim();
    throw new Error(`Upload failed: HTTP ${status}${msg ? ` - ${msg}` : ''}`);
  }

  return { status, body, json };
};

const main = async () => {
  const repoRootAbs = process.cwd();

  const pkgVersion = await getPmTechVersion(repoRootAbs);
  const androidVersion = await getAndroidAppVersion(repoRootAbs);
  const apkPath = await resolveApkPath(repoRootAbs);
  const uploadUrl = resolveUploadUrl();
  const token = resolveUploadToken();

  const fileName = `pm-tech_v${androidVersion.versionName}.apk`;
  const result = await postMultipartFile({ uploadUrl, token, filePath: apkPath, fileName });

  if (pkgVersion !== androidVersion.versionName) {
    process.stdout.write(
      `Warning: pm-tech package.json version (${pkgVersion}) does not match Android versionName (${androidVersion.versionName}).\n`
    );
  }

  const policyResult = await setForcedUpdatePolicy({
    appId: 'pm-tech',
    platform: 'android',
    requiredVersionCode: androidVersion.versionCode,
  });

  if (result && result.json && typeof result.json === 'object') {
    const versionName = typeof result.json.versionName === 'string' ? result.json.versionName : null;
    const manifestCount = typeof result.json.manifestCount === 'number' ? result.json.manifestCount : null;
    const stored = result.json.entry && typeof result.json.entry === 'object' && typeof result.json.entry.fileName === 'string' ? result.json.entry.fileName : null;
    process.stdout.write(
      `Uploaded ${stored ?? fileName}${versionName ? ` (v${versionName})` : ''}${manifestCount !== null ? `; manifest entries: ${manifestCount}` : ''}\n`
    );
    if (!policyResult.skipped) {
      process.stdout.write(
        `Policy set: enabled=${policyResult.enabled ? 'true' : 'false'} requiredVersionCode=${policyResult.requiredVersionCode}${
          policyResult.message ? ` message="${policyResult.message.replace(/"/g, '')}"` : ''
        }\n`
      );
    } else {
      process.stdout.write(`Policy set: skipped${policyResult.reason ? ` (${policyResult.reason})` : ''}\n`);
    }
    return;
  }
  process.stdout.write(`Uploaded ${fileName}\n`);
  if (!policyResult.skipped) {
    process.stdout.write(`Policy set: enabled=${policyResult.enabled ? 'true' : 'false'} requiredVersionCode=${policyResult.requiredVersionCode}\n`);
  } else {
    process.stdout.write(`Policy set: skipped${policyResult.reason ? ` (${policyResult.reason})` : ''}\n`);
  }
};

void main().catch((err) => {
  const baseMessage = err instanceof Error && err.message.trim().length > 0 ? err.message.trim() : 'push:android failed';
  const causeMessage =
    err instanceof Error && err.cause instanceof Error && err.cause.message.trim().length > 0 ? err.cause.message.trim() : null;
  process.stderr.write(`${baseMessage}${causeMessage ? ` (${causeMessage})` : ''}\n`);
  process.exitCode = 1;
});
