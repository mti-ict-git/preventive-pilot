import { Router } from "express";
import { z } from "zod";
import sql from "mssql";
import { getDb } from "../db/mssql";
import { requireAuth } from "../middleware/requireAuth";

const parseBoolean = (value: unknown): boolean | null => {
  if (value === undefined || value === null) return null;
  if (value === "true" || value === true) return true;
  if (value === "false" || value === false) return false;
  return null;
};

const QuerySchema = z.object({
  search: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  status: z.string().optional(),
  pmEnabled: z.string().optional(),
  page: z.string().optional().default("1"),
  pageSize: z.string().optional().default("50"),
});

const UpdatePmSchema = z
  .object({
    pmEnabled: z.boolean().optional(),
    defaultTemplateId: z.string().uuid().nullable().optional(),
    nextPmDueAt: z.string().datetime().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No updates" });

const BulkSetPmEnabledSchema = z.object({
  assetIds: z.array(z.string().uuid()).min(1).max(200),
  pmEnabled: z.boolean(),
});

export const assetsRouter = Router();

assetsRouter.use(requireAuth);

assetsRouter.get("/", async (req, res) => {
  const parsed = QuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const page = Math.max(1, Number(parsed.data.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(parsed.data.pageSize) || 50));
  const offset = (page - 1) * pageSize;
  const pmEnabled = parseBoolean(parsed.data.pmEnabled);

  const db = await getDb();
  const request = db
    .request()
    .input("offset", sql.Int, offset)
    .input("limit", sql.Int, pageSize)
    .input("search", sql.NVarChar(256), parsed.data.search ? `%${parsed.data.search}%` : null)
    .input("categoryId", sql.UniqueIdentifier, parsed.data.categoryId ?? null)
    .input("locationId", sql.UniqueIdentifier, parsed.data.locationId ?? null)
    .input("status", sql.NVarChar(64), parsed.data.status ?? null)
    .input("pmEnabled", sql.Bit, pmEnabled);

  const result = await request.query(
    [
      "SELECT",
      "  a.AssetId AS AssetId,",
      "  a.SnipeAssetId AS SnipeAssetId,",
      "  a.AssetTag AS AssetTag,",
      "  a.Name AS Name,",
      "  a.Manufacturer AS Manufacturer,",
      "  a.Model AS Model,",
      "  a.SerialNumber AS SerialNumber,",
      "  a.AssetStatus AS AssetStatus,",
      "  a.AssignedToText AS AssignedToText,",
      "  a.CategoryId AS CategoryId,",
      "  c.Name AS CategoryName,",
      "  a.LocationId AS LocationId,",
      "  l.Name AS LocationName,",
      "  s.PMEnabled AS PMEnabled,",
      "  s.DefaultTemplateId AS DefaultTemplateId,",
      "  s.LastPMCompletedAt AS LastPMCompletedAt,",
      "  s.NextPMDueAt AS NextPMDueAt",
      "FROM pm.Assets a",
      "LEFT JOIN pm.AssetCategories c ON c.CategoryId = a.CategoryId",
      "LEFT JOIN pm.Locations l ON l.LocationId = a.LocationId",
      "LEFT JOIN pm.AssetPMSettings s ON s.AssetId = a.AssetId",
      "WHERE a.IsArchived = 0",
      "  AND (@categoryId IS NULL OR a.CategoryId = @categoryId)",
      "  AND (@locationId IS NULL OR a.LocationId = @locationId)",
      "  AND (@status IS NULL OR a.AssetStatus = @status)",
      "  AND (@pmEnabled IS NULL OR ISNULL(s.PMEnabled, 0) = @pmEnabled)",
      "  AND (",
      "    @search IS NULL",
      "    OR a.Name LIKE @search",
      "    OR a.AssetTag LIKE @search",
      "    OR a.SerialNumber LIKE @search",
      "  )",
      "ORDER BY a.UpdatedAt DESC",
      "OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY",
    ].join("\n"),
  );

  const rows = result.recordset as Array<Record<string, unknown>>;
  res.json({
    page,
    pageSize,
    items: rows.map((r) => ({
      id: r.AssetId,
      snipeAssetId: r.SnipeAssetId,
      assetTag: r.AssetTag,
      name: r.Name,
      manufacturer: r.Manufacturer,
      model: r.Model,
      serialNumber: r.SerialNumber,
      assetStatus: r.AssetStatus,
      assignedToText: r.AssignedToText,
      category: r.CategoryId
        ? { id: r.CategoryId, name: r.CategoryName ?? null }
        : { id: null, name: null },
      location: r.LocationId
        ? { id: r.LocationId, name: r.LocationName ?? null }
        : { id: null, name: null },
      pm: {
        enabled: r.PMEnabled ?? null,
        defaultTemplateId: r.DefaultTemplateId ?? null,
        lastCompletedAt: r.LastPMCompletedAt ?? null,
        nextDueAt: r.NextPMDueAt ?? null,
      },
    })),
  });
});

assetsRouter.post("/pm/bulk", async (req, res) => {
  const parsed = BulkSetPmEnabledSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const assetIds = Array.from(new Set(parsed.data.assetIds));
  const db = await getDb();
  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    const idSelect = assetIds
      .map((_, idx) => (idx === 0 ? `SELECT @id${idx} AS AssetId` : `UNION ALL SELECT @id${idx}`))
      .join("\n");

    const request = tx.request().input("pmEnabled", sql.Bit, parsed.data.pmEnabled ? 1 : 0);
    for (const [idx, id] of assetIds.entries()) {
      request.input(`id${idx}`, sql.UniqueIdentifier, id);
    }

    const existsResult = await request.query(
      [
        "WITH ids AS (",
        idSelect,
        ")",
        "SELECT COUNT(1) AS ExistingCount",
        "FROM ids i",
        "INNER JOIN pm.Assets a ON a.AssetId = i.AssetId",
        "WHERE a.IsArchived = 0",
      ].join("\n"),
    );

    const countRow = existsResult.recordset[0] as { ExistingCount?: number } | undefined;
    const existingCount = typeof countRow?.ExistingCount === "number" ? countRow.ExistingCount : 0;
    if (existingCount !== assetIds.length) {
      res.status(400).json({ message: "Some assets were not found" });
      await tx.rollback();
      return;
    }

    await request.query(
      [
        "WITH ids AS (",
        idSelect,
        ")",
        "MERGE pm.AssetPMSettings WITH (HOLDLOCK) AS target",
        "USING ids AS source",
        "ON target.AssetId = source.AssetId",
        "WHEN MATCHED THEN",
        "  UPDATE SET",
        "    PMEnabled = @pmEnabled,",
        "    UpdatedAt = sysutcdatetime()",
        "WHEN NOT MATCHED THEN",
        "  INSERT (AssetId, PMEnabled)",
        "  VALUES (source.AssetId, @pmEnabled);",
      ].join("\n"),
    );

    await tx.commit();
    res.json({ ok: true });
  } catch (err) {
    await tx.rollback().catch(() => undefined);
    throw err;
  }
});

assetsRouter.get("/:assetId", async (req, res) => {
  const assetId = req.params.assetId;
  if (!z.string().uuid().safeParse(assetId).success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const db = await getDb();
  const result = await db
    .request()
    .input("assetId", sql.UniqueIdentifier, assetId)
    .query(
      [
        "SELECT TOP (1)",
        "  a.AssetId AS AssetId,",
        "  a.SnipeAssetId AS SnipeAssetId,",
        "  a.AssetTag AS AssetTag,",
        "  a.Name AS Name,",
        "  a.Manufacturer AS Manufacturer,",
        "  a.Model AS Model,",
        "  a.SerialNumber AS SerialNumber,",
        "  a.AssetStatus AS AssetStatus,",
        "  a.AssignedToText AS AssignedToText,",
        "  a.CategoryId AS CategoryId,",
        "  c.Name AS CategoryName,",
        "  a.LocationId AS LocationId,",
        "  l.Name AS LocationName,",
        "  s.PMEnabled AS PMEnabled,",
        "  s.DefaultTemplateId AS DefaultTemplateId,",
        "  s.LastPMCompletedAt AS LastPMCompletedAt,",
        "  s.NextPMDueAt AS NextPMDueAt",
        "FROM pm.Assets a",
        "LEFT JOIN pm.AssetCategories c ON c.CategoryId = a.CategoryId",
        "LEFT JOIN pm.Locations l ON l.LocationId = a.LocationId",
        "LEFT JOIN pm.AssetPMSettings s ON s.AssetId = a.AssetId",
        "WHERE a.AssetId = @assetId AND a.IsArchived = 0",
      ].join("\n"),
    );

  const row = result.recordset[0] as Record<string, unknown> | undefined;
  if (!row) {
    res.status(404).json({ message: "Not found" });
    return;
  }

  res.json({
    id: row.AssetId,
    snipeAssetId: row.SnipeAssetId,
    assetTag: row.AssetTag,
    name: row.Name,
    manufacturer: row.Manufacturer,
    model: row.Model,
    serialNumber: row.SerialNumber,
    assetStatus: row.AssetStatus,
    assignedToText: row.AssignedToText,
    category: row.CategoryId ? { id: row.CategoryId, name: row.CategoryName ?? null } : null,
    location: row.LocationId ? { id: row.LocationId, name: row.LocationName ?? null } : null,
    pm: {
      enabled: row.PMEnabled ?? null,
      defaultTemplateId: row.DefaultTemplateId ?? null,
      lastCompletedAt: row.LastPMCompletedAt ?? null,
      nextDueAt: row.NextPMDueAt ?? null,
    },
  });
});

assetsRouter.patch("/:assetId/pm", async (req, res) => {
  const assetId = req.params.assetId;
  if (!z.string().uuid().safeParse(assetId).success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const parsed = UpdatePmSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const db = await getDb();
  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    const existing = await tx
      .request()
      .input("assetId", sql.UniqueIdentifier, assetId)
      .query("SELECT TOP (1) AssetId FROM pm.Assets WHERE AssetId = @assetId AND IsArchived = 0");

    if (!existing.recordset[0]) {
      res.status(404).json({ message: "Not found" });
      await tx.rollback();
      return;
    }

    await tx
      .request()
      .input("assetId", sql.UniqueIdentifier, assetId)
      .input("pmEnabled", sql.Bit, parsed.data.pmEnabled ?? null)
      .input("defaultTemplateId", sql.UniqueIdentifier, parsed.data.defaultTemplateId ?? null)
      .input("nextPmDueAt", sql.DateTime2(0), parsed.data.nextPmDueAt ?? null)
      .query(
        [
          "MERGE pm.AssetPMSettings WITH (HOLDLOCK) AS target",
          "USING (SELECT @assetId AS AssetId) AS source",
          "ON target.AssetId = source.AssetId",
          "WHEN MATCHED THEN",
          "  UPDATE SET",
          "    PMEnabled = COALESCE(@pmEnabled, target.PMEnabled),",
          "    DefaultTemplateId = CASE WHEN @defaultTemplateId IS NULL THEN target.DefaultTemplateId ELSE @defaultTemplateId END,",
          "    NextPMDueAt = CASE WHEN @nextPmDueAt IS NULL THEN target.NextPMDueAt ELSE @nextPmDueAt END,",
          "    UpdatedAt = sysutcdatetime()",
          "WHEN NOT MATCHED THEN",
          "  INSERT (AssetId, PMEnabled, DefaultTemplateId, NextPMDueAt)",
          "  VALUES (",
          "    @assetId,",
          "    COALESCE(@pmEnabled, 0),",
          "    @defaultTemplateId,",
          "    @nextPmDueAt",
          "  );",
        ].join("\n"),
      );

    await tx.commit();
    res.json({ ok: true });
  } catch (err) {
    await tx.rollback().catch(() => undefined);
    throw err;
  }
});
