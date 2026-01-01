import jwt from "jsonwebtoken";
import { env } from "../config/env";

export interface JwtClaims {
  sub: string;
  username: string;
  roles: string[];
}

export const signAccessToken = (claims: JwtClaims) =>
  jwt.sign(claims, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
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

