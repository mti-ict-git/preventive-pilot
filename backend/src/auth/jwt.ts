import jwt from "jsonwebtoken";
import type { Secret, SignOptions } from "jsonwebtoken";
import { env } from "../config/env.js";

export interface JwtClaims {
  sub: string;
  username: string;
  roles: string[];
}

export const signAccessToken = (claims: JwtClaims) =>
  jwt.sign(claims, env.JWT_SECRET as Secret, {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"],
  });

export const verifyAccessToken = (token: string): JwtClaims => {
  const decoded = jwt.verify(token, env.JWT_SECRET);
  if (typeof decoded !== "object" || decoded === null) throw new Error("Invalid token");

  const sub = "sub" in decoded && typeof decoded.sub === "string" ? decoded.sub : null;
  const username =
    "username" in decoded && typeof decoded.username === "string" ? decoded.username : null;
  const roles =
    "roles" in decoded && Array.isArray(decoded.roles)
      ? decoded.roles.filter((r): r is string => typeof r === "string")
      : null;

  if (!sub || !username || !roles) throw new Error("Invalid token");
  return { sub, username, roles };
};

export interface RefreshClaims extends JwtClaims {
  refresh: true;
}

export const signRefreshToken = (claims: JwtClaims) =>
  jwt.sign({ ...claims, refresh: true } satisfies RefreshClaims, env.JWT_SECRET as Secret, {
    expiresIn: (env as { REFRESH_TOKEN_EXPIRES_IN?: string }).REFRESH_TOKEN_EXPIRES_IN as SignOptions["expiresIn"],
  });

export const verifyRefreshToken = (token: string): RefreshClaims => {
  const decoded = jwt.verify(token, env.JWT_SECRET);
  if (typeof decoded !== "object" || decoded === null) throw new Error("Invalid token");

  const sub = "sub" in decoded && typeof decoded.sub === "string" ? decoded.sub : null;
  const username =
    "username" in decoded && typeof decoded.username === "string" ? decoded.username : null;
  const roles =
    "roles" in decoded && Array.isArray(decoded.roles)
      ? decoded.roles.filter((r): r is string => typeof r === "string")
      : null;
  const refresh = "refresh" in decoded && (decoded as { refresh?: unknown }).refresh === true;

  if (!sub || !username || !roles || !refresh) throw new Error("Invalid token");
  return { sub, username, roles, refresh: true };
};
