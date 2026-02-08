import { Router } from "express";
import { z } from "zod";
import sql from "mssql";
import { readFile } from "node:fs/promises";
import { Buffer } from "node:buffer";
import { cert, getApps, initializeApp, type ServiceAccount } from "firebase-admin/app";
import { getMessaging, type Messaging } from "firebase-admin/messaging";
import { getDb } from "../db/mssql.js";
import { env } from "../config/env.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireAnyRole } from "../middleware/requireRole.js";

const allowedPlatforms = ["ios", "android", "web"] as const;

const isAllowedPlatform = (value: string): value is (typeof allowedPlatforms)[number] =>
  allowedPlatforms.includes(value as (typeof allowedPlatforms)[number]);

const allowedAudiences = ["all", "technician", "supervisor", "superadmin"] as const;

const isAllowedAudience = (value: string): value is (typeof allowedAudiences)[number] =>
  allowedAudiences.includes(value as (typeof allowedAudiences)[number]);

const RegisterDeviceSchema = z.object({
  platform: z
    .string()
    .trim()
    .transform((value) => value.toLowerCase())
    .refine((value) => isAllowedPlatform(value), { message: "Invalid platform" }),
  token: z.string().min(10).max(512),
});

const PushTestSchema = z
  .object({
    title: z.string().trim().min(1).max(64).optional(),
    body: z.string().trim().min(1).max(256).optional(),
  })
  .optional();

const PushBroadcastSchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(2000),
  audience: z
    .string()
    .trim()
    .transform((value) => value.toLowerCase())
    .refine((value) => isAllowedAudience(value), { message: "Invalid audience" })
    .optional()
    .default("all"),
});

export type PushBroadcastRequest = z.infer<typeof PushBroadcastSchema>;

export const devicesRouter = Router();

devicesRouter.use(requireAuth);

let messagingPromise: Promise<Messaging | null> | null = null;

const getFirebaseMessaging = async (): Promise<Messaging | null> => {
  if (messagingPromise) return messagingPromise;

  messagingPromise = (async () => {
    try {
      const jsonBase64 = (env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 ?? "").trim();
      const path = (env.FIREBASE_SERVICE_ACCOUNT_PATH ?? "").trim();

      let rawJson = "";
      if (jsonBase64) {
        rawJson = Buffer.from(jsonBase64, "base64").toString("utf8");
      } else if (path) {
        rawJson = await readFile(path, "utf8");
      } else {
        const fallbackPath = "./firebase-adminsdk.json";
        try {
          rawJson = await readFile(fallbackPath, "utf8");
        } catch {
          console.warn("Firebase service account file not found at ./firebase-adminsdk.json");
          return null;
        }
      }

      const serviceAccount = JSON.parse(rawJson) as ServiceAccount;
      if (getApps().length === 0) {
        initializeApp({ credential: cert(serviceAccount) });
      }
      return getMessaging();
    } catch {
      console.warn("Firebase service account failed to initialize");
      messagingPromise = null;
      return null;
    }
  })();

  return messagingPromise;
};

const sendPush = async (input: {
  token: string;
  title: string;
  body: string;
  data: Record<string, string>;
}): Promise<void> => {
  const messaging = await getFirebaseMessaging();
  if (messaging) {
    await messaging.send({
      token: input.token,
      notification: { title: input.title, body: input.body },
      data: input.data,
    });
    return;
  }

  const key = (env.FCM_SERVER_KEY ?? "").trim();
  if (!key) throw new Error("FCM not configured");

  const res = await fetch("https://fcm.googleapis.com/fcm/send", {
    method: "POST",
    headers: {
      Authorization: "key=" + key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: input.token,
      notification: { title: input.title, body: input.body },
      data: input.data,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`FCM send failed (${res.status}): ${text.slice(0, 200)}`);
  }
};

const getErrorInfo = (err: unknown): { message: string; code: string | null } => {
  const message = err instanceof Error ? err.message : "Unknown error";
  const codeRaw =
    typeof err === "object" && err !== null && "code" in err
      ? (err as { code?: unknown }).code
      : undefined;
  const code = typeof codeRaw === "string" && codeRaw.trim() ? codeRaw.trim() : null;
  return { message, code };
};

const getRoleNamesForAudience = (
  audience: (typeof allowedAudiences)[number],
): string[] => {
  if (audience === "technician") {
    return ["technician", "pm tech", "pm_tech", "pm technician", "pm-technician"];
  }
  if (audience === "supervisor") {
    return ["supervisor"];
  }
  if (audience === "superadmin") {
    return ["superadmin", "super admin"];
  }
  return [];
};

devicesRouter.post("/register", async (req, res) => {
  const parsed = RegisterDeviceSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ ok: false });
    return;
  }

  const userId = req.user.sub;
  const platform = parsed.data.platform;
  const token = parsed.data.token.trim();

  const db = await getDb();
  await db
    .request()
    .input("userId", sql.UniqueIdentifier, userId)
    .input("platform", sql.NVarChar(32), platform)
    .input("token", sql.NVarChar(512), token)
    .query(
      [
        "DECLARE @now datetime2(0) = sysutcdatetime();",
        "IF EXISTS (",
        "  SELECT 1",
        "  FROM pm.Devices",
        "  WHERE Token = @token",
        "    AND Platform = @platform",
        ")",
        "BEGIN",
        "  UPDATE pm.Devices",
        "  SET UserId = @userId,",
        "      IsActive = 1,",
        "      LastSeenAt = @now,",
        "      UpdatedAt = @now",
        "  WHERE Token = @token",
        "    AND Platform = @platform;",
        "END",
        "ELSE",
        "BEGIN",
        "  INSERT INTO pm.Devices (UserId, Platform, Token, IsActive, LastSeenAt, CreatedAt, UpdatedAt)",
        "  VALUES (@userId, @platform, @token, 1, @now, @now, @now);",
        "END",
      ].join("\n"),
    );

  res.json({ ok: true });
});

