import { Router } from "express";
import { z } from "zod";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { Buffer } from "node:buffer";
import { env } from "../config/env.js";

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

  const ttlSeconds = env.APP_UPDATE_TOKEN_TTL_SECONDS;
  const signingSecret = (env.APP_UPDATE_SIGNING_SECRET ?? "").trim();
  if (!signingSecret) return null;

  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const tokenPayload = JSON.stringify({ appId: input.config.appId, fileName: chosen.fileName, exp: expiresAt });
  const sig = crypto.createHmac("sha256", signingSecret).update(tokenPayload).digest("hex");
  const token = Buffer.from(tokenPayload, "utf8").toString("base64url") + "." + sig;

  return {
    appId: input.config.appId,
    versionName: chosen.versionName,
    fileName: chosen.fileName,
    sizeBytes: chosen.st.size,
    sha256,
    modifiedAt: chosen.st.mtime.toISOString(),
    downloadUrl: `/api/app-updates/download?token=${encodeURIComponent(token)}`,
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

  const rootAbs = resolveUpdateRoot();
  if (!rootAbs) {
    res.status(400).json({ message: "App updates not configured" });
    return;
  }

  const configs = loadConfig();
  const config = configs.find((c) => c.appId.toLowerCase() === parsed.data.appId.toLowerCase()) ?? null;
  if (!config) {
    res.status(404).json({ message: "Not found" });
    return;
  }

  const latest = await findLatestApkForApp({ rootAbs, config });
  if (!latest) {
    res.status(404).json({ message: "No releases found" });
    return;
  }

  res.json({ latest });
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

  const rootAbs = resolveUpdateRoot();
  if (!rootAbs) {
    res.status(400).json({ message: "App updates not configured" });
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
