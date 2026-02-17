import http from 'node:http';
import { createWriteStream, promises as fs } from 'node:fs';
import { createHash, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import Busboy from 'busboy';

const PORT = Number(process.env.PORT ?? '3000');
const SHARE_DIR = (process.env.SHARE_DIR ?? '/mnt/share').trim();
const UPLOAD_TOKEN = (process.env.SECURE_APK_UPLOAD_TOKEN ?? '').trim();
const ALLOWED_PREFIXES_RAW = (process.env.SECURE_APK_ALLOWED_PREFIXES ?? 'pm-tech_v').trim();
const MAX_BYTES = Number(process.env.SECURE_APK_UPLOAD_MAX_BYTES ?? String(400 * 1024 * 1024));

const FALLBACK_SUBDIR = ['Apps Standard', 'Android', 'Release', 'apk'];

const allowedPrefixes = ALLOWED_PREFIXES_RAW.split(',').map((s) => s.trim()).filter((s) => s.length > 0);

const sendJson = (res, status, payload) => {
  const text = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(text);
};

const parseSemverParts = (versionName) => {
  const m = versionName.trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return null;
  const major = Number(m[1]);
  const minor = Number(m[2]);
  const patch = Number(m[3]);
  if (!Number.isFinite(major) || !Number.isFinite(minor) || !Number.isFinite(patch)) return null;
  return { major, minor, patch };
};

const compareSemver = (a, b) => {
  const pa = parseSemverParts(a);
  const pb = parseSemverParts(b);
  if (!pa && !pb) return 0;
  if (!pa) return -1;
  if (!pb) return 1;
  if (pa.major !== pb.major) return pa.major < pb.major ? -1 : 1;
  if (pa.minor !== pb.minor) return pa.minor < pb.minor ? -1 : 1;
  if (pa.patch !== pb.patch) return pa.patch < pb.patch ? -1 : 1;
  return 0;
};

const parseVersionNameFromFileName = (fileName, prefix) => {
  const trimmed = fileName.trim();
  if (!trimmed.toLowerCase().startsWith(prefix.toLowerCase())) return null;
  if (!trimmed.toLowerCase().endsWith('.apk')) return null;
  const versionPart = trimmed.slice(prefix.length, trimmed.length - '.apk'.length);
  const versionName = versionPart.startsWith('v') ? versionPart.slice(1) : versionPart;
  if (!parseSemverParts(versionName)) return null;
  return versionName;
};

let effectiveShareDirPromise = null;

const pathExists = async (p) => {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
};

const resolveEffectiveShareDir = async () => {
  const base = SHARE_DIR;
  const baseManifest = path.join(base, 'manifest.json');
  if (await pathExists(baseManifest)) return base;

  const fallback = path.join(base, ...FALLBACK_SUBDIR);
  const fallbackManifest = path.join(fallback, 'manifest.json');
  if (await pathExists(fallbackManifest)) return fallback;
  if (await pathExists(fallback)) return fallback;
  return base;
};

const getEffectiveShareDir = async () => {
  if (!effectiveShareDirPromise) {
    effectiveShareDirPromise = resolveEffectiveShareDir();
  }
  return await effectiveShareDirPromise;
};

const readManifest = async () => {
  const dir = await getEffectiveShareDir();
  const filePath = path.join(dir, 'manifest.json');
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const json = JSON.parse(raw);
    if (Array.isArray(json)) {
      return json
        .filter((x) => typeof x === 'string')
        .map((fileName) => ({ fileName, sizeBytes: 0, sha256: '', modifiedAt: new Date().toISOString() }));
    }
    if (json && typeof json === 'object' && Array.isArray(json.files)) {
      return json.files
        .filter((x) => x && typeof x === 'object' && typeof x.fileName === 'string')
        .map((x) => ({
          fileName: x.fileName,
          sizeBytes: typeof x.sizeBytes === 'number' ? x.sizeBytes : 0,
          sha256: typeof x.sha256 === 'string' ? x.sha256 : '',
          modifiedAt: typeof x.modifiedAt === 'string' ? x.modifiedAt : new Date().toISOString(),
        }));
    }
    return [];
  } catch {
    return [];
  }
};

