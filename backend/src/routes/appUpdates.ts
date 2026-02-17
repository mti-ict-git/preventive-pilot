import { Router } from "express";
import { z } from "zod";
import sql from "mssql";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { Buffer } from "node:buffer";
import { Readable } from "node:stream";
import { env } from "../config/env.js";
import { getDb } from "../db/mssql.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireSuperadmin } from "../middleware/requireRole.js";

type AppUpdateConfigItem = {
  appId: string;
  prefix: string;
  directory: string;
};

type LatestApkInfo = {
  appId: string;
  versionName: string;
  fileName: string;
  sizeBytes: number;
  sha256: string;
  modifiedAt: string;
  downloadUrl: string;
};

const LatestQuerySchema = z.object({
  appId: z.string().trim().min(1).max(64),
});

const DownloadQuerySchema = z.object({
  token: z.string().trim().min(1).max(4096),
});

const PolicyQuerySchema = z.object({
  appId: z.string().trim().min(1).max(64),
  platform: z.enum(["android", "ios", "web"]),
  versionCode: z
    .string()
    .trim()
    .regex(/^\d+$/)
    .transform((v) => Number(v))
    .pipe(z.number().int().min(1)),
});

const PolicyUpdateSchema = z.object({
  appId: z.string().trim().min(1).max(64),
  platform: z.enum(["android", "ios", "web"]),
  enabled: z.boolean(),
  requiredVersionCode: z.number().int().min(1),
  message: z.string().trim().min(1).max(256).optional(),
});

const InstallationReportSchema = z.object({
  installationId: z.string().uuid(),
  appId: z.string().trim().min(1).max(64),
  platform: z.enum(["android", "ios", "web"]),
  versionCode: z.number().int().min(1),
  versionName: z.string().trim().min(1).max(64).optional(),
});

const ConfigJsonSchema = z.array(
  z.object({
    appId: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[a-z0-9-]+$/i),
    prefix: z.string().trim().min(1).max(128),
    directory: z.string().trim().min(1).max(512),
  }),
);

const defaultConfig: AppUpdateConfigItem[] = [
  {
    appId: "pm-tech",
    prefix: "pm-tech_v",
    directory: ".",
  },
];

const loadConfig = (): AppUpdateConfigItem[] => {
  const raw = (env.APP_UPDATE_CONFIG_JSON ?? "").trim();
  if (!raw) return defaultConfig;
  try {
    const parsed: unknown = JSON.parse(raw);
    const validated = ConfigJsonSchema.safeParse(parsed);
    if (!validated.success) return defaultConfig;
    return validated.data;
  } catch {
    return defaultConfig;
  }
};

const parseVersionNameFromFileName = (fileName: string, prefix: string): string | null => {
  const normalized = fileName.trim();
  if (!normalized.toLowerCase().endsWith(".apk")) return null;
  const base = normalized.slice(0, -".apk".length);
  if (!base.toLowerCase().startsWith(prefix.toLowerCase())) return null;
  const rest = base.slice(prefix.length);
  const match = rest.match(/\s*v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:[-+].*)?$/);
  if (!match) return null;
  const major = match[1];
  const minor = match[2] ?? "0";
  const patch = match[3] ?? "0";
  return `${major}.${minor}.${patch}`;
};

type SemverParts = { major: number; minor: number; patch: number };

const parseSemverParts = (versionName: string): SemverParts | null => {
  const m = versionName.trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return null;
  const major = Number(m[1]);
  const minor = Number(m[2]);
  const patch = Number(m[3]);
  if (!Number.isFinite(major) || !Number.isFinite(minor) || !Number.isFinite(patch)) return null;
  return { major, minor, patch };
};

