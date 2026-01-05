import sql from "mssql";
import bcrypt from "bcryptjs";
import { getDb } from "./mssql.js";

export interface UserRecord {
  userId: string;
  username: string;
  displayName: string | null;
  email: string | null;
  roles: string[];
}

const ensureRole = async (roleName: string) => {
  const db = await getDb();
  const existing = await db
    .request()
    .input("name", sql.NVarChar(64), roleName)
    .query("SELECT TOP (1) RoleId FROM pm.Roles WHERE Name = @name");

  const existingRoleId = existing.recordset[0]?.RoleId as string | undefined;
  if (existingRoleId) return existingRoleId;

  const inserted = await db
    .request()
    .input("name", sql.NVarChar(64), roleName)
    .query("INSERT INTO pm.Roles (Name) OUTPUT inserted.RoleId AS RoleId VALUES (@name)");

  const roleId = inserted.recordset[0]?.RoleId as string | undefined;
  if (!roleId) throw new Error("Failed to create role");
  return roleId;
};

const loadUserRoles = async (userId: string) => {
  const db = await getDb();
  const result = await db
    .request()
    .input("userId", sql.UniqueIdentifier, userId)
    .query(
      [
        "SELECT r.Name AS RoleName",
        "FROM pm.UserRoles ur",
        "INNER JOIN pm.Roles r ON r.RoleId = ur.RoleId",
        "WHERE ur.UserId = @userId",
      ].join("\n"),
    );

  const rows = result.recordset as Array<{ RoleName: unknown }>;
  return rows
    .map((row) => (typeof row.RoleName === "string" ? row.RoleName : null))
    .filter((value): value is string => Boolean(value));
};

export const upsertLdapUser = async (input: {
  username: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  externalId: string;
  roles: string[];
}): Promise<UserRecord> => {
  const db = await getDb();
  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    const upserted = await tx
      .request()
      .input("username", sql.NVarChar(128), input.username)
      .input("displayName", sql.NVarChar(256), input.displayName)
      .input("email", sql.NVarChar(256), input.email)
      .input("phone", sql.NVarChar(32), input.phone)
      .input("externalProvider", sql.NVarChar(64), "ldap")
      .input("externalId", sql.NVarChar(128), input.externalId)
      .query(
        [
          "MERGE pm.Users WITH (HOLDLOCK) AS target",
          "USING (SELECT @username AS Username) AS source",
          "ON target.Username = source.Username",
          "WHEN MATCHED THEN",
          "  UPDATE SET",
          "    DisplayName = @displayName,",
          "    Email = @email,",
          "    Phone = @phone,",
          "    ExternalProvider = @externalProvider,",
          "    ExternalId = @externalId,",
          "    UpdatedAt = sysutcdatetime()",
          "WHEN NOT MATCHED THEN",
          "  INSERT (Username, DisplayName, Email, Phone, ExternalProvider, ExternalId)",
          "  VALUES (@username, @displayName, @email, @phone, @externalProvider, @externalId)",
          "OUTPUT inserted.UserId AS UserId, inserted.Username AS Username, inserted.DisplayName AS DisplayName, inserted.Email AS Email;",
        ].join("\n"),
      );

    const userRow = upserted.recordset[0] as
      | { UserId: string; Username: string; DisplayName: string | null; Email: string | null }
      | undefined;
    if (!userRow) throw new Error("Failed to upsert user");

    const roleIds = [] as string[];
    for (const role of input.roles) {
      const roleId = await ensureRole(role);
      roleIds.push(roleId);
      await tx
        .request()
        .input("userId", sql.UniqueIdentifier, userRow.UserId)
        .input("roleId", sql.UniqueIdentifier, roleId)
        .query(
          [
            "IF NOT EXISTS (SELECT 1 FROM pm.UserRoles WHERE UserId = @userId AND RoleId = @roleId)",
            "BEGIN",
            "  INSERT INTO pm.UserRoles (UserId, RoleId) VALUES (@userId, @roleId)",
            "END",
          ].join("\n"),
        );
    }

    await tx.commit();

    const roles = await loadUserRoles(userRow.UserId);
    return {
      userId: userRow.UserId,
      username: userRow.Username,
      displayName: userRow.DisplayName,
      email: userRow.Email,
      roles,
    };
  } catch (err) {
    await tx.rollback().catch(() => undefined);
    throw err;
  }
};

