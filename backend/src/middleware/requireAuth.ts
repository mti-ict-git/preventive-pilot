import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken, type JwtClaims } from "../auth/jwt";

declare module "express-serve-static-core" {
  interface Request {
    user: JwtClaims;
  }
}

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const header = req.header("authorization");
  if (!header) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    res.status(401).json({ message: "Unauthorized" });
  }
};

