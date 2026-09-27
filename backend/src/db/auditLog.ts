import sql from "mssql";
import { getDb } from "./mssql.js";

type SqlExecutor = {
  request(): sql.Request;
};

export const writeAuditLog = async (input: {
  executor?: SqlExecutor;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
}): Promise<void> => {
  const executor = input.executor ?? (await getDb());
  const metadata = JSON.stringify(input.metadata);
  await executor
    .request()
    .input("actorUserId", sql.UniqueIdentifier, input.actorUserId)
    .input("action", sql.NVarChar(128), input.action)
    .input("entityType", sql.NVarChar(128), input.entityType)
    .input("entityId", sql.UniqueIdentifier, input.entityId)
    .input("metadata", sql.NVarChar(sql.MAX), metadata)
    .input("ipAddress", sql.NVarChar(64), input.ipAddress)
    .input("userAgent", sql.NVarChar(512), input.userAgent)
    .query(
      [
        "INSERT INTO pm.AuditLog (",
        "  ActorUserId, Action, EntityType, EntityId, Metadata, IpAddress, UserAgent",
        ")",
        "VALUES (",
        "  @actorUserId, @action, @entityType, @entityId, @metadata, @ipAddress, @userAgent",
        ")",
      ].join("\n"),
    );
};