export const ensureLocalSuperadmin = async (input: {
  username: string;
  password: string;
}): Promise<void> => {
  const db = await getDb();
  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    const roleId = await ensureRole("Superadmin");
    const hashed = await bcrypt.hash(input.password, 12);

    const upserted = await tx
      .request()
      .input("username", sql.NVarChar(128), input.username)
      .input("displayName", sql.NVarChar(256), "Local Superadmin")
      .input("externalProvider", sql.NVarChar(64), "local")
      .input("externalId", sql.NVarChar(128), `local:${input.username}`)
      .query(
        [
          "MERGE pm.Users WITH (HOLDLOCK) AS target",
          "USING (SELECT @username AS Username) AS source",
          "ON target.Username = source.Username",
          "WHEN MATCHED THEN",
          "  UPDATE SET",
          "    DisplayName = @displayName,",
          "    ExternalProvider = @externalProvider,",
          "    ExternalId = @externalId,",
          "    IsActive = 1,",
          "    UpdatedAt = sysutcdatetime()",
          "WHEN NOT MATCHED THEN",
          "  INSERT (Username, DisplayName, ExternalProvider, ExternalId)",
          "  VALUES (@username, @displayName, @externalProvider, @externalId)",
          "OUTPUT inserted.UserId AS UserId;",
        ].join("\n"),
      );

    const userId = upserted.recordset[0]?.UserId as string | undefined;
    if (!userId) throw new Error("Failed to upsert local superadmin user");

    await tx
      .request()
      .input("userId", sql.UniqueIdentifier, userId)
      .input("roleId", sql.UniqueIdentifier, roleId)
      .query(
        [
          "IF NOT EXISTS (SELECT 1 FROM pm.UserRoles WHERE UserId = @userId AND RoleId = @roleId)",
          "BEGIN",
          "  INSERT INTO pm.UserRoles (UserId, RoleId) VALUES (@userId, @roleId)",
          "END",
        ].join("\n"),
      );

    await tx
      .request()
      .input("userId", sql.UniqueIdentifier, userId)
      .input("passwordHash", sql.NVarChar(255), hashed)
      .query(
        [
          "MERGE pm.UserCredentials WITH (HOLDLOCK) AS target",
          "USING (SELECT @userId AS UserId) AS source",
          "ON target.UserId = source.UserId",
          "WHEN MATCHED THEN",
          "  UPDATE SET",
          "    PasswordHash = @passwordHash,",
          "    PasswordUpdatedAt = sysutcdatetime(),",
          "    UpdatedAt = sysutcdatetime()",
          "WHEN NOT MATCHED THEN",
          "  INSERT (UserId, PasswordHash)",
          "  VALUES (@userId, @passwordHash);",
        ].join("\n"),
      );

    await tx.commit();
  } catch (err) {
    await tx.rollback().catch(() => undefined);
    throw err;
  }
};

export const authenticateLocalUser = async (input: {
  identifier: string;
  password: string;
}): Promise<UserRecord> => {
  const trimmed = input.identifier.trim();
  const usernameCandidate = trimmed.includes("@")
    ? trimmed.slice(0, Math.max(0, trimmed.indexOf("@")))
    : null;

  const db = await getDb();
  const userResult = await db
    .request()
    .input("identifier", sql.NVarChar(256), trimmed)
    .input("usernameCandidate", sql.NVarChar(128), usernameCandidate)
    .query(
      [
        "SELECT TOP (1)",
        "  u.UserId AS UserId,",
        "  u.Username AS Username,",
        "  u.DisplayName AS DisplayName,",
        "  u.Email AS Email,",
        "  c.PasswordHash AS PasswordHash",
        "FROM pm.Users u",
        "INNER JOIN pm.UserCredentials c ON c.UserId = u.UserId",
        "WHERE",
        "  u.IsActive = 1",
        "  AND (",
        "    u.Username = @identifier",
        "    OR u.Email = @identifier",
        "    OR (@usernameCandidate IS NOT NULL AND u.Username = @usernameCandidate)",
        "  )",
      ].join("\n"),
    );

  const row = userResult.recordset[0] as
    | {
        UserId: string;
        Username: string;
        DisplayName: string | null;
        Email: string | null;
        PasswordHash: string;
      }
    | undefined;

  if (!row) throw new Error("Invalid username or password");
  const ok = await bcrypt.compare(input.password, row.PasswordHash);
  if (!ok) throw new Error("Invalid username or password");

  const roles = await loadUserRoles(row.UserId);
  return {
    userId: row.UserId,
    username: row.Username,
    displayName: row.DisplayName,
    email: row.Email,
    roles,
  };
};
