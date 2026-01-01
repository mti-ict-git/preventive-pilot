import { Router } from "express";
import { z } from "zod";
import { authenticateWithLdap } from "../auth/ldap";
import { signAccessToken } from "../auth/jwt";
import { authenticateLocalUser, upsertLdapUser } from "../db/users";
import { requireAuth } from "../middleware/requireAuth";

const LoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  provider: z.enum(["ldap", "local"]).default("ldap"),
});

export const authRouter = Router();

authRouter.post("/login", async (req, res) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  try {
    if (parsed.data.provider === "local") {
      const user = await authenticateLocalUser({
        username: parsed.data.username,
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

    const profile = await authenticateWithLdap(parsed.data.username, parsed.data.password);
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