const compareSemver = (a: string, b: string): number => {
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

const resolveUpdateRoot = (): string | null => {
  const root = (env.APP_UPDATE_STORAGE_ROOT ?? env.EVIDENCE_STORAGE_ROOT ?? "").trim();
  if (!root) return null;
  return path.resolve(root);
};

const normalizeBaseUrl = (value: string): string => value.trim().replace(/\/+$/, "");

const resolveStoreBaseUrl = (): string | null => {
  const raw = (env.APP_UPDATE_STORE_BASE_URL ?? "").trim();
  if (!raw) return null;
  const normalized = normalizeBaseUrl(raw);
  let u: URL;
  try {
    u = new URL(normalized);
  } catch {
    return null;
  }
  if (u.search || u.hash) return null;
  if (u.pathname && u.pathname !== "/") return null;

  const protocol = u.protocol.toLowerCase();
  if (protocol === "https:") return normalized;
  if (protocol === "http:" && env.APP_UPDATE_STORE_ALLOW_HTTP) return normalized;
  return null;
};

type StoreManifestEntry = {
  fileName: string;
  sizeBytes: number | null;
  sha256: string | null;
  modifiedAt: string | null;
};

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

const parseManifest = (input: unknown): StoreManifestEntry[] => {
  const list: unknown[] =
    Array.isArray(input) ? input : isRecord(input) && Array.isArray(input.files) ? (input.files as unknown[]) : [];

  const out: StoreManifestEntry[] = [];
  for (const item of list) {
    if (typeof item === "string") {
      const name = item.trim();
      if (!name) continue;
      out.push({ fileName: name, sizeBytes: null, sha256: null, modifiedAt: null });
      continue;
    }
    if (!isRecord(item)) continue;
    const fileName = typeof item.fileName === "string" ? item.fileName.trim() : "";
    if (!fileName) continue;
    const sizeBytes = typeof item.sizeBytes === "number" && Number.isFinite(item.sizeBytes) && item.sizeBytes >= 0 ? item.sizeBytes : null;
    const sha256 = typeof item.sha256 === "string" && item.sha256.trim() ? item.sha256.trim() : null;
    const modifiedAt = typeof item.modifiedAt === "string" && item.modifiedAt.trim() ? item.modifiedAt.trim() : null;
    out.push({ fileName, sizeBytes, sha256, modifiedAt });
  }
  return out;
};

const fetchJsonWithTimeout = async (url: string, timeoutMs: number): Promise<unknown> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: "GET", headers: { Accept: "application/json" }, signal: controller.signal });
    if (!res.ok) throw new Error("fetch failed");
    return (await res.json()) as unknown;
  } finally {
    clearTimeout(timeout);
  }
};

const createSignedDownloadUrl = (input: { appId: string; fileName: string }): string | null => {
  const ttlSeconds = env.APP_UPDATE_TOKEN_TTL_SECONDS;
  const signingSecret = (env.APP_UPDATE_SIGNING_SECRET ?? "").trim();
  if (!signingSecret) return null;

  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const tokenPayload = JSON.stringify({ appId: input.appId, fileName: input.fileName, exp: expiresAt });
  const sig = crypto.createHmac("sha256", signingSecret).update(tokenPayload).digest("hex");
  const token = Buffer.from(tokenPayload, "utf8").toString("base64url") + "." + sig;
  return `/api/app-updates/download?token=${encodeURIComponent(token)}`;
};

const findLatestApkFromStoreManifest = async (input: { storeBaseUrl: string; config: AppUpdateConfigItem }): Promise<LatestApkInfo | null> => {
  const manifestUrlRaw = (env.APP_UPDATE_STORE_MANIFEST_URL ?? "").trim();
  const manifestUrl = manifestUrlRaw ? manifestUrlRaw : `${input.storeBaseUrl}/apk/manifest.json`;

  let json: unknown;
  try {
    json = await fetchJsonWithTimeout(manifestUrl, 4000);
  } catch {
    return null;
  }

  const entries = parseManifest(json);
  const candidates: Array<{ entry: StoreManifestEntry; versionName: string }> = [];
  for (const entry of entries) {
    const fileName = entry.fileName;
    if (!fileName.toLowerCase().endsWith(".apk")) continue;
    if (!fileName.toLowerCase().startsWith(input.config.prefix.toLowerCase())) continue;
    const versionName = parseVersionNameFromFileName(fileName, input.config.prefix);
    if (!versionName) continue;
    candidates.push({ entry, versionName });
  }
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const cmp = compareSemver(a.versionName, b.versionName);
    if (cmp !== 0) return -cmp;
    return 0;
  });

  const chosen = candidates[0];
  if (!chosen) return null;
  const downloadUrl = createSignedDownloadUrl({ appId: input.config.appId, fileName: chosen.entry.fileName });
  if (!downloadUrl) return null;

  return {
    appId: input.config.appId,
    versionName: chosen.versionName,
    fileName: chosen.entry.fileName,
    sizeBytes: chosen.entry.sizeBytes ?? 0,
    sha256: chosen.entry.sha256 ?? "",
    modifiedAt: chosen.entry.modifiedAt ?? new Date().toISOString(),
    downloadUrl,
  };
};

