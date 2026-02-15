import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';

const readJsonFile = async (filePath) => {
  const raw = await fsp.readFile(filePath, 'utf-8');
  const json = JSON.parse(raw);
  return json;
};

const getPmTechVersion = async (repoRootAbs) => {
  const pkgPath = path.join(repoRootAbs, 'mobile', 'pm-tech', 'package.json');
  const pkg = await readJsonFile(pkgPath);
  if (!pkg || typeof pkg !== 'object' || typeof pkg.version !== 'string' || pkg.version.trim().length === 0) {
    throw new Error('Unable to read pm-tech version from mobile/pm-tech/package.json');
  }
  return pkg.version.trim();
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
  const base = (process.env.SECURE_APK_BASE_URL ?? '').trim();
  if (!base) throw new Error('Missing SECURE_APK_UPLOAD_URL or SECURE_APK_BASE_URL');
  return `${base.replace(/\/$/, '')}/api/upload`;
};

const resolveUploadToken = () => {
  const token = (process.env.SECURE_APK_UPLOAD_TOKEN ?? '').trim();
  if (!token) throw new Error('Missing SECURE_APK_UPLOAD_TOKEN');
  return token;
};

const postMultipartFile = async (input) => {
  const url = new URL(input.uploadUrl);
  const isHttps = url.protocol === 'https:';
  if (!isHttps && url.protocol !== 'http:') throw new Error(`Unsupported protocol: ${url.protocol}`);

  const boundary = `----pmtech-${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
  const fileStat = await fsp.stat(input.filePath);
  const preamble = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${input.fileName}"\r\n` +
      'Content-Type: application/vnd.android.package-archive\r\n' +
      '\r\n',
    'utf-8'
  );
  const epilogue = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8');
  const contentLength = preamble.length + fileStat.size + epilogue.length;

  const client = isHttps ? https : http;

  const options = {
    method: 'POST',
    hostname: url.hostname,
    port: url.port ? Number(url.port) : isHttps ? 443 : 80,
    path: `${url.pathname}${url.search}`,
    headers: {
      Authorization: `Bearer ${input.token}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': String(contentLength),
    },
  };

  return await new Promise((resolve, reject) => {
    const req = client.request(options, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf-8');
        const status = res.statusCode ?? 0;
        let json = null;
        try {
          json = JSON.parse(body);
        } catch {
          json = null;
        }
        if (status < 200 || status >= 300) {
          const msg = json && typeof json === 'object' && typeof json.message === 'string' ? json.message : body.trim();
          reject(new Error(`Upload failed: HTTP ${status}${msg ? ` - ${msg}` : ''}`));
          return;
        }
        resolve({ status, body, json });
      });
    });
    req.on('error', (err) => reject(err));

    req.write(preamble);
    const fileStream = fs.createReadStream(input.filePath);
    fileStream.on('error', (err) => reject(err));
    fileStream.on('end', () => {
      req.end(epilogue);
    });
    fileStream.pipe(req, { end: false });
  });
};

const main = async () => {
  const repoRootAbs = process.cwd();

  const version = await getPmTechVersion(repoRootAbs);
  const apkPath = await resolveApkPath(repoRootAbs);
  const uploadUrl = resolveUploadUrl();
  const token = resolveUploadToken();

  const fileName = `pm-tech_v${version}.apk`;
  const result = await postMultipartFile({ uploadUrl, token, filePath: apkPath, fileName });

  if (result.json && typeof result.json === 'object') {
    const versionName = typeof result.json.versionName === 'string' ? result.json.versionName : null;
    const manifestCount = typeof result.json.manifestCount === 'number' ? result.json.manifestCount : null;
    const stored = result.json.entry && typeof result.json.entry === 'object' && typeof result.json.entry.fileName === 'string' ? result.json.entry.fileName : null;
    process.stdout.write(
      `Uploaded ${stored ?? fileName}${versionName ? ` (v${versionName})` : ''}${manifestCount !== null ? `; manifest entries: ${manifestCount}` : ''}\n`
    );
    return;
  }
  process.stdout.write(`Uploaded ${fileName}\n`);
};

void main().catch((err) => {
  const message = err instanceof Error && err.message.trim().length > 0 ? err.message : 'push:android failed';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});

