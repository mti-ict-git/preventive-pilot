import { Router } from "express";
import { z } from "zod";
import sql from "mssql";
import { getDb } from "../db/mssql.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireManager } from "../middleware/requireRole.js";

const parseBoolean = (value: unknown): boolean | null => {
  if (value === undefined || value === null) return null;
  if (value === "true" || value === true) return true;
  if (value === "false" || value === false) return false;
  return null;
};

const QuerySchema = z.object({
  search: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  categoryIds: z.string().optional(),
  locationId: z.string().uuid().optional(),
  status: z.string().optional(),
  operationalStatus: z.enum(["operational", "broken", "archived"]).optional(),
  pmEnabled: z.string().optional(),
  page: z.string().optional().default("1"),
  pageSize: z.string().optional().default("50"),
});

const parseUuidList = (value: string | undefined): string[] | null => {
  if (!value) return null;
  const parts = value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => Boolean(s));
  if (parts.length === 0) return null;
  for (const part of parts) {
    if (!z.string().uuid().safeParse(part).success) return null;
  }
  return parts;
};

const UpdatePmSchema = z
  .object({
    pmEnabled: z.boolean().optional(),
    defaultTemplateId: z.string().uuid().nullable().optional(),
    nextPmDueAt: z.string().datetime().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "No updates" });

const BulkSetPmEnabledSchema = z.object({
  assetIds: z.array(z.string().uuid()).min(1).max(500),
  pmEnabled: z.boolean(),
});

