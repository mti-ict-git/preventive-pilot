-- Restore guards omitted by older upgrade paths. No data repair is attempted.
-- Apply only after checking context violations/orphans, inside a bounded transaction.
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=OBJECT_ID(N'pm.PMTasks') AND name=N'FK_pm_PMTasks_Facilities')
BEGIN
  EXEC(N'ALTER TABLE pm.PMTasks WITH CHECK ADD CONSTRAINT FK_pm_PMTasks_Facilities FOREIGN KEY (FacilityId) REFERENCES pm.Facilities(FacilityId);');
END;

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'pm.PMTasks') AND name=N'CK_pm_PMTasks_AssetOrFacility')
BEGIN
  EXEC(N'ALTER TABLE pm.PMTasks WITH CHECK ADD CONSTRAINT CK_pm_PMTasks_AssetOrFacility CHECK ((AssetId IS NOT NULL AND FacilityId IS NULL) OR (AssetId IS NULL AND FacilityId IS NOT NULL));');
END;