const hashCache = new Map<string, { mtimeMs: number; size: number; sha256: string }>();

const computeSha256 = async (fileAbs: string, st: fs.Stats): Promise<string> => {
  const key = fileAbs;
  const cached = hashCache.get(key);
  if (cached && cached.mtimeMs === st.mtimeMs && cached.size === st.size) return cached.sha256;

  const hash = crypto.createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = fs.createReadStream(fileAbs);
    stream.on("data", (chunk: Buffer) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve());
  });
  const sha256 = hash.digest("hex");
  hashCache.set(key, { mtimeMs: st.mtimeMs, size: st.size, sha256 });
  return sha256;
};

const findLatestApkForApp = async (input: { rootAbs: string; config: AppUpdateConfigItem }): Promise<LatestApkInfo | null> => {
  const dirAbs = path.resolve(input.rootAbs, input.config.directory);
  const prefix = input.config.prefix;

  let entries: string[];
  try {
    entries = await fs.promises.readdir(dirAbs);
  } catch {
    return null;
  }

  const candidates: Array<{ fileName: string; versionName: string; st: fs.Stats }> = [];
  for (const fileName of entries) {
    if (!fileName.toLowerCase().endsWith(".apk")) continue;
    if (!fileName.toLowerCase().startsWith(prefix.toLowerCase())) continue;
    const versionName = parseVersionNameFromFileName(fileName, prefix);
    if (!versionName) continue;

    const fileAbs = path.resolve(dirAbs, fileName);
    let st: fs.Stats;
    try {
      st = await fs.promises.stat(fileAbs);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;
    candidates.push({ fileName, versionName, st });
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const cmp = compareSemver(a.versionName, b.versionName);
    if (cmp !== 0) return -cmp;
    return b.st.mtimeMs - a.st.mtimeMs;
  });

  const chosen = candidates[0];
  if (!chosen) return null;
  const chosenAbs = path.resolve(dirAbs, chosen.fileName);
  const sha256 = await computeSha256(chosenAbs, chosen.st);

  const downloadUrl = createSignedDownloadUrl({ appId: input.config.appId, fileName: chosen.fileName });
  if (!downloadUrl) return null;

  return {
    appId: input.config.appId,
    versionName: chosen.versionName,
    fileName: chosen.fileName,
    sizeBytes: chosen.st.size,
    sha256,
    modifiedAt: chosen.st.mtime.toISOString(),
    downloadUrl,
  };
};

const verifyToken = (token: string): { appId: string; fileName: string; exp: number } | null => {
  const signingSecret = (env.APP_UPDATE_SIGNING_SECRET ?? "").trim();
  if (!signingSecret) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const payloadB64 = parts[0];
  const sig = parts[1];
  if (!payloadB64 || !sig) return null;

  let payloadRaw = "";
  try {
    payloadRaw = Buffer.from(payloadB64, "base64url").toString("utf8");
  } catch {
    return null;
  }

  const expectedSig = crypto.createHmac("sha256", signingSecret).update(payloadRaw).digest("hex");
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expectedSig, "hex"))) return null;
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadRaw);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;
  const rec = parsed as Record<string, unknown>;
  const appId = typeof rec.appId === "string" ? rec.appId : null;
  const fileName = typeof rec.fileName === "string" ? rec.fileName : null;
  const exp = typeof rec.exp === "number" ? rec.exp : null;
  if (!appId || !fileName || !exp) return null;
  if (!Number.isFinite(exp)) return null;
  if (Math.floor(Date.now() / 1000) > exp) return null;
  if (path.basename(fileName) !== fileName) return null;
  return { appId, fileName, exp };
};

export const appUpdatesRouter = Router();

const APP_UPDATE_POLICY_KEY_PREFIX = "appUpdates.force.";

const PolicyValueSchema = z.object({
  enabled: z.boolean(),
  requiredVersionCode: z.number().int().min(1),
  message: z.string().trim().min(1).max(256).optional(),
});

type PolicyValue = z.infer<typeof PolicyValueSchema>;