const BulkSetPmTemplateSchema = z.object({
  assetIds: z.array(z.string().uuid()).min(1).max(500),
  defaultTemplateId: z.string().uuid().nullable(),
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
  const pageSize = Math.min(500, Math.max(1, Number(parsed.data.pageSize) || 50));
  const offset = (page - 1) * pageSize;
  const pmEnabled = parseBoolean(parsed.data.pmEnabled);
  const categoryIds = parseUuidList(parsed.data.categoryIds);

  if (parsed.data.categoryIds && categoryIds === null) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  if (categoryIds && categoryIds.length > 50) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const db = await getDb();
  const request = db
    .request()
    .input("offset", sql.Int, offset)
    .input("limit", sql.Int, pageSize)
    .input("search", sql.NVarChar(256), parsed.data.search ? `%${parsed.data.search}%` : null)
    .input("categoryId", sql.UniqueIdentifier, parsed.data.categoryId ?? null)
    .input("categoryIds", sql.NVarChar(sql.MAX), categoryIds ? categoryIds.join(",") : null)
    .input("locationId", sql.UniqueIdentifier, parsed.data.locationId ?? null)
    .input("status", sql.NVarChar(64), parsed.data.status ?? null)
    .input("operationalStatus", sql.NVarChar(16), parsed.data.operationalStatus ?? null)
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
      "  a.AssetOperationalStatus AS AssetOperationalStatus,",
      "  a.AssignedToText AS AssignedToText,",
      "  a.Notes AS SnipeNotes,",
      "  a.CategoryId AS CategoryId,",
      "  c.Name AS CategoryName,",
      "  a.LocationId AS LocationId,",
      "  l.Name AS LocationName,",
      "  s.PMEnabled AS PMEnabled,",
      "  s.DefaultTemplateId AS DefaultTemplateId,",
      "  COALESCE(h.LastCompletedAt, s.LastPMCompletedAt) AS LastPMCompletedAt,",
      "  CASE",
      "    WHEN ISNULL(s.PMEnabled, 0) = 0 THEN NULL",
      "    ELSE COALESCE(",
      "      s.NextPMDueAt,",
      "      CASE",
        "        WHEN t.TemplateId IS NULL THEN NULL",
        "        WHEN t.IsActive = 0 THEN NULL",
        "        WHEN t.IntervalDays <= 0 THEN NULL",
        "        WHEN t.IntervalDays = 30 THEN dateadd(month, 1, COALESCE(h.LastCompletedAt, s.LastPMCompletedAt, sysutcdatetime()))",
        "        WHEN t.IntervalDays = 90 THEN dateadd(month, 3, COALESCE(h.LastCompletedAt, s.LastPMCompletedAt, sysutcdatetime()))",
        "        WHEN t.IntervalDays = 180 THEN dateadd(month, 6, COALESCE(h.LastCompletedAt, s.LastPMCompletedAt, sysutcdatetime()))",
        "        WHEN t.IntervalDays = 365 THEN dateadd(year, 1, COALESCE(h.LastCompletedAt, s.LastPMCompletedAt, sysutcdatetime()))",
      "        ELSE dateadd(day, t.IntervalDays, COALESCE(h.LastCompletedAt, s.LastPMCompletedAt, sysutcdatetime()))",
      "      END",
      "    )",
      "  END AS NextPMDueAt",
      "FROM pm.Assets a",
      "LEFT JOIN pm.AssetCategories c ON c.CategoryId = a.CategoryId",
      "LEFT JOIN pm.Locations l ON l.LocationId = a.LocationId",
      "LEFT JOIN pm.AssetPMSettings s ON s.AssetId = a.AssetId",
      "LEFT JOIN pm.PMTemplates t ON t.TemplateId = s.DefaultTemplateId",
      "OUTER APPLY (",
      "  SELECT MAX(tt.CompletedAt) AS LastCompletedAt",
      "  FROM pm.PMTasks tt",
      "  WHERE tt.AssetId = a.AssetId",
      "    AND tt.TemplateId = s.DefaultTemplateId",
      "    AND tt.Status = N'completed'",
      "    AND tt.CompletedAt IS NOT NULL",
      ") h",
      "WHERE a.IsArchived = 0",
      "  AND (",
      "    @categoryIds IS NULL",
      "    OR a.CategoryId IN (",
      "      SELECT c.CategoryId",
      "      FROM (",
      "        SELECT TRY_CONVERT(uniqueidentifier, value) AS CategoryId",
      "        FROM string_split(@categoryIds, ',')",
      "      ) c",
      "      WHERE c.CategoryId IS NOT NULL",
      "    )",
      "  )",
      "  AND (@categoryId IS NULL OR a.CategoryId = @categoryId)",
      "  AND (@locationId IS NULL OR a.LocationId = @locationId)",
      "  AND (@status IS NULL OR a.AssetStatus = @status)",
      "  AND (@operationalStatus IS NULL OR a.AssetOperationalStatus = @operationalStatus)",
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
      assetOperationalStatus:
        r.AssetOperationalStatus === "operational" || r.AssetOperationalStatus === "broken" || r.AssetOperationalStatus === "archived"
          ? r.AssetOperationalStatus
          : "operational",
      assignedToText: r.AssignedToText,
      snipeNotes: r.SnipeNotes ?? null,
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

assetsRouter.post("/pm/bulk", requireManager, async (req, res) => {
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

assetsRouter.post("/pm/bulk/template", requireManager, async (req, res) => {
  const parsed = BulkSetPmTemplateSchema.safeParse(req.body);
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

    const request = tx
      .request()
      .input("defaultTemplateId", sql.UniqueIdentifier, parsed.data.defaultTemplateId ?? null);
    for (const [idx, id] of assetIds.entries()) {
      request.input(`id${idx}`, sql.UniqueIdentifier, id);
    }

    if (parsed.data.defaultTemplateId) {
      const templateResult = await request.query(
        [
          "SELECT TOP (1)",
          "  TemplateId",
          "FROM pm.PMTemplates",
          "WHERE TemplateId = @defaultTemplateId AND IsActive = 1",
        ].join("\n"),
      );
      if (!templateResult.recordset[0]) {
        res.status(400).json({ message: "Template not found" });
        await tx.rollback();
        return;
      }
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
        "    DefaultTemplateId = @defaultTemplateId,",
        "    NextPMDueAt = NULL,",
        "    UpdatedAt = sysutcdatetime()",
        "WHEN NOT MATCHED THEN",
        "  INSERT (AssetId, PMEnabled, DefaultTemplateId)",
        "  VALUES (source.AssetId, 0, @defaultTemplateId);",
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
        "  a.AssetOperationalStatus AS AssetOperationalStatus,",
        "  a.AssignedToText AS AssignedToText,",
          "  a.Notes AS Notes,",
        "  a.CategoryId AS CategoryId,",
        "  c.Name AS CategoryName,",
        "  a.LocationId AS LocationId,",
        "  l.Name AS LocationName,",
        "  s.PMEnabled AS PMEnabled,",
      "  s.DefaultTemplateId AS DefaultTemplateId,",
      "  COALESCE(h.LastCompletedAt, s.LastPMCompletedAt) AS LastPMCompletedAt,",
      "  CASE",
      "    WHEN ISNULL(s.PMEnabled, 0) = 0 THEN NULL",
      "    ELSE COALESCE(",
      "      s.NextPMDueAt,",
      "      CASE",
        "        WHEN t.TemplateId IS NULL THEN NULL",
        "        WHEN t.IsActive = 0 THEN NULL",
        "        WHEN t.IntervalDays <= 0 THEN NULL",
        "        WHEN t.IntervalDays = 30 THEN dateadd(month, 1, COALESCE(h.LastCompletedAt, s.LastPMCompletedAt, sysutcdatetime()))",
        "        WHEN t.IntervalDays = 90 THEN dateadd(month, 3, COALESCE(h.LastCompletedAt, s.LastPMCompletedAt, sysutcdatetime()))",
        "        WHEN t.IntervalDays = 180 THEN dateadd(month, 6, COALESCE(h.LastCompletedAt, s.LastPMCompletedAt, sysutcdatetime()))",
        "        WHEN t.IntervalDays = 365 THEN dateadd(year, 1, COALESCE(h.LastCompletedAt, s.LastPMCompletedAt, sysutcdatetime()))",
        "        ELSE dateadd(day, t.IntervalDays, COALESCE(h.LastCompletedAt, s.LastPMCompletedAt, sysutcdatetime()))",
      "      END",
      "    )",
      "  END AS NextPMDueAt",
        "FROM pm.Assets a",
        "LEFT JOIN pm.AssetCategories c ON c.CategoryId = a.CategoryId",
        "LEFT JOIN pm.Locations l ON l.LocationId = a.LocationId",
        "LEFT JOIN pm.AssetPMSettings s ON s.AssetId = a.AssetId",
        "LEFT JOIN pm.PMTemplates t ON t.TemplateId = s.DefaultTemplateId",
        "OUTER APPLY (",
        "  SELECT MAX(tt.CompletedAt) AS LastCompletedAt",
        "  FROM pm.PMTasks tt",
        "  WHERE tt.AssetId = a.AssetId",
        "    AND tt.TemplateId = s.DefaultTemplateId",
        "    AND tt.Status = N'completed'",
        "    AND tt.CompletedAt IS NOT NULL",
        ") h",
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
    assetOperationalStatus:
      row.AssetOperationalStatus === "operational" ||
      row.AssetOperationalStatus === "broken" ||
      row.AssetOperationalStatus === "archived"
        ? row.AssetOperationalStatus
        : "operational",
    assignedToText: row.AssignedToText,
    snipeNotes: row.Notes ?? null,
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

assetsRouter.get("/:assetId/history", async (req, res) => {
  const assetId = req.params.assetId;
  if (!z.string().uuid().safeParse(assetId).success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const db = await getDb();

  const existsResult = await db
    .request()
    .input("assetId", sql.UniqueIdentifier, assetId)
    .query("SELECT TOP (1) 1 AS One FROM pm.Assets WHERE AssetId = @assetId AND IsArchived = 0");

  if (!existsResult.recordset[0]) {
    res.status(404).json({ message: "Not found" });
    return;
  }

  const historyResult = await db
    .request()
    .input("assetId", sql.UniqueIdentifier, assetId)
    .input("limit", sql.Int, 50)
    .query(
      [
        "SELECT TOP (@limit)",
        "  t.TaskId AS TaskId,",
        "  t.CompletedAt AS CompletedAt,",
        "  t.Status AS Status,",
        "  tpl.Name AS TemplateName,",
        "  cu.Username AS CompletedByUsername,",
        "  cu.DisplayName AS CompletedByDisplayName",
        "FROM pm.PMTasks t",
        "INNER JOIN pm.PMTemplates tpl ON tpl.TemplateId = t.TemplateId",
        "LEFT JOIN pm.Users cu ON cu.UserId = t.CompletedByUserId",
        "WHERE t.AssetId = @assetId",
        "  AND t.Status = N'completed'",
        "  AND t.CompletedAt IS NOT NULL",
        "ORDER BY t.CompletedAt DESC",
      ].join("\n"),
    );

  const rows = historyResult.recordset as Array<Record<string, unknown>>;
  res.json(
    rows.map((r) => {
      const completedAtValue = r.CompletedAt;
      const completedAt =
        completedAtValue instanceof Date
          ? completedAtValue.toISOString()
          : typeof completedAtValue === "string"
            ? completedAtValue
            : null;

      const completedByDisplayName = typeof r.CompletedByDisplayName === "string" ? r.CompletedByDisplayName : null;
      const completedByUsername = typeof r.CompletedByUsername === "string" ? r.CompletedByUsername : null;
      const technician = completedByDisplayName ?? completedByUsername;

      return {
        id: typeof r.TaskId === "string" ? r.TaskId : "",
        date: completedAt,
        type: typeof r.TemplateName === "string" ? r.TemplateName : null,
        technician,
        status: typeof r.Status === "string" ? r.Status : "completed",
      };
    }),
  );
});

assetsRouter.patch("/:assetId/pm", requireManager, async (req, res) => {
  const assetId = req.params.assetId;
  if (!z.string().uuid().safeParse(assetId).success) {
    res.status(400).json({
      message: "Invalid request",
      code: "VALIDATION_ERROR",
      details: [
        {
          field: "assetId",
          issue: "Invalid UUID",
        },
      ],
    });
    return;
  }

  const parsed = UpdatePmSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      message: "Invalid request",
      code: "VALIDATION_ERROR",
      details: [],
    });
    return;
  }

  const hasDefaultTemplateId = Object.prototype.hasOwnProperty.call(parsed.data, "defaultTemplateId");
  const hasNextPmDueAt = Object.prototype.hasOwnProperty.call(parsed.data, "nextPmDueAt");

  const db = await getDb();
  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    const existingResult = await tx
      .request()
      .input("assetId", sql.UniqueIdentifier, assetId)
      .query(
        [
          "SELECT TOP (1)",
          "  a.AssetId AS AssetId,",
          "  a.CategoryId AS CategoryId",
          "FROM pm.Assets a",
          "WHERE a.AssetId = @assetId AND a.IsArchived = 0",
        ].join("\n"),
      );

    const existingRow = existingResult.recordset[0] as
      | {
          AssetId?: string;
          CategoryId?: string | null;
        }
      | undefined;

    if (!existingRow) {
      res.status(404).json({
        message: "Not found",
        code: "NOT_FOUND",
        details: [
          {
            field: "assetId",
            issue: "Asset not found",
          },
        ],
      });
      await tx.rollback();
      return;
    }

    if (hasDefaultTemplateId && parsed.data.defaultTemplateId) {
      const validationResult = await tx
        .request()
        .input("assetId", sql.UniqueIdentifier, assetId)
        .input("templateId", sql.UniqueIdentifier, parsed.data.defaultTemplateId)
        .query(
          [
            "SELECT TOP (1)",
            "  a.CategoryId AS AssetCategoryId,",
            "  tpl.TemplateId AS TemplateId,",
            "  tpl.ApplicableCategoryId AS TemplateCategoryId",
            "FROM pm.Assets a",
            "LEFT JOIN pm.PMTemplates tpl ON tpl.TemplateId = @templateId",
            "WHERE a.AssetId = @assetId AND a.IsArchived = 0",
          ].join("\n"),
        );

      const validationRow = validationResult.recordset[0] as
        | {
            AssetCategoryId?: string | null;
            TemplateId?: string | null;
            TemplateCategoryId?: string | null;
          }
        | undefined;

      const templateIdValue = typeof validationRow?.TemplateId === "string" ? validationRow.TemplateId : null;
      if (!templateIdValue) {
        res.status(400).json({
          message: "Template not found",
          code: "VALIDATION_ERROR",
          details: [
            {
              field: "defaultTemplateId",
              issue: "Template not found",
            },
          ],
        });
        await tx.rollback();
        return;
      }

      const assetCategoryId = typeof validationRow?.AssetCategoryId === "string" ? validationRow.AssetCategoryId : null;
      const templateCategoryId =
        typeof validationRow?.TemplateCategoryId === "string" ? validationRow.TemplateCategoryId : null;

      if (templateCategoryId && templateCategoryId !== assetCategoryId) {
        res.status(400).json({
          message: "Invalid request",
          code: "VALIDATION_ERROR",
          details: [
            {
              field: "defaultTemplateId",
              issue: "Category mismatch",
            },
          ],
        });
        await tx.rollback();
        return;
      }
    }

    await tx
      .request()
      .input("assetId", sql.UniqueIdentifier, assetId)
      .input("pmEnabled", sql.Bit, parsed.data.pmEnabled ?? null)
      .input("hasDefaultTemplateId", sql.Bit, hasDefaultTemplateId ? 1 : 0)
      .input("defaultTemplateId", sql.UniqueIdentifier, parsed.data.defaultTemplateId ?? null)
      .input("hasNextPmDueAt", sql.Bit, hasNextPmDueAt ? 1 : 0)
      .input("nextPmDueAt", sql.DateTime2(0), parsed.data.nextPmDueAt ?? null)
      .query(
        [
          "MERGE pm.AssetPMSettings WITH (HOLDLOCK) AS target",
          "USING (SELECT @assetId AS AssetId) AS source",
          "ON target.AssetId = source.AssetId",
          "WHEN MATCHED THEN",
          "  UPDATE SET",
          "    PMEnabled = COALESCE(@pmEnabled, target.PMEnabled),",
          "    DefaultTemplateId = CASE WHEN @hasDefaultTemplateId = 1 THEN @defaultTemplateId ELSE target.DefaultTemplateId END,",
          "    NextPMDueAt = CASE WHEN @hasNextPmDueAt = 1 THEN @nextPmDueAt ELSE target.NextPMDueAt END,",
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
