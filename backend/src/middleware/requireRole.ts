import type { NextFunction, Request, Response } from "express";

export const requireAnyRole = (roles: readonly string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const normalizeRole = (value: string): string => value.trim().toLowerCase();
    const userRoleSet = new Set(req.user.roles.map(normalizeRole));
    if (roles.some((r) => userRoleSet.has(normalizeRole(r)))) {
      next();
      return;
    }

    res.status(403).json({ message: "Forbidden" });
  };
};

export const requireSuperadmin = requireAnyRole(["Superadmin"]);

export const requireManager = requireAnyRole(["Superadmin", "Admin", "Supervisor"]);
