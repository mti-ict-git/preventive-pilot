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

const RegisterDeviceSchema = z.object({
  platform: z.string().min(2).max(32),
  token: z.string().min(10).max(512),
});

const PushTestSchema = z
  .object({
    title: z.string().trim().min(1).max(64).optional(),
    body: z.string().trim().min(1).max(256).optional(),
  })
  .optional();

export const devicesRouter = Router();

devicesRouter.use(requireAuth);

let messagingPromise: Promise<Messaging | null> | null = null;

const getFirebaseMessaging = async (): Promise<Messaging | null> => {
  if (messagingPromise) return messagingPromise;

  messagingPromise = (async () => {
    const jsonBase64 = (env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 ?? "").trim();
    const path = (env.FIREBASE_SERVICE_ACCOUNT_PATH ?? "").trim();

    let rawJson = "";
    if (jsonBase64) {
      rawJson = Buffer.from(jsonBase64, "base64").toString("utf8");
    } else if (path) {
      rawJson = await readFile(path, "utf8");
    } else {
      return null;
    }

    const serviceAccount = JSON.parse(rawJson) as ServiceAccount;
    if (getApps().length === 0) {
      initializeApp({ credential: cert(serviceAccount) });
    }
    return getMessaging();
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
  if (!res.ok) throw new Error("FCM send failed");
};

devicesRouter.post("/register", async (req, res) => {
  const parsed = RegisterDeviceSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ ok: false });
    return;
  }

  const userId = req.user.sub;
  const platform = parsed.data.platform.trim().toLowerCase();
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
        },
      });
      sent += 1;
    } catch {
      failed += 1;
    }
  }

  res.json({ ok: true, attempted: tokens.length, sent, failed });
});
