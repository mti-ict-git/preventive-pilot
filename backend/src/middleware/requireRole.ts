import type { NextFunction, Request, Response } from "express";

export const requireAnyRole = (roles: readonly string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const userRoles = req.user.roles;
    if (roles.some((r) => userRoles.includes(r))) {
      next();
      return;
    }

    res.status(403).json({ message: "Forbidden" });
  };
};

export const requireSuperadmin = requireAnyRole(["Superadmin"]);

export const requireManager = requireAnyRole(["Superadmin", "Admin", "Supervisor"]);