devicesRouter.post("/push-test", async (req, res) => {
  const parsed = PushTestSchema.safeParse(req.body ?? undefined);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const userId = req.user.sub;
  const sentAt = new Date().toISOString();
  const title = parsed.data?.title ?? "Push Test";
  const body = parsed.data?.body ?? `Preventive Pilot push test at ${sentAt}`;

  const legacyKeyPresent = Boolean((env.FCM_SERVER_KEY ?? "").trim());
  const messaging = await getFirebaseMessaging();
  if (!messaging && !legacyKeyPresent) {
    res.status(400).json({
      message: "Push not configured. Set FIREBASE_SERVICE_ACCOUNT_PATH (recommended) or FCM_SERVER_KEY.",
    });
    return;
  }

  const db = await getDb();
  const tokensResult = await db
    .request()
    .input("userId", sql.UniqueIdentifier, userId)
    .query(
      [
        "SELECT Token AS Token, Platform AS Platform",
        "FROM pm.Devices",
        "WHERE UserId = @userId",
        "  AND IsActive = 1",
      ].join("\n"),
    );

  const tokens = tokensResult.recordset as Array<{ Token: string; Platform: string }>;
  if (tokens.length === 0) {
    res.status(400).json({ message: "No device tokens registered" });
    return;
  }

  let sent = 0;
  let failed = 0;
  const failures: Array<{ platform: string; message: string; code: string | null }> = [];

  for (const row of tokens) {
    try {
      const token = row.Token;
      await sendPush({
        token,
        title,
        body,
        data: {
          kind: "push_test",
          sentAt,
          platform: row.Platform,
          dataTitle: title.slice(0, 120),
          dataBody: body.slice(0, 512),
        },
      });
      sent += 1;
    } catch (err: unknown) {
      failed += 1;
      const info = getErrorInfo(err);
      failures.push({ platform: row.Platform, message: info.message, code: info.code });
    }
  }

  res.json({
    ok: true,
    attempted: tokens.length,
    sent,
    failed,
    configUsed: messaging ? "firebase-admin" : "fcm-legacy",
    failures,
  });
});

devicesRouter.post("/push-broadcast", requireAnyRole(["Superadmin", "Admin"]), async (req, res) => {
  const parsed = PushBroadcastSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request", code: "invalid_request", issues: parsed.error.issues });
    return;
  }

  const legacyKeyPresent = Boolean((env.FCM_SERVER_KEY ?? "").trim());
  const messaging = await getFirebaseMessaging();
  if (!messaging && !legacyKeyPresent) {
    res.status(400).json({
      message: "Push not configured. Set FIREBASE_SERVICE_ACCOUNT_PATH (recommended) or FCM_SERVER_KEY.",
    });
    return;
  }

  const db = await getDb();
  const audience = parsed.data.audience ?? "all";
  const request = db.request();
  const roleNames = audience === "all" ? [] : getRoleNamesForAudience(audience);
  if (audience !== "all" && roleNames.length > 0) {
    roleNames.forEach((role, i) => {
      request.input(`role${i}`, sql.NVarChar(64), role);
    });
  }

  const roleClause =
    roleNames.length > 0
      ? `AND LOWER(r.Name) IN (${roleNames.map((_, i) => `@role${i}`).join(", ")})`
      : "AND LOWER(r.Name) = @role";

  if (audience !== "all" && roleNames.length === 0) {
    request.input("role", sql.NVarChar(64), audience);
  }

  const tokensResult = await request.query(
    audience === "all"
      ? [
          "SELECT Token AS Token, Platform AS Platform",
          "FROM pm.Devices",
          "WHERE IsActive = 1",
        ].join("\n")
      : [
          "SELECT d.Token AS Token, d.Platform AS Platform",
          "FROM pm.Devices d",
          "INNER JOIN pm.Users u ON u.UserId = d.UserId",
          "INNER JOIN pm.UserRoles ur ON ur.UserId = u.UserId",
          "INNER JOIN pm.Roles r ON r.RoleId = ur.RoleId",
          "WHERE d.IsActive = 1",
          `  ${roleClause}`,
        ].join("\n"),
  );

  const tokens = tokensResult.recordset as Array<{ Token: string; Platform: string }>;
  if (tokens.length === 0) {
    res.status(400).json({ message: "No device tokens registered", code: "no_tokens" });
    return;
  }

  let sent = 0;
  let failed = 0;
  const errors: Array<{ token: string; message: string; code: string | null }> = [];

  for (const row of tokens) {
    try {
      await sendPush({
        token: row.Token,
        title: parsed.data.title,
        body: parsed.data.body,
        data: {
          kind: "broadcast",
          audience,
          platform: row.Platform,
          dataTitle: parsed.data.title.slice(0, 120),
          dataBody: parsed.data.body.slice(0, 512),
        },
      });
      sent += 1;
    } catch (err: unknown) {
      failed += 1;
      const info = getErrorInfo(err);
      errors.push({ token: row.Token, message: info.message, code: info.code });
      console.warn("[push-broadcast] failed", { message: info.message, code: info.code });
    }
  }

  console.info("[push-broadcast] completed", {
    audience,
    attempted: tokens.length,
    sent,
    failed,
  });

  res.json({
    ok: true,
    attempted: tokens.length,
    sent,
    failed,
    configUsed: messaging ? "firebase-admin" : "fcm-legacy",
    errors,
  });
});
