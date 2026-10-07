import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import * as QRCode from "qrcode";
import type { Asset, LabelDesignerConfig, LabelDesignerQrPayloadMode } from "./api";

const mmToPt = (mm: number) => mm * 72 / 25.4;
export const labelDimensions = (config: LabelDesignerConfig) => ({
  width: config.orientation === "landscape" ? Math.max(config.width, config.height) : Math.min(config.width, config.height),
  height: config.orientation === "landscape" ? Math.min(config.width, config.height) : Math.max(config.width, config.height),
});
export const buildLabelPdf = async (assets: Asset[], config: LabelDesignerConfig,
  mode: LabelDesignerQrPayloadMode, snipeBaseUrl?: string | null): Promise<Uint8Array> => {
  const dimensions = labelDimensions(config);
  if (![config.width, config.height].every(v => Number.isInteger(v) && v >= 10 && v <= 200) ||
      !Number.isFinite(config.padding) || config.padding < 0 ||
      !Number.isFinite(config.qrSize) || config.qrSize < 5 ||
      !Number.isFinite(config.fontSize) || config.fontSize < 5) throw new Error("Enter valid label dimensions and sizes.");
  const width = mmToPt(dimensions.width), height = mmToPt(dimensions.height);
  const padding = mmToPt(config.padding), gap = mmToPt(2), qrSize = mmToPt(config.qrSize);
  const landscape = config.orientation === "landscape";
  const textWidth = landscape ? width - padding * 2 - qrSize - gap : width - padding * 2;
  const textHeight = landscape ? height - padding * 2 : height - padding * 2 - qrSize - gap;
  if (qrSize > Math.min(width, height) - padding * 2 || textWidth <= 0 || textHeight <= 0)
    throw new Error("QR code and padding do not fit. Reduce QR size or padding, or increase label size.");
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  for (const asset of assets) {
    const base = snipeBaseUrl?.replace(/\/+$/, "");
    const payload = mode === "snipeItUrl" && base && asset.snipeAssetId != null
      ? `${base}/hardware/${asset.snipeAssetId}`
      : mode !== "assetId" && asset.assetTag ? asset.assetTag : asset.id;
    const qr = await doc.embedPng(await QRCode.toDataURL(payload, { margin: 4, errorCorrectionLevel: "M" }));
    const lines: Array<{ text: string; size: number; bold: boolean }> = [];
    if (config.showAssetTag && asset.assetTag) lines.push({ text: asset.assetTag, size: config.fontSize + 2, bold: true });
    if (config.showAssetName && asset.name) lines.push({ text: asset.name, size: config.fontSize, bold: false });
    if (config.showCategory && asset.category?.name) lines.push({ text: asset.category.name, size: config.fontSize, bold: false });
    if (config.showLocation && asset.location?.name) lines.push({ text: asset.location.name, size: config.fontSize, bold: false });
    if (config.showCustomText && config.customText) lines.push({ text: config.customText, size: Math.max(5, config.fontSize - 1), bold: false });
    const totalHeight = lines.reduce((sum, line) => sum + line.size * 1.25, 0);
    if (totalHeight > textHeight) throw new Error("Text does not fit. Reduce font size or selected content, or increase label size.");
    for (const line of lines) {
      const currentFont = line.bold ? bold : font;
      try {
        if (currentFont.widthOfTextAtSize(line.text, line.size) > textWidth)
          throw new Error("Text is too wide. Reduce font size or shorten the text, or increase label length.");
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("Text is too wide")) throw error;
        throw new Error("Label text contains unsupported characters. Use characters supported by the PDF font.");
      }
    }
    const page = doc.addPage([width, height]);
    if (config.showBorder) page.drawRectangle({ x: mmToPt(0.5), y: mmToPt(0.5),
      width: width - mmToPt(1), height: height - mmToPt(1), borderColor: rgb(0.7, 0.7, 0.7), borderWidth: 0.5 });
    const qrX = landscape ? padding : (width - qrSize) / 2;
    const qrY = landscape ? (height - qrSize) / 2 : height - padding - qrSize;
    page.drawImage(qr, { x: qrX, y: qrY, width: qrSize, height: qrSize });
    let y = landscape ? (height + totalHeight) / 2 : qrY - gap;
    for (const line of lines) {
      y -= line.size * 1.25;
      const currentFont = line.bold ? bold : font;
      const x = landscape ? padding + qrSize + gap : (width - currentFont.widthOfTextAtSize(line.text, line.size)) / 2;
      page.drawText(line.text, { x, y, size: line.size, font: currentFont, color: rgb(0, 0, 0) });
    }
  }
  return doc.save();
};
