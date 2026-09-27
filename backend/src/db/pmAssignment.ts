import sql from "mssql";

type SqlExecutor = {
  request(): sql.Request;
};

export const resolvePmAssignment = async (input: {
  executor: SqlExecutor;
  templateId: string;
  categoryId: string | null;
  locationId: string | null;
  assetStatus: string | null;
  requiredRoleId: string | null;
}): Promise<{
  assignToUserId: string | null;
  assignToRoleId: string | null;
}> => {
  const result = await input.executor
    .request()
    .input("categoryId", sql.UniqueIdentifier, input.categoryId)
    .input("locationId", sql.UniqueIdentifier, input.locationId)
    .input("assetStatus", sql.NVarChar(64), input.assetStatus)
    .query(
      [
        "SELECT TOP (1)",
        "  AssignToUserId,",
        "  AssignToRoleId",
        "FROM pm.AssignmentRules",
        "WHERE",
        "  IsActive = 1",
        "  AND (CategoryId IS NULL OR CategoryId = @categoryId)",
        "  AND (LocationId IS NULL OR LocationId = @locationId)",
        "  AND (AssetStatus IS NULL OR AssetStatus = @assetStatus)",
        "  AND (EffectiveFrom IS NULL OR EffectiveFrom <= sysutcdatetime())",
        "  AND (EffectiveTo IS NULL OR EffectiveTo >= sysutcdatetime())",
        "ORDER BY Priority ASC, UpdatedAt DESC",
      ].join("\n"),
    );

  const row = result.recordset[0] as { AssignToUserId?: string | null; AssignToRoleId?: string | null } | undefined;
  return {
    assignToUserId: typeof row?.AssignToUserId === "string" ? row.AssignToUserId : null,
    assignToRoleId:
      typeof row?.AssignToRoleId === "string" ? row.AssignToRoleId : input.requiredRoleId ?? null,
  };
};