const loadPolicyValue = async (input: { appId: string; platform: "android" | "ios" | "web" }): Promise<PolicyValue | null> => {
  const settingKey = `${APP_UPDATE_POLICY_KEY_PREFIX}${input.appId}.${input.platform}`;
  const db = await getDb();
  const result = await db
    .request()
    .input("settingKey", sql.NVarChar(128), settingKey)
    .query(
      [
        "SELECT TOP (1)",
        "  SettingValueJson",
        "FROM pm.SystemSettings",
        "WHERE SettingKey = @settingKey",
      ].join("\n"),
    );

  const row = result.recordset[0] as Record<string, unknown> | undefined;
  const valueJson = typeof row?.SettingValueJson === "string" ? row.SettingValueJson : null;
  if (!valueJson) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(valueJson);
  } catch {
    return null;
  }

  const validated = PolicyValueSchema.safeParse(parsed);
  if (!validated.success) return null;
  return validated.data;
};

appUpdatesRouter.get("/policy", async (req, res) => {
  const parsed = PolicyQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  try {
    const policy = await loadPolicyValue({ appId: parsed.data.appId, platform: parsed.data.platform });
    if (!policy || !policy.enabled) {
      res.json({ enabled: false, requiredVersionCode: null, shouldDownload: false, message: null });
      return;
    }

    const shouldDownload = parsed.data.versionCode < policy.requiredVersionCode;
    res.json({
      enabled: true,
      requiredVersionCode: policy.requiredVersionCode,
      shouldDownload,
      message: policy.message ?? null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ message });
  }
});

appUpdatesRouter.put("/policy", requireAuth, requireSuperadmin, async (req, res) => {
  const parsed = PolicyUpdateSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const settingKey = `${APP_UPDATE_POLICY_KEY_PREFIX}${parsed.data.appId}.${parsed.data.platform}`;
  const valueJson = JSON.stringify({
    enabled: parsed.data.enabled,
    requiredVersionCode: parsed.data.requiredVersionCode,
    message: parsed.data.message,
  });

  try {
    const db = await getDb();
    await db
      .request()
      .input("settingKey", sql.NVarChar(128), settingKey)
      .input("settingValueJson", sql.NVarChar(sql.MAX), valueJson)
      .input("updatedByUserId", sql.UniqueIdentifier, req.user.sub)
      .query(
        [
          "MERGE pm.SystemSettings WITH (HOLDLOCK) AS target",
          "USING (SELECT @settingKey AS SettingKey) AS source",
          "ON target.SettingKey = source.SettingKey",
          "WHEN MATCHED THEN",
          "  UPDATE SET",
          "    SettingValueJson = @settingValueJson,",
          "    UpdatedAt = sysutcdatetime(),",
          "    UpdatedByUserId = @updatedByUserId",
          "WHEN NOT MATCHED THEN",
          "  INSERT (SettingKey, SettingValueJson, UpdatedByUserId)",
          "  VALUES (@settingKey, @settingValueJson, @updatedByUserId);",
        ].join("\n"),
      );

    const updated = await loadPolicyValue({ appId: parsed.data.appId, platform: parsed.data.platform });
    res.json({
      enabled: updated?.enabled ?? false,
      requiredVersionCode: updated?.requiredVersionCode ?? null,
      message: updated?.message ?? null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ message });
  }
});

appUpdatesRouter.post("/report", requireAuth, async (req, res) => {
  const parsed = InstallationReportSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const db = await getDb();
  await db
    .request()
    .input("installationId", sql.UniqueIdentifier, parsed.data.installationId)
    .input("userId", sql.UniqueIdentifier, req.user.sub)
    .input("appId", sql.NVarChar(64), parsed.data.appId)
    .input("platform", sql.NVarChar(32), parsed.data.platform)
    .input("versionCode", sql.Int, parsed.data.versionCode)
    .input("versionName", sql.NVarChar(64), parsed.data.versionName ?? null)
    .query(
      [
        "DECLARE @now datetime2(0) = sysutcdatetime();",
        "MERGE pm.AppInstallations WITH (HOLDLOCK) AS target",
        "USING (SELECT @installationId AS InstallationId) AS source",
        "ON target.InstallationId = source.InstallationId",
        "WHEN MATCHED THEN",
        "  UPDATE SET",
        "    UserId = @userId,",
        "    AppId = @appId,",
        "    Platform = @platform,",
        "    VersionCode = @versionCode,",
        "    VersionName = @versionName,",
        "    LastSeenAt = @now,",
        "    UpdatedAt = @now",
        "WHEN NOT MATCHED THEN",
        "  INSERT (InstallationId, UserId, AppId, Platform, VersionCode, VersionName, LastSeenAt, CreatedAt, UpdatedAt)",
        "  VALUES (@installationId, @userId, @appId, @platform, @versionCode, @versionName, @now, @now, @now);",
      ].join("\n"),
    );

  res.json({ ok: true });
});

