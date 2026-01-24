import { Router } from "express";
import { z } from "zod";
import sql from "mssql";
import { getDb } from "../db/mssql.js";
import { requireAuth } from "../middleware/requireAuth.js";

const RegisterDeviceSchema = z.object({
  platform: z.string().min(2).max(32),
  token: z.string().min(10).max(512),
});

export const devicesRouter = Router();

devicesRouter.use(requireAuth);

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