const writeManifest = async (entries) => {
  const dir = await getEffectiveShareDir();
  const filePath = path.join(dir, 'manifest.json');
  const tmpPath = `${filePath}.tmp`;
  const payload = { files: entries };
  await fs.writeFile(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
  await fs.rename(tmpPath, filePath);
};

const upsertManifestEntry = async (entry) => {
  const entries = await readManifest();
  const next = entries.filter((e) => e.fileName !== entry.fileName);
  next.push(entry);
  const withVersions = next
    .map((e) => {
      const prefix = allowedPrefixes.find((p) => e.fileName.toLowerCase().startsWith(p.toLowerCase())) ?? null;
      const versionName = prefix ? parseVersionNameFromFileName(e.fileName, prefix) : null;
      return { entry: e, versionName };
    })
    .filter((x) => x.versionName);

  withVersions.sort((a, b) => -compareSemver(a.versionName, b.versionName));
  const sorted = withVersions.map((x) => x.entry);
  await writeManifest(sorted);
  return sorted;
};

const isAuthorized = (req) => {
  if (!UPLOAD_TOKEN) return false;
  const header = req.headers.authorization ?? '';
  const parts = typeof header === 'string' ? header.split(' ') : [];
  if (parts.length !== 2) return false;
  const [scheme, token] = parts;
  if (!scheme || scheme.toLowerCase() !== 'bearer') return false;
  const a = Buffer.from(token);
  const b = Buffer.from(UPLOAD_TOKEN);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
};

const handleHealth = (req, res) => {
  if (req.method !== 'GET') {
    sendJson(res, 405, { message: 'Method not allowed' });
    return;
  }
  sendJson(res, 200, { ok: true });
};

const handleManifest = async (req, res) => {
  if (req.method !== 'GET') {
    sendJson(res, 405, { message: 'Method not allowed' });
    return;
  }
  const files = await readManifest();
  sendJson(res, 200, { files });
};

const handleUpload = (req, res) => {
  if (req.method !== 'POST') {
    sendJson(res, 405, { message: 'Method not allowed' });
    return;
  }
  if (!isAuthorized(req)) {
    sendJson(res, 401, { message: 'Unauthorized' });
    return;
  }

  const contentType = req.headers['content-type'];
  const fileNameHeader = req.headers['x-file-name'];
  const rawFileName = typeof fileNameHeader === 'string' ? fileNameHeader.trim() : '';

  const canUseRawUpload =
    rawFileName.length > 0 &&
    typeof contentType === 'string' &&
    ['application/octet-stream', 'application/vnd.android.package-archive'].includes(contentType.trim().toLowerCase());

  if (canUseRawUpload) {
    const base = path.basename(rawFileName);
    const prefix = allowedPrefixes.find((p) => base.toLowerCase().startsWith(p.toLowerCase())) ?? null;
    if (!prefix) {
      sendJson(res, 400, { message: `Invalid file prefix. Allowed: ${allowedPrefixes.join(', ')}` });
      return;
    }
    const versionName = parseVersionNameFromFileName(base, prefix);
    if (!versionName) {
      sendJson(res, 400, { message: 'Invalid APK file name. Expected <prefix><semver>.apk' });
      return;
    }

    let failed = false;
    void getEffectiveShareDir()
      .then((dir) => {
        const targetPath = path.join(dir, base);
        const tmpPath = `${targetPath}.uploading`;
        const sha256 = createHash('sha256');
        let sizeBytes = 0;

        const out = createWriteStream(tmpPath, { flags: 'w' });
        req.on('data', (chunk) => {
          sizeBytes += chunk.length;
          if (sizeBytes > MAX_BYTES) {
            failed = true;
            try {
              req.destroy();
            } catch (e) {
              void e;
            }
            try {
              out.destroy();
            } catch (e) {
              void e;
            }
            sendJson(res, 413, { message: 'File too large' });
            return;
          }
          sha256.update(chunk);
        });
        req.pipe(out);

        out.on('error', () => {
          if (failed) return;
          failed = true;
          sendJson(res, 500, { message: 'Failed to write file' });
        });

        out.on('close', async () => {
          if (failed) return;
          try {
            await fs.rename(tmpPath, targetPath);
            const sum = sha256.digest('hex');
            const modifiedAt = new Date().toISOString();
            const entry = { fileName: base, sizeBytes, sha256: sum, modifiedAt };
            const manifest = await upsertManifestEntry(entry);
            sendJson(res, 200, { ok: true, entry, manifestCount: manifest.length, versionName });
          } catch (e) {
            try {
              await fs.rm(tmpPath, { force: true });
            } catch (cleanupError) {
              void cleanupError;
            }
            const message = e instanceof Error && e.message.trim() ? e.message : 'Upload failed';
            sendJson(res, 500, { message });
          }
        });
      })
      .catch((e) => {
        const message = e instanceof Error && e.message.trim() ? e.message : 'Upload failed';
        sendJson(res, 500, { message });
      });
    return;
  }

  if (typeof contentType !== 'string' || !contentType.toLowerCase().includes('multipart/form-data')) {
    sendJson(res, 400, { message: 'Expected multipart/form-data' });
    return;
  }

  const busboy = Busboy({ headers: req.headers, limits: { fileSize: MAX_BYTES, files: 1 } });

  let saved = null;
  let failed = false;

  busboy.on('file', (fieldName, file, info) => {
    if (failed) {
      file.resume();
      return;
    }
    if (fieldName !== 'file') {
      failed = true;
      file.resume();
      sendJson(res, 400, { message: 'Missing file field' });
      return;
    }
    const original = (info.filename ?? '').trim();
    const base = path.basename(original);
    const prefix = allowedPrefixes.find((p) => base.toLowerCase().startsWith(p.toLowerCase())) ?? null;
    if (!prefix) {
      failed = true;
      file.resume();
      sendJson(res, 400, { message: `Invalid file prefix. Allowed: ${allowedPrefixes.join(', ')}` });
      return;
    }
    const versionName = parseVersionNameFromFileName(base, prefix);
    if (!versionName) {
      failed = true;
      file.resume();
      sendJson(res, 400, { message: 'Invalid APK file name. Expected <prefix><semver>.apk' });
      return;
    }

    void getEffectiveShareDir()
      .then((dir) => {
        const targetPath = path.join(dir, base);
        const tmpPath = `${targetPath}.uploading`;
        const sha256 = createHash('sha256');
        let sizeBytes = 0;

        const out = createWriteStream(tmpPath, { flags: 'w' });
        file.on('data', (chunk) => {
          sizeBytes += chunk.length;
          sha256.update(chunk);
        });
        file.pipe(out);

        out.on('error', () => {
          failed = true;
          sendJson(res, 500, { message: 'Failed to write file' });
        });

        out.on('close', async () => {
          if (failed) return;
          try {
            await fs.rename(tmpPath, targetPath);
            const sum = sha256.digest('hex');
            const modifiedAt = new Date().toISOString();
            const entry = { fileName: base, sizeBytes, sha256: sum, modifiedAt };
            const manifest = await upsertManifestEntry(entry);
            saved = { entry, manifestCount: manifest.length, versionName };
            sendJson(res, 200, { ok: true, ...saved });
          } catch (e) {
            try {
              await fs.rm(tmpPath, { force: true });
            } catch (cleanupError) {
              void cleanupError;
            }
            const message = e instanceof Error && e.message.trim() ? e.message : 'Upload failed';
            sendJson(res, 500, { message });
          }
        });
      })
      .catch((e) => {
        failed = true;
        const message = e instanceof Error && e.message.trim() ? e.message : 'Upload failed';
        sendJson(res, 500, { message });
        file.resume();
      });
  });

  busboy.on('filesLimit', () => {
    if (failed) return;
    failed = true;
    sendJson(res, 400, { message: 'Only one file is allowed' });
  });

  busboy.on('error', () => {
    if (failed) return;
    failed = true;
    sendJson(res, 400, { message: 'Invalid multipart data' });
  });

  busboy.on('finish', () => {
    if (failed) return;
    if (!saved) {
      sendJson(res, 400, { message: 'No file uploaded (field name must be "file")' });
    }
  });

  req.pipe(busboy);
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/api/health') {
    handleHealth(req, res);
    return;
  }
  if (url.pathname === '/api/manifest') {
    void handleManifest(req, res);
    return;
  }
  if (url.pathname === '/api/upload') {
    handleUpload(req, res);
    return;
  }
  sendJson(res, 404, { message: 'Not found' });
});

server.listen(PORT);
