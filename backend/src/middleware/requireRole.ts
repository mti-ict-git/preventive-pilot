import type { NextFunction, Request, Response } from "express";
import sql from "mssql";
import { getDb } from "../db/mssql.js";

export const requireAnyRole = (roles: readonly string[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const normalizeRole = (value: string): string => value.trim().toLowerCase();
    const hasRequiredRole = (userRoles: readonly string[]) => {
      const userRoleSet = new Set(userRoles.map(normalizeRole));
      return roles.some((r) => userRoleSet.has(normalizeRole(r)));
    };

    if (hasRequiredRole(req.user.roles)) {
      next();
      return;
    }

    try {
      const db = await getDb();
      const result = await db
        .request()
        .input("userId", sql.UniqueIdentifier, req.user.sub)
        .query(
          [
            "SELECT r.Name AS RoleName",
            "FROM pm.UserRoles ur",
            "INNER JOIN pm.Roles r ON r.RoleId = ur.RoleId",
            "WHERE ur.UserId = @userId",
          ].join("\n"),
        );
      const dbRoles = (result.recordset as Array<{ RoleName?: unknown }>)
        .map((row) => (typeof row.RoleName === "string" ? row.RoleName : null))
        .filter((value): value is string => Boolean(value));

      if (dbRoles.length > 0) {
        req.user.roles = dbRoles;
      }

      if (hasRequiredRole(dbRoles)) {
        next();
        return;
      }
    } catch {}

    res.status(403).json({ message: "Forbidden" });
  };
};

export const requireSuperadmin = requireAnyRole(["Superadmin"]);

export const requireManager = requireAnyRole(["Superadmin", "Admin", "Supervisor"]);
