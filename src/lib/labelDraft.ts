import { z } from "zod";
import type { LabelDesignerUiSettingsResponse } from "./api";
const draftSchema = z.object({
  qrPayloadMode: z.enum(["assetId", "assetTag", "snipeItUrl"]), gridColumns: z.number().int().min(1).max(6),
  config: z.object({
    layout: z.enum(["standard", "companyAsset"]).optional(),
    logoDataUrl: z.string().max(220000).regex(/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/).optional(),
    width: z.number().int().min(10).max(200), height: z.number().int().min(10).max(200),
    qrSize: z.number().int().min(5).max(200), fontSize: z.number().int().min(5).max(24),
    padding: z.number().int().min(0).max(20), borderRadius: z.number().int().min(0).max(20),
    showAssetTag: z.boolean(), showAssetName: z.boolean(), showCategory: z.boolean(), showLocation: z.boolean(),
    showCustomText: z.boolean(), customText: z.string().max(256), showBorder: z.boolean(), showLogo: z.boolean(),
    orientation: z.enum(["portrait", "landscape"]),
  }),
});
export const labelDraftKey = (userId: string) => `pm-label-draft-v1:${userId}`;
export const parseLabelDraft = (raw: string | null): LabelDesignerUiSettingsResponse | null => {
  try { const result = draftSchema.safeParse(JSON.parse(raw ?? "null")); return result.success ? result.data as LabelDesignerUiSettingsResponse : null; }
  catch { return null; }
};
