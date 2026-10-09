type LocationRef = { id?: number | null } | null;
export const resolveSnipeSiteId = (asset: { location?: LocationRef; rtd_location?: LocationRef }): number | null => {
  const valid = (id: unknown): id is number => typeof id === "number" && Number.isSafeInteger(id) && id > 0;
  if (valid(asset.location?.id)) return asset.location.id;
  if (valid(asset.rtd_location?.id)) return asset.rtd_location.id;
  return null;
};
