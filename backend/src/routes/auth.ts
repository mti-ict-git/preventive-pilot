import { Router } from "express";
import { z } from "zod";
import { authenticateWithLdap } from "../auth/ldap.js";
import { signAccessToken } from "../auth/jwt.js";
import { authenticateLocalUser, upsertLdapUser } from "../db/users.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { getDb } from "../db/mssql.js";
import sql from "mssql";

const LoginSchema = z
  .object({
    identifier: z.string().min(1).optional(),
    username: z.string().min(1).optional(),
    password: z.string().min(1),
    provider: z.enum(["ldap", "local"]).default("ldap"),
  })
  .transform((data) => ({
    identifier: (data.identifier ?? data.username ?? "").trim(),
    password: data.password,
    provider: data.provider,
  }));

export const authRouter = Router();

authRouter.post("/login", async (req, res) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  if (!parsed.data.identifier) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  try {
    if (parsed.data.provider === "local") {
      const user = await authenticateLocalUser({
        identifier: parsed.data.identifier,
        password: parsed.data.password,
      });

      const accessToken = signAccessToken({
        sub: user.userId,
        username: user.username,
        roles: user.roles,
      });

      res.json({
        accessToken,
        user: {
          id: user.userId,
          username: user.username,
          displayName: user.displayName,
          email: user.email,
          roles: user.roles,
        },
      });
      return;
    }

    const profile = await authenticateWithLdap(parsed.data.identifier, parsed.data.password);
    const roles = profile.isSuperadmin ? ["Superadmin"] : ["Viewer"];
    const user = await upsertLdapUser({
      username: profile.username,
      displayName: profile.displayName,
      email: profile.email,
      phone: profile.phone,
      externalId: profile.dn,
      roles,
    });

    const accessToken = signAccessToken({
      sub: user.userId,
      username: user.username,
      roles: user.roles,
    });

    res.json({
      accessToken,
      user: {
        id: user.userId,
        username: user.username,
        displayName: user.displayName,
        email: user.email,
        roles: user.roles,
      },
    });
  } catch {
    res.status(401).json({ message: "Invalid username or password" });
  }
});

authRouter.get("/me", requireAuth, async (req, res) => {
  res.json({
    user: {
      id: req.user.sub,
      username: req.user.username,
      roles: req.user.roles,
    },
  });
});

const ThemeModeSchema = z.enum(["dark", "light"]);
const PreferencesSchema = z.object({
  themeMode: ThemeModeSchema.nullable().optional(),
  themePalette: z.string().trim().max(64).nullable().optional(),
});

authRouter.get("/me/preferences", requireAuth, async (req, res) => {
  const db = await getDb();
  const result = await db
    .request()
    .input("userId", sql.UniqueIdentifier, req.user.sub)
    .query(
      [
        "SELECT ThemeMode, ThemePalette",
        "FROM pm.Users",
        "WHERE UserId = @userId",
      ].join("\n"),
    );

  const row = result.recordset[0] as { ThemeMode: unknown; ThemePalette: unknown } | undefined;
  const themeMode = typeof row?.ThemeMode === "string" ? row?.ThemeMode : null;
  const themePalette = typeof row?.ThemePalette === "string" ? row?.ThemePalette : null;
  res.json({ themeMode, themePalette });
});

authRouter.put("/me/preferences", requireAuth, async (req, res) => {
  const parsed = PreferencesSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const db = await getDb();
  const themeMode = parsed.data.themeMode ?? null;
  const themePalette = parsed.data.themePalette ?? null;

  await db
    .request()
    .input("userId", sql.UniqueIdentifier, req.user.sub)
    .input("themeMode", sql.NVarChar(16), themeMode)
    .input("themePalette", sql.NVarChar(64), themePalette)
    .query(
      [
        "UPDATE pm.Users",
        "SET ThemeMode = @themeMode,",
        "    ThemePalette = @themePalette,",
        "    UpdatedAt = sysutcdatetime()",
        "WHERE UserId = @userId",
      ].join("\n"),
    );

  res.json({ ok: true });
});