appUpdatesRouter.get("/latest", async (req, res) => {
  const parsed = LatestQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const signingSecret = (env.APP_UPDATE_SIGNING_SECRET ?? "").trim();
  if (!signingSecret) {
    res.status(400).json({ message: "App updates signing not configured" });
    return;
  }

  const configs = loadConfig();
  const config = configs.find((c) => c.appId.toLowerCase() === parsed.data.appId.toLowerCase()) ?? null;
  if (!config) {
    res.status(404).json({ message: "Not found" });
    return;
  }

  const rootAbs = resolveUpdateRoot();
  const storeBaseUrl = resolveStoreBaseUrl();

  const latest = rootAbs ? await findLatestApkForApp({ rootAbs, config }) : null;
  const latestFromStore = !latest && storeBaseUrl ? await findLatestApkFromStoreManifest({ storeBaseUrl, config }) : null;
  const chosenLatest = latest ?? latestFromStore;
  if (!chosenLatest) {
    if (!rootAbs && !storeBaseUrl) {
      res.status(400).json({ message: "App updates not configured" });
      return;
    }
    res.status(404).json({ message: "No releases found" });
    return;
  }

  res.json({ latest: chosenLatest });
});

appUpdatesRouter.get("/download", async (req, res) => {
  const parsed = DownloadQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const tokenInfo = verifyToken(parsed.data.token);
  if (!tokenInfo) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const configs = loadConfig();
  const config = configs.find((c) => c.appId.toLowerCase() === tokenInfo.appId.toLowerCase()) ?? null;
  if (!config) {
    res.status(404).json({ message: "Not found" });
    return;
  }

  if (!tokenInfo.fileName.toLowerCase().startsWith(config.prefix.toLowerCase())) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const storeBaseUrl = resolveStoreBaseUrl();
  if (storeBaseUrl) {
    const target = `${storeBaseUrl}/apk/${encodeURIComponent(tokenInfo.fileName)}`;
    if (!env.APP_UPDATE_STORE_PROXY_DOWNLOAD) {
      res.redirect(302, target);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5 * 60 * 1000);
    try {
      const upstream = await fetch(target, { method: "GET", signal: controller.signal });
      if (!upstream.ok) {
        res.status(502).json({ message: `Upstream download failed: HTTP ${upstream.status}` });
        return;
      }

      const contentLength = upstream.headers.get("content-length");
      res.setHeader("Content-Type", "application/vnd.android.package-archive");
      if (contentLength) res.setHeader("Content-Length", contentLength);
      res.setHeader("Content-Disposition", `attachment; filename=\"${tokenInfo.fileName.replace(/"/g, "")}\"`);

      if (!upstream.body) {
        res.status(502).json({ message: "Upstream response missing body" });
        return;
      }

      const body = Readable.fromWeb(upstream.body as unknown as Parameters<typeof Readable.fromWeb>[0]);
      body.on("error", () => {
        if (!res.headersSent) {
          res.status(502).end();
          return;
        }
        res.end();
      });
      body.pipe(res);
      return;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Upstream download failed";
      res.status(502).json({ message });
      return;
    } finally {
      clearTimeout(timeout);
    }
    return;
  }

  const rootAbs = resolveUpdateRoot();
  if (!rootAbs) {
    res.status(400).json({ message: "App updates not configured" });
    return;
  }

  const dirAbs = path.resolve(rootAbs, config.directory);
  const fileAbs = path.resolve(dirAbs, tokenInfo.fileName);
  const dirPrefix = dirAbs.endsWith(path.sep) ? dirAbs : `${dirAbs}${path.sep}`;
  if (!fileAbs.startsWith(dirPrefix)) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  let st: fs.Stats;
  try {
    st = await fs.promises.stat(fileAbs);
  } catch {
    res.status(404).json({ message: "Not found" });
    return;
  }
  if (!st.isFile()) {
    res.status(404).json({ message: "Not found" });
    return;
  }

  res.setHeader("Content-Type", "application/vnd.android.package-archive");
  res.setHeader("Content-Length", String(st.size));
  res.setHeader("Content-Disposition", `attachment; filename=\"${tokenInfo.fileName.replace(/"/g, "")}\"`);

  const stream = fs.createReadStream(fileAbs);
  stream.on("error", () => {
    if (!res.headersSent) {
      res.status(500).end();
      return;
    }
    res.end();
  });
  stream.pipe(res);
});
