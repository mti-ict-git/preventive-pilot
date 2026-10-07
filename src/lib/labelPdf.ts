import { companyLogoDataUrl } from "./companyLogo";
import { PDFDocument, StandardFonts, rgb, degrees, pushGraphicsState, popGraphicsState, rectangle, clip, endPath } from "pdf-lib";
import * as QRCode from "qrcode";
import type { Asset, LabelDesignerConfig, LabelDesignerQrPayloadMode } from "./api";

const mmToPt = (mm: number) => mm * 72 / 25.4;
export const labelDimensions = (config: LabelDesignerConfig) => ({
  width: config.orientation === "landscape" ? Math.max(config.width, config.height) : Math.min(config.width, config.height),
  height: config.orientation === "landscape" ? Math.min(config.width, config.height) : Math.max(config.width, config.height),
});
export type LabelDrawing = {
  width: number; height: number; showBorder: boolean; borderBlack?: boolean;
  logo?: { dataUrl: string; x: number; y: number; width: number; height: number; viewport?: { x: number; y: number; width: number; height: number; imageWidth: number; imageHeight: number } };
  qr: { dataUrl: string; x: number; y: number; size: number };
  lines: Array<{ text: string; size: number; bold: boolean; x: number; y: number; rotation?: number }>;
};
export const buildLabelOutput = async (assets: Asset[], config: LabelDesignerConfig,
  mode: LabelDesignerQrPayloadMode, snipeBaseUrl?: string | null): Promise<{ pdfBytes: Uint8Array; drawings: LabelDrawing[] }> => {
  const dimensions = labelDimensions(config);
  const logoSizePercent = config.logoSizePercent ?? 100;
  if (!Number.isInteger(logoSizePercent) || logoSizePercent < 25 || logoSizePercent > 100) throw new Error("Logo size must be between 25% and 100%.");
  if (![config.width, config.height].every(v => Number.isInteger(v) && v >= 10 && v <= 200) ||
      !Number.isFinite(config.padding) || config.padding < 0 ||
      !Number.isFinite(config.qrSize) || config.qrSize < 5 ||
      !Number.isFinite(config.fontSize) || config.fontSize < 5) throw new Error("Enter valid label dimensions and sizes.");
  const width = mmToPt(dimensions.width), height = mmToPt(dimensions.height);
  const padding = mmToPt(config.padding), gap = mmToPt(2), qrSize = mmToPt(config.qrSize);
  const landscape = config.orientation === "landscape";
  const company = config.layout === "companyAsset";
  if (company && !landscape) throw new Error("Company Asset requires landscape orientation.");
  const textWidth = landscape ? width - padding * 2 - qrSize - gap : width - padding * 2;
  const textHeight = landscape ? height - padding * 2 : height - padding * 2 - qrSize - gap;
  if (qrSize > Math.min(width, height) - padding * 2 || (!company && (textWidth <= 0 || textHeight <= 0)))
    throw new Error("QR code and padding do not fit. Reduce QR size or padding, or increase label size.");
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const drawings: LabelDrawing[] = [];
  for (const asset of assets) {
    const base = snipeBaseUrl?.replace(/\/+$/, "");
    const payload = mode === "snipeItUrl" && base && asset.snipeAssetId != null
      ? `${base}/hardware/${asset.snipeAssetId}`
      : mode !== "assetId" && asset.assetTag ? asset.assetTag : asset.id;
    const dataUrl = await QRCode.toDataURL(payload, { margin: 4, errorCorrectionLevel: "M" });
    const qr = await doc.embedPng(dataUrl);
    if (company) {
      const inset = Math.max(padding, mmToPt(1.5));
      const qrX = width - inset - mmToPt(3) - qrSize, qrY = (height - qrSize) / 2;
      const leftWidth = qrX - inset - mmToPt(1), usableHeight = height - inset * 2;
      if (leftWidth < mmToPt(18) || usableHeight < mmToPt(12))
        throw new Error("Company Asset needs more space. Use at least 60x18mm and reduce QR size or padding.");
      const page = doc.addPage([width, height]);
      const lines: LabelDrawing["lines"] = [];
      const add = (text: string, size: number, x: number, y: number, isBold = false, rotation = 0) => {
        const f = isBold ? bold : font;
        lines.push({ text, size, x, y, bold: isBold, rotation });
        page.drawText(text, { x, y, size, font: f, rotate: degrees(rotation), color: rgb(0,0,0) });
      };
      const fit = (text: string, desired: number, available: number, isBold = false) => {
        const f = isBold ? bold : font;
        let size: number;
        try { size = Math.min(desired, available / Math.max(1, f.widthOfTextAtSize(text, 1))); }
        catch { throw new Error("Label text contains unsupported characters. Use characters supported by the PDF font."); }
        if (size < 5) throw new Error("Company Asset text is too wide. Increase label length or shorten the name.");
        return size;
      };
      let logo: LabelDrawing["logo"];
      const headerHeight = usableHeight * 0.40;
      const logoDataUrl = config.logoDataUrl ?? companyLogoDataUrl;
      if (config.showLogo) {
        if ((config.logoDataUrl && config.logoDataUrl.length > 2800000) || !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(logoDataUrl))
          throw new Error("Use a valid PNG or JPG logo up to 2 MB.");
        let image;
        try { image = logoDataUrl.startsWith("data:image/png") ? await doc.embedPng(logoDataUrl) : await doc.embedJpg(logoDataUrl); }
        catch { throw new Error("The logo cannot be read. Upload a valid PNG or JPG image."); }
        // The bundled reconstruction contains transparent padding; clip only its known ink bounds.
        const viewport = logoDataUrl === companyLogoDataUrl ? { x: 12, y: 141, width: 2143, height: 428, imageWidth: image.width, imageHeight: image.height } : undefined;
        const visibleWidth = viewport?.width ?? image.width, visibleHeight = viewport?.height ?? image.height;
        const scale = Math.min(leftWidth / visibleWidth, headerHeight / visibleHeight) * logoSizePercent / 100;
        logo = { dataUrl: logoDataUrl, x: inset, y: height - inset - visibleHeight * scale, width: visibleWidth * scale, height: visibleHeight * scale, viewport };
        if (viewport) {
          page.pushOperators(pushGraphicsState(), rectangle(logo.x, logo.y, logo.width, logo.height), clip(), endPath());
          page.drawImage(image, { x: logo.x - viewport.x * scale, y: logo.y - (image.height - viewport.y - viewport.height) * scale, width: image.width * scale, height: image.height * scale });
          page.pushOperators(popGraphicsState());
        } else page.drawImage(image, logo);
      } else {
        const text = "MERDEKA TSINGSHAN INDONESIA";
        const size = fit(text, 6, leftWidth, true);
        add(text, size, inset, height - inset - size, true);
      }
      const captionSize = fit("Company Asset", Math.min(10, config.fontSize), leftWidth, true);
      add("Company Asset", captionSize, inset, height - inset - headerHeight - captionSize - mmToPt(0.4), true);
      const name = asset.name || asset.assetTag || asset.id;
      const nameSize = fit(name, Math.min(24, config.fontSize + 8, usableHeight * 0.34), leftWidth, true);
      add(name, nameSize, inset, inset + 1, true);
      const warning = "DON'T REMOVE", warningSize = fit(warning, 6, usableHeight, true);
      add(warning, warningSize, width - inset - warningSize, (height + bold.widthOfTextAtSize(warning, warningSize)) / 2, true, -90);
      page.drawImage(qr, { x: qrX, y: qrY, width: qrSize, height: qrSize });
      if (config.showBorder) page.drawRectangle({ x: mmToPt(0.5), y: mmToPt(0.5), width: width-mmToPt(1), height: height-mmToPt(1), borderColor: rgb(0,0,0), borderWidth: 0.8 });
      drawings.push({ width, height, showBorder: config.showBorder, borderBlack: true, logo, qr: { dataUrl, x: qrX, y: qrY, size: qrSize }, lines });
      continue;
    }
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
    const positionedLines: LabelDrawing["lines"] = [];
    let y = landscape ? (height + totalHeight) / 2 : qrY - gap;
    for (const line of lines) {
      y -= line.size * 1.25;
      const currentFont = line.bold ? bold : font;
      const x = landscape ? padding + qrSize + gap : (width - currentFont.widthOfTextAtSize(line.text, line.size)) / 2;
      positionedLines.push({ ...line, x, y });
      page.drawText(line.text, { x, y, size: line.size, font: currentFont, color: rgb(0, 0, 0) });
    }
    drawings.push({ width, height, showBorder: config.showBorder,
      qr: { dataUrl, x: qrX, y: qrY, size: qrSize }, lines: positionedLines });
  }
  return { pdfBytes: await doc.save(), drawings };
};
export const buildLabelPdf = async (assets: Asset[], config: LabelDesignerConfig,
  mode: LabelDesignerQrPayloadMode, snipeBaseUrl?: string | null): Promise<Uint8Array> =>
  (await buildLabelOutput(assets, config, mode, snipeBaseUrl)).pdfBytes;

