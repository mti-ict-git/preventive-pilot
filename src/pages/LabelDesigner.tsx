import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import * as QRCode from "qrcode";
import {
  QrCode,
  Printer,
  Download,
  Plus,
  Minus,
  Type,
  Grid3X3,
  Palette,
  RotateCcw,
  Settings2,
  Eye,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  apiGetLabelDesignerUiSettings,
  apiGetLookups,
  apiGetSystemStatus,
  apiListAssets,
  apiUpdateLabelDesignerUiSettings,
  type Asset as ApiAsset,
  type LabelDesignerConfig,
  type LabelDesignerQrPayloadMode,
} from "@/lib/api";
import { hasAnyRole } from "@/lib/auth";

type Asset = ApiAsset;

const defaultDesignerConfig: LabelDesignerConfig = {
  width: 50,
  height: 30,
  qrSize: 20,
  showAssetTag: true,
  showAssetName: true,
  showCategory: false,
  showLocation: false,
  showCustomText: false,
  customText: "Property of IT Dept",
  fontSize: 8,
  padding: 4,
  borderRadius: 2,
  showBorder: true,
  showLogo: false,
  orientation: "landscape",
};

const labelPresets = [
  { name: "Small (30x20mm)", width: 30, height: 20 },
  { name: "Medium (50x30mm)", width: 50, height: 30 },
  { name: "Large (70x40mm)", width: 70, height: 40 },
  { name: "Square (50x50mm)", width: 50, height: 50 },
];

const contentToggleItems = [
  { key: "showAssetTag", label: "Asset Tag" },
  { key: "showAssetName", label: "Asset Name" },
  { key: "showCategory", label: "Category" },
  { key: "showLocation", label: "Location" },
  { key: "showCustomText", label: "Custom Text" },
  { key: "showLogo", label: "Company Logo" },
] as const satisfies ReadonlyArray<{ key: keyof LabelDesignerConfig; label: string }>;

export default function LabelDesigner() {
  const queryClient = useQueryClient();
  const [selectedAssets, setSelectedAssets] = useState<Asset[]>([]);
  const [assetSearch, setAssetSearch] = useState<string>("");
  const [assetCategoryId, setAssetCategoryId] = useState<string>("all");
  const [assetPage, setAssetPage] = useState<number>(1);
  const assetPageSize = 200;

  const canEditDefaults = hasAnyRole(["Superadmin", "Admin"]);
  const controlsLocked = !canEditDefaults;

  const lookupsQuery = useQuery({
    queryKey: ["lookups"],
    queryFn: apiGetLookups,
    staleTime: 60_000,
  });

  const systemStatusQuery = useQuery({
    queryKey: ["system-status"],
    queryFn: apiGetSystemStatus,
    staleTime: 30_000,
  });

  const settingsQuery = useQuery({
    queryKey: ["ui-settings", "label-designer"],
    queryFn: apiGetLabelDesignerUiSettings,
    staleTime: 60_000,
  });

  const assetsQuery = useQuery({
    queryKey: ["label-designer", "assets", { assetSearch, assetCategoryId, assetPage, assetPageSize }],
    queryFn: () =>
      apiListAssets({
        search: assetSearch.trim() ? assetSearch.trim() : undefined,
        categoryId: assetCategoryId === "all" ? undefined : assetCategoryId,
        page: assetPage,
        pageSize: assetPageSize,
      }),
  });

  const availableAssets = assetsQuery.data?.items ?? [];

  const categoryItems = useMemo(() => {
    const categories = lookupsQuery.data?.assetCategories ?? [];
    return [{ id: "all", name: "All Categories" }, ...categories.map((c) => ({ id: c.id, name: c.name }))];
  }, [lookupsQuery.data?.assetCategories]);
  const [config, setConfig] = useState<LabelDesignerConfig>(defaultDesignerConfig);
  const [gridColumns, setGridColumns] = useState<number>(3);
  const [qrPayloadMode, setQrPayloadMode] = useState<LabelDesignerQrPayloadMode>("assetId");
  const [tabValue, setTabValue] = useState("layout");

  useEffect(() => {
    const data = settingsQuery.data;
    if (!data) return;
    setConfig(data.config);
    setGridColumns(data.gridColumns);
    setQrPayloadMode(data.qrPayloadMode);
  }, [settingsQuery.data]);

  const saveDefaultsMutation = useMutation({
    mutationFn: () => apiUpdateLabelDesignerUiSettings({ qrPayloadMode, gridColumns, config }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["ui-settings", "label-designer"] });
      toast.success("Defaults saved");
    },
    onError: () => {
      toast.error("Failed to save defaults");
    },
  });

  const updateConfig = <K extends keyof LabelDesignerConfig>(
    key: K,
    value: LabelDesignerConfig[K],
  ) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const applyPreset = (preset: typeof labelPresets[0]) => {
    updateConfig("width", preset.width);
    updateConfig("height", preset.height);
    updateConfig("qrSize", Math.min(preset.width, preset.height) * 0.6);
  };

  const toggleAsset = (asset: Asset) => {
    setSelectedAssets((prev) => {
      const exists = prev.find((a) => a.id === asset.id);
      if (exists) {
        return prev.filter((a) => a.id !== asset.id);
      }
      return [...prev, asset];
    });
  };

  const handlePrint = async () => {
    if (selectedAssets.length === 0) {
      toast.error("Select assets first");
      return;
    }
    try {
      const mmToPt = (mm: number): number => mm * 2.834645669291339;
      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

      const snipeBaseUrl = systemStatusQuery.data?.snipeIt.baseUrl ?? null;
      const normalizedBaseUrl = snipeBaseUrl ? snipeBaseUrl.replace(/\/+$/, "") : null;

      const tapeWidthMm = Math.min(config.width, config.height);
      const padMm = config.padding;
      const isLandscape = config.orientation === "landscape";

      for (const asset of selectedAssets) {
        let qrValue: string = String(asset.id);
        if (qrPayloadMode === "assetTag" && asset.assetTag) {
          qrValue = asset.assetTag;
        } else if (qrPayloadMode === "snipeItUrl") {
          if (normalizedBaseUrl && asset.snipeAssetId !== null) {
            qrValue = `${normalizedBaseUrl}/hardware/${asset.snipeAssetId}`;
          } else if (asset.assetTag) {
            qrValue = asset.assetTag;
          }
        }

        const pngDataUrl = await QRCode.toDataURL(qrValue, { margin: 0, errorCorrectionLevel: "M" });
        const qrPng = await doc.embedPng(pngDataUrl);

        const lines: Array<{ text: string; size: number; bold: boolean }> = [];
        if (config.showAssetTag && asset.assetTag) lines.push({ text: asset.assetTag, size: config.fontSize + 2, bold: true });
        if (config.showAssetName && asset.name) lines.push({ text: asset.name, size: config.fontSize, bold: false });
        if (config.showCategory && asset.category.name) lines.push({ text: asset.category.name, size: config.fontSize, bold: false });
        if (config.showLocation && asset.location.name) lines.push({ text: asset.location.name, size: config.fontSize, bold: false });
        if (config.showCustomText && config.customText) lines.push({ text: config.customText, size: config.fontSize - 1, bold: false });

        let maxLineWidthPts = 0;
        for (const l of lines) {
          const w = (l.bold ? fontBold : font).widthOfTextAtSize(l.text, l.size);
          if (w > maxLineWidthPts) maxLineWidthPts = w;
        }

        const qrSizePts = mmToPt(config.qrSize);
        const gapPts = mmToPt(2);
        const padPts = mmToPt(padMm);
        const tapeWidthPts = mmToPt(tapeWidthMm);
        const contentSpanPts = qrSizePts + gapPts + maxLineWidthPts;

        const pageWidthPts = isLandscape ? contentSpanPts + padPts * 2 : tapeWidthPts;
        const pageHeightPts = isLandscape ? tapeWidthPts : contentSpanPts + padPts * 2;

        const page = doc.addPage([pageWidthPts, pageHeightPts]);

        if (config.showBorder) {
          page.drawRectangle({ x: mmToPt(0.5), y: mmToPt(0.5), width: pageWidthPts - mmToPt(1), height: pageHeightPts - mmToPt(1), borderColor: rgb(0.89, 0.93, 0.97), borderWidth: 1 });
        }

        if (isLandscape) {
          const qrX = padPts;
          const qrY = (pageHeightPts - qrSizePts) / 2;
          page.drawImage(qrPng, { x: qrX, y: qrY, width: qrSizePts, height: qrSizePts });
          const textX = qrX + qrSizePts + gapPts;
          const lineHeights = lines.map((l) => l.size * 1.25);
          const totalTextH = lineHeights.reduce((a, b) => a + b, 0);
          let baseY = (pageHeightPts - totalTextH) / 2 + (lineHeights[0] - (lines[0]?.size ?? 0));
          for (let i = 0; i < lines.length; i++) {
            const l = lines[i];
            const y = baseY + lineHeights.slice(0, i).reduce((a, b) => a + b, 0);
            page.drawText(l.text, { x: textX, y, size: l.size, font: l.bold ? fontBold : font, color: rgb(0, 0, 0) });
          }
        } else {
          const qrX = (pageWidthPts - qrSizePts) / 2;
          const qrY = padPts;
          page.drawImage(qrPng, { x: qrX, y: qrY, width: qrSizePts, height: qrSizePts });
          const lineHeights = lines.map((l) => l.size * 1.25);
          let y = qrY + qrSizePts + gapPts;
          for (const l of lines) {
            const w = (l.bold ? fontBold : font).widthOfTextAtSize(l.text, l.size);
            const x = (pageWidthPts - w) / 2;
            page.drawText(l.text, { x, y, size: l.size, font: l.bold ? fontBold : font, color: rgb(0, 0, 0) });
            y += l.size * 1.25;
          }
        }
      }

      const pdfBytes = await doc.save();
      const ab = new ArrayBuffer(pdfBytes.byteLength);
      new Uint8Array(ab).set(pdfBytes);
      const blob = new Blob([ab], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      iframe.src = url;
      document.body.appendChild(iframe);
      iframe.onload = () => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => {
          document.body.removeChild(iframe);
          URL.revokeObjectURL(url);
        }, 60_000);
      };
      toast.success("Print dialog opened");
    } catch {
      toast.error("Failed to print labels");
    }
  };

  const handleExport = async () => {
    if (selectedAssets.length === 0) {
      toast.error("Select assets first");
      return;
    }
    try {
      const mmToPt = (mm: number): number => mm * 2.834645669291339;
      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

      const snipeBaseUrl = systemStatusQuery.data?.snipeIt.baseUrl ?? null;
      const normalizedBaseUrl = snipeBaseUrl ? snipeBaseUrl.replace(/\/+$/, "") : null;

      const tapeWidthMm = Math.min(config.width, config.height);
      const padMm = config.padding;
      const isLandscape = config.orientation === "landscape";

      for (const asset of selectedAssets) {
        let qrValue: string = String(asset.id);
        if (qrPayloadMode === "assetTag" && asset.assetTag) {
          qrValue = asset.assetTag;
        } else if (qrPayloadMode === "snipeItUrl") {
          if (normalizedBaseUrl && asset.snipeAssetId !== null) {
            qrValue = `${normalizedBaseUrl}/hardware/${asset.snipeAssetId}`;
          } else if (asset.assetTag) {
            qrValue = asset.assetTag;
          }
        }

        const pngDataUrl = await QRCode.toDataURL(qrValue, { margin: 0, errorCorrectionLevel: "M" });
        const qrPng = await doc.embedPng(pngDataUrl);

        const lines: Array<{ text: string; size: number; bold: boolean }> = [];
        if (config.showAssetTag && asset.assetTag) lines.push({ text: asset.assetTag, size: config.fontSize + 2, bold: true });
        if (config.showAssetName && asset.name) lines.push({ text: asset.name, size: config.fontSize, bold: false });
        if (config.showCategory && asset.category.name) lines.push({ text: asset.category.name, size: config.fontSize, bold: false });
        if (config.showLocation && asset.location.name) lines.push({ text: asset.location.name, size: config.fontSize, bold: false });
        if (config.showCustomText && config.customText) lines.push({ text: config.customText, size: config.fontSize - 1, bold: false });

        let maxLineWidthPts = 0;
        for (const l of lines) {
          const w = (l.bold ? fontBold : font).widthOfTextAtSize(l.text, l.size);
          if (w > maxLineWidthPts) maxLineWidthPts = w;
        }

        const qrSizePts = mmToPt(config.qrSize);
        const gapPts = mmToPt(2);
        const padPts = mmToPt(padMm);
        const tapeWidthPts = mmToPt(tapeWidthMm);
        const contentSpanPts = qrSizePts + gapPts + maxLineWidthPts;

        const pageWidthPts = isLandscape ? contentSpanPts + padPts * 2 : tapeWidthPts;
        const pageHeightPts = isLandscape ? tapeWidthPts : contentSpanPts + padPts * 2;

        const page = doc.addPage([pageWidthPts, pageHeightPts]);

        if (config.showBorder) {
          page.drawRectangle({ x: mmToPt(0.5), y: mmToPt(0.5), width: pageWidthPts - mmToPt(1), height: pageHeightPts - mmToPt(1), borderColor: rgb(0.89, 0.93, 0.97), borderWidth: 1 });
        }

        if (isLandscape) {
          const qrX = padPts;
          const qrY = (pageHeightPts - qrSizePts) / 2;
          page.drawImage(qrPng, { x: qrX, y: qrY, width: qrSizePts, height: qrSizePts });
          const textX = qrX + qrSizePts + gapPts;
          const lineHeights = lines.map((l) => l.size * 1.25);
          const totalTextH = lineHeights.reduce((a, b) => a + b, 0);
          let baseY = (pageHeightPts - totalTextH) / 2 + (lineHeights[0] - (lines[0]?.size ?? 0));
          for (let i = 0; i < lines.length; i++) {
            const l = lines[i];
            const y = baseY + lineHeights.slice(0, i).reduce((a, b) => a + b, 0);
            page.drawText(l.text, { x: textX, y, size: l.size, font: l.bold ? fontBold : font, color: rgb(0, 0, 0) });
          }
        } else {
          const qrX = (pageWidthPts - qrSizePts) / 2;
          const qrY = padPts;
          page.drawImage(qrPng, { x: qrX, y: qrY, width: qrSizePts, height: qrSizePts });
          const lineHeights = lines.map((l) => l.size * 1.25);
          let y = qrY + qrSizePts + gapPts;
          for (const l of lines) {
            const w = (l.bold ? fontBold : font).widthOfTextAtSize(l.text, l.size);
            const x = (pageWidthPts - w) / 2;
            page.drawText(l.text, { x, y, size: l.size, font: l.bold ? fontBold : font, color: rgb(0, 0, 0) });
            y += l.size * 1.25;
          }
        }
      }

      const pdfBytes = await doc.save();
      const ab = new ArrayBuffer(pdfBytes.byteLength);
      new Uint8Array(ab).set(pdfBytes);
      const blob = new Blob([ab], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "labels.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      toast.success("PDF exported");
    } catch (err) {
      toast.error("Failed to export PDF");
    }
  };

  const getPreviewScale = (widthMm: number, heightMm: number): number => {
    const maxWidth = 260;
    const maxHeight = 100;
    return Math.min(4, Math.max(2, Math.min(maxWidth / widthMm, maxHeight / heightMm)));
  };

  const PdfLabelPreview = ({ asset }: { asset: Asset }) => {
    const [url, setUrl] = useState<string | null>(null);
    const [dimsMm, setDimsMm] = useState<{ w: number; h: number } | null>(null);
    useEffect(() => {
      let isMounted = true;
      let prevUrl: string | null = null;
      const mmToPt = (mm: number): number => mm * 2.834645669291339;
      const ptToMm = (pt: number): number => pt / 2.834645669291339;

      const run = async (): Promise<void> => {
        const doc = await PDFDocument.create();
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

        const snipeBaseUrl = systemStatusQuery.data?.snipeIt.baseUrl ?? null;
        const normalizedBaseUrl = snipeBaseUrl ? snipeBaseUrl.replace(/\/+$/, "") : null;

        let qrValue: string = String(asset.id);
        if (qrPayloadMode === "assetTag" && asset.assetTag) {
          qrValue = asset.assetTag;
        } else if (qrPayloadMode === "snipeItUrl") {
          if (normalizedBaseUrl && asset.snipeAssetId !== null) {
            qrValue = `${normalizedBaseUrl}/hardware/${asset.snipeAssetId}`;
          } else if (asset.assetTag) {
            qrValue = asset.assetTag;
          }
        }

        const pngDataUrl = await QRCode.toDataURL(qrValue, { margin: 0, errorCorrectionLevel: "M" });
        const qrPng = await doc.embedPng(pngDataUrl);

        const lines: Array<{ text: string; size: number; bold: boolean }> = [];
        if (config.showAssetTag && asset.assetTag) lines.push({ text: asset.assetTag, size: config.fontSize + 2, bold: true });
        if (config.showAssetName && asset.name) lines.push({ text: asset.name, size: config.fontSize, bold: false });
        if (config.showCategory && asset.category.name) lines.push({ text: asset.category.name, size: config.fontSize, bold: false });
        if (config.showLocation && asset.location.name) lines.push({ text: asset.location.name, size: config.fontSize, bold: false });
        if (config.showCustomText && config.customText) lines.push({ text: config.customText, size: config.fontSize - 1, bold: false });

        let maxLineWidthPts = 0;
        for (const l of lines) {
          const w = (l.bold ? fontBold : font).widthOfTextAtSize(l.text, l.size);
          if (w > maxLineWidthPts) maxLineWidthPts = w;
        }

        const tapeWidthMm = Math.min(config.width, config.height);
        const qrSizePts = mmToPt(config.qrSize);
        const gapPts = mmToPt(2);
        const padPts = mmToPt(config.padding);
        const tapeWidthPts = mmToPt(tapeWidthMm);
        const contentSpanPts = qrSizePts + gapPts + maxLineWidthPts;

        const isLandscape = config.orientation === "landscape";
        const pageWidthPts = isLandscape ? contentSpanPts + padPts * 2 : tapeWidthPts;
        const pageHeightPts = isLandscape ? tapeWidthPts : contentSpanPts + padPts * 2;

        const page = doc.addPage([pageWidthPts, pageHeightPts]);

        if (config.showBorder) {
          page.drawRectangle({ x: mmToPt(0.5), y: mmToPt(0.5), width: pageWidthPts - mmToPt(1), height: pageHeightPts - mmToPt(1), borderColor: rgb(0.89, 0.93, 0.97), borderWidth: 1 });
        }

        if (isLandscape) {
          const qrX = padPts;
          const qrY = (pageHeightPts - qrSizePts) / 2;
          page.drawImage(qrPng, { x: qrX, y: qrY, width: qrSizePts, height: qrSizePts });
          const textX = qrX + qrSizePts + gapPts;
          const lineHeights = lines.map((l) => l.size * 1.25);
          const totalTextH = lineHeights.reduce((a, b) => a + b, 0);
          let baseY = (pageHeightPts - totalTextH) / 2 + (lineHeights[0] - (lines[0]?.size ?? 0));
          for (let i = 0; i < lines.length; i++) {
            const l = lines[i];
            const y = baseY + lineHeights.slice(0, i).reduce((a, b) => a + b, 0);
            page.drawText(l.text, { x: textX, y, size: l.size, font: l.bold ? fontBold : font, color: rgb(0, 0, 0) });
          }
        } else {
          const qrX = (pageWidthPts - qrSizePts) / 2;
          const qrY = padPts;
          page.drawImage(qrPng, { x: qrX, y: qrY, width: qrSizePts, height: qrSizePts });
          const lineHeights = lines.map((l) => l.size * 1.25);
          let y = qrY + qrSizePts + gapPts;
          for (const l of lines) {
            const w = (l.bold ? fontBold : font).widthOfTextAtSize(l.text, l.size);
            const x = (pageWidthPts - w) / 2;
            page.drawText(l.text, { x, y, size: l.size, font: l.bold ? fontBold : font, color: rgb(0, 0, 0) });
            y += l.size * 1.25;
          }
        }

        const pdfBytes = await doc.save();
        const ab = new ArrayBuffer(pdfBytes.byteLength);
        new Uint8Array(ab).set(pdfBytes);
        const blob = new Blob([ab], { type: "application/pdf" });
        prevUrl = URL.createObjectURL(blob);
        if (isMounted) setUrl(prevUrl);
        if (isMounted) setDimsMm({ w: ptToMm(pageWidthPts), h: ptToMm(pageHeightPts) });
      };

      void run();
      return () => {
        isMounted = false;
        if (prevUrl) URL.revokeObjectURL(prevUrl);
      };
    }, [asset, config, qrPayloadMode, systemStatusQuery.data?.snipeIt.baseUrl]);

    const widthMm = dimsMm?.w ?? Math.min(config.width, config.height);
    const heightMm = dimsMm?.h ?? Math.max(config.width, config.height);
    const scale = getPreviewScale(widthMm, heightMm);

    return (
      <div
        className="bg-white text-slate-900 flex items-center justify-center"
        style={{ width: widthMm * scale, height: heightMm * scale, border: config.showBorder ? "1px solid #e2e8f0" : "none" }}
      >
        {url ? <object data={url} type="application/pdf" className="w-full h-full" /> : <div className="text-xs text-muted-foreground">Rendering…</div>}
      </div>
    );
  };

  const resetConfig = () => {
    setConfig(defaultDesignerConfig);
    setGridColumns(3);
    setQrPayloadMode("assetId");
    toast.info("Configuration reset to defaults");
  };

  const handleQrPayloadModeChange = (value: string) => {
    setQrPayloadMode(value as LabelDesignerQrPayloadMode);
  };

  const LabelPreview = ({ asset }: { asset: Asset }) => {
    const isLandscape = config.orientation === "landscape";
    const displayWidth = isLandscape ? config.width : config.height;
    const displayHeight = isLandscape ? config.height : config.width;
    const scale = getPreviewScale(displayWidth, displayHeight);
    const snipeBaseUrl = systemStatusQuery.data?.snipeIt.baseUrl ?? null;
    const normalizedBaseUrl = snipeBaseUrl ? snipeBaseUrl.replace(/\/+$/, "") : null;

    let qrValue = asset.id;
    if (qrPayloadMode === "assetTag") {
      qrValue = asset.assetTag;
    } else if (qrPayloadMode === "snipeItUrl") {
      qrValue =
        normalizedBaseUrl && asset.snipeAssetId !== null
          ? `${normalizedBaseUrl}/hardware/${asset.snipeAssetId}`
          : asset.assetTag;
    }

    return (
      <div
        className="bg-white text-slate-900 flex items-center gap-1 print:break-inside-avoid"
        style={{
          width: displayWidth * scale,
          height: displayHeight * scale,
          padding: config.padding * scale,
          borderRadius: config.borderRadius * scale,
          border: config.showBorder ? "1px solid #e2e8f0" : "none",
          fontSize: config.fontSize * (scale / 2),
        }}
      >
        <QRCodeSVG
          value={qrValue}
          size={config.qrSize * scale}
          level="M"
          includeMargin={false}
        />
        <div className="flex flex-col justify-center flex-1 min-w-0 overflow-hidden">
          {config.showAssetTag && (
            <div className="font-bold truncate" style={{ fontSize: (config.fontSize + 2) * (scale / 2) }}>
              {asset.assetTag}
            </div>
          )}
          {config.showAssetName && (
            <div className="truncate opacity-80">{asset.name}</div>
          )}
          {config.showCategory && (
            <div className="truncate opacity-60">{asset.category.name ?? "—"}</div>
          )}
          {config.showLocation && (
            <div className="truncate opacity-60">{asset.location.name ?? "—"}</div>
          )}
          {config.showCustomText && config.customText && (
            <div className="truncate opacity-50 italic" style={{ fontSize: (config.fontSize - 1) * (scale / 2) }}>
              {config.customText}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-[1400px] space-y-6 p-6">
        <div className="rounded-2xl border border-border/60 bg-card/70 shadow-sm p-6">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div>
              <h1 className="text-2xl md:text-3xl font-semibold text-foreground flex items-center gap-3">
                <div className="p-2 rounded-xl bg-primary/10 shadow-sm">
                  <QrCode className="h-8 w-8 text-primary" />
                </div>
                Label Print Designer
              </h1>
              <p className="text-muted-foreground mt-1">
                Design and print QR code labels for your assets
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {canEditDefaults ? (
                <Button
                  variant="outline"
                  disabled={saveDefaultsMutation.isPending}
                  onClick={() => saveDefaultsMutation.mutate()}
                  className="bg-background/80 shadow-sm"
                >
                  <Settings2 className="h-4 w-4 mr-2" />
                  Save Defaults
                </Button>
              ) : null}
              <Button variant="outline" onClick={resetConfig} disabled={controlsLocked} className="bg-background/80 shadow-sm">
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset
              </Button>
              <Button variant="outline" onClick={handleExport} className="bg-background/80 shadow-sm">
                <Download className="h-4 w-4 mr-2" />
                Export PDF
              </Button>
              <Button onClick={handlePrint} className="bg-primary hover:bg-primary/90 shadow-sm">
                <Printer className="h-4 w-4 mr-2" />
                Print Labels
              </Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Panel - Configuration */}
        <div className="lg:col-span-1 space-y-4">
          <Tabs value={tabValue} onValueChange={setTabValue} className="w-full">
            <TabsList className="grid w-full grid-cols-3 rounded-xl bg-muted/50 p-1 border border-border/60">
              <TabsTrigger value="layout" className="relative rounded-lg text-xs font-semibold transition-all duration-200 ease-out data-[state=active]:bg-background data-[state=active]:shadow-[0_8px_20px_rgba(59,130,246,0.25)] data-[state=active]:text-foreground active:scale-[0.98]">
                {tabValue === "layout" && (
                  <motion.span
                    layoutId="label-designer-tab-indicator"
                    className="absolute inset-x-2 -bottom-1 h-0.5 rounded-full bg-primary/80"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <Layers className="h-4 w-4 mr-1" />
                Layout
              </TabsTrigger>
              <TabsTrigger value="content" className="relative rounded-lg text-xs font-semibold transition-all duration-200 ease-out data-[state=active]:bg-background data-[state=active]:shadow-[0_8px_20px_rgba(59,130,246,0.25)] data-[state=active]:text-foreground active:scale-[0.98]">
                {tabValue === "content" && (
                  <motion.span
                    layoutId="label-designer-tab-indicator"
                    className="absolute inset-x-2 -bottom-1 h-0.5 rounded-full bg-primary/80"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <Type className="h-4 w-4 mr-1" />
                Content
              </TabsTrigger>
              <TabsTrigger value="style" className="relative rounded-lg text-xs font-semibold transition-all duration-200 ease-out data-[state=active]:bg-background data-[state=active]:shadow-[0_8px_20px_rgba(59,130,246,0.25)] data-[state=active]:text-foreground active:scale-[0.98]">
                {tabValue === "style" && (
                  <motion.span
                    layoutId="label-designer-tab-indicator"
                    className="absolute inset-x-2 -bottom-1 h-0.5 rounded-full bg-primary/80"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <Palette className="h-4 w-4 mr-1" />
                Style
              </TabsTrigger>
            </TabsList>

            <TabsContent value="layout" className="mt-4">
              <Card className="border-border/60 bg-card/70 shadow-sm">
                <CardHeader className="pb-4 border-b border-border/60">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Settings2 className="h-4 w-4" />
                    Label Size
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Presets */}
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Quick Presets</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {labelPresets.map((preset) => (
                        <Button
                          key={preset.name}
                          variant="outline"
                          size="sm"
                          className="text-xs h-8"
                          onClick={() => applyPreset(preset)}
                          disabled={controlsLocked}
                        >
                          {preset.name}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <Separator className="bg-border/50" />

                  {/* Custom Size */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs">Width (mm)</Label>
                      <Input
                        type="number"
                        value={config.width}
                        onChange={(e) => updateConfig("width", parseInt(e.target.value) || 30)}
                        disabled={controlsLocked}
                        className="h-8 bg-background/80"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Height (mm)</Label>
                      <Input
                        type="number"
                        value={config.height}
                        onChange={(e) => updateConfig("height", parseInt(e.target.value) || 20)}
                        disabled={controlsLocked}
                        className="h-8 bg-background/80"
                      />
                    </div>
                  </div>

                  {/* Orientation */}
                  <div className="space-y-2">
                    <Label className="text-xs">Orientation</Label>
                    <Select
                      value={config.orientation}
                      onValueChange={(v) => updateConfig("orientation", v as LabelDesignerConfig["orientation"])}
                      disabled={controlsLocked}
                    >
                      <SelectTrigger className="h-8 bg-background/80">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="landscape">Landscape</SelectItem>
                        <SelectItem value="portrait">Portrait</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* QR Size */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">QR Code Size</Label>
                      <span className="text-xs text-muted-foreground">{config.qrSize}mm</span>
                    </div>
                    <Slider
                      value={[config.qrSize]}
                      onValueChange={([v]) => updateConfig("qrSize", v)}
                      min={10}
                      max={Math.min(config.width, config.height) - 5}
                      step={1}
                      disabled={controlsLocked}
                      className="py-2"
                    />
                  </div>

                  {/* QR Payload */}
                  <div className="space-y-2">
                    <Label className="text-xs">QR Payload</Label>
                    <Select value={qrPayloadMode} onValueChange={handleQrPayloadModeChange} disabled={controlsLocked}>
                      <SelectTrigger className="h-8 bg-background/80">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="assetId">Asset ID</SelectItem>
                        <SelectItem value="assetTag">Asset Tag</SelectItem>
                        <SelectItem value="snipeItUrl">Snipe-IT URL</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="text-xs text-muted-foreground">
                      Snipe-IT URL falls back to Asset Tag when unavailable.
                    </div>
                  </div>

                  {/* Grid Columns */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Print Grid Columns</Label>
                      <span className="text-xs text-muted-foreground">{gridColumns}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setGridColumns(Math.max(1, gridColumns - 1))}
                        disabled={controlsLocked}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <Slider
                        value={[gridColumns]}
                        onValueChange={([v]) => setGridColumns(v)}
                        min={1}
                        max={6}
                        step={1}
                        disabled={controlsLocked}
                        className="flex-1"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setGridColumns(Math.min(6, gridColumns + 1))}
                        disabled={controlsLocked}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="content" className="mt-4">
              <Card className="border-border/60 bg-card/70 shadow-sm">
                <CardHeader className="pb-4 border-b border-border/60">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Type className="h-4 w-4" />
                    Label Content
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Toggle Options */}
                  <div className="space-y-3">
                    {contentToggleItems.map((item) => (
                      <div key={item.key} className="flex items-center justify-between">
                        <Label className="text-sm">{item.label}</Label>
                        <Switch
                          checked={Boolean(config[item.key])}
                          onCheckedChange={(v) => updateConfig(item.key, v)}
                          disabled={controlsLocked}
                        />
                      </div>
                    ))}
                  </div>

                  {config.showCustomText && (
                    <>
                      <Separator className="bg-border/50" />
                      <div className="space-y-2">
                        <Label className="text-xs">Custom Text</Label>
                        <Input
                          value={config.customText}
                          onChange={(e) => updateConfig("customText", e.target.value)}
                          placeholder="Enter custom text..."
                          disabled={controlsLocked}
                          className="h-8 bg-background/80"
                        />
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="style" className="mt-4">
              <Card className="border-border/60 bg-card/70 shadow-sm">
                <CardHeader className="pb-4 border-b border-border/60">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Palette className="h-4 w-4" />
                    Appearance
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Font Size */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Font Size</Label>
                      <span className="text-xs text-muted-foreground">{config.fontSize}pt</span>
                    </div>
                    <Slider
                      value={[config.fontSize]}
                      onValueChange={([v]) => updateConfig("fontSize", v)}
                      min={5}
                      max={14}
                      step={1}
                      disabled={controlsLocked}
                    />
                  </div>

                  {/* Padding */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Padding</Label>
                      <span className="text-xs text-muted-foreground">{config.padding}mm</span>
                    </div>
                    <Slider
                      value={[config.padding]}
                      onValueChange={([v]) => updateConfig("padding", v)}
                      min={1}
                      max={10}
                      step={1}
                      disabled={controlsLocked}
                    />
                  </div>

                  {/* Border Radius */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Corner Radius</Label>
                      <span className="text-xs text-muted-foreground">{config.borderRadius}mm</span>
                    </div>
                    <Slider
                      value={[config.borderRadius]}
                      onValueChange={([v]) => updateConfig("borderRadius", v)}
                      min={0}
                      max={10}
                      step={1}
                      disabled={controlsLocked}
                    />
                  </div>

                  <Separator className="bg-border/50" />

                  {/* Border Toggle */}
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Show Border</Label>
                    <Switch
                      checked={config.showBorder}
                      onCheckedChange={(v) => updateConfig("showBorder", v)}
                      disabled={controlsLocked}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Asset Selection */}
          <Card className="border-border/60 bg-card/70 shadow-sm">
            <CardHeader className="pb-4 border-b border-border/60">
              <CardTitle className="text-sm font-semibold flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Grid3X3 className="h-4 w-4" />
                  Select Assets
                </span>
                <span className="text-xs text-muted-foreground font-normal">
                  {selectedAssets.length} selected
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Input
                    value={assetSearch}
                    onChange={(e) => {
                      setAssetSearch(e.target.value);
                      setAssetPage(1);
                    }}
                    placeholder="Search assets…"
                    className="h-8 bg-background/80"
                  />
                  <Select
                    value={assetCategoryId}
                    onValueChange={(v) => {
                      setAssetCategoryId(v);
                      setAssetPage(1);
                    }}
                  >
                  <SelectTrigger className="h-8 w-[200px] bg-background/80">
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categoryItems.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {assetsQuery.isLoading ? (
                    <div className="text-sm text-muted-foreground">Loading assets…</div>
                  ) : assetsQuery.isError ? (
                    <div className="text-sm text-destructive">Failed to load assets.</div>
                  ) : availableAssets.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No assets found.</div>
                  ) : (
                    availableAssets.map((asset) => {
                  const isSelected = selectedAssets.some((a) => a.id === asset.id);
                  return (
                    <motion.div
                      key={asset.id}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors shadow-sm ${
                        isSelected
                          ? "border-primary bg-primary/10"
                          : "border-border/60 bg-background/80 hover:border-border"
                      }`}
                      onClick={() => toggleAsset(asset)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="min-w-0">
                          <div className="font-medium text-sm truncate">{asset.assetTag}</div>
                          <div className="text-xs text-muted-foreground truncate">{asset.name}</div>
                        </div>
                        <div
                          className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                            isSelected ? "border-primary bg-primary" : "border-muted-foreground/50"
                          }`}
                        >
                          {isSelected && (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className="w-2 h-2 bg-primary-foreground rounded-full"
                            />
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                    })
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAssetPage((p) => Math.max(1, p - 1))}
                    disabled={assetPage <= 1 || assetsQuery.isLoading}
                  >
                    Prev
                  </Button>
                  <div className="text-xs text-muted-foreground">Page {assetPage}</div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAssetPage((p) => p + 1)}
                    disabled={assetsQuery.isLoading || availableAssets.length < assetPageSize}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Panel - Preview */}
        <div className="lg:col-span-2">
          <Card className="border-border/60 bg-card/70 shadow-sm h-full">
            <CardHeader className="pb-4 border-b border-border/60">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Eye className="h-4 w-4" />
                Label Preview
                <span className="text-xs text-muted-foreground font-normal ml-auto">
                  {config.width}mm × {config.height}mm • {selectedAssets.length} label(s)
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {selectedAssets.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                  <QrCode className="h-12 w-12 mb-4 opacity-50" />
                  <p>Select assets to preview labels</p>
                </div>
              ) : (
                <div
                  className="grid gap-4 p-4 rounded-xl min-h-[400px] border border-dashed border-border/60 bg-muted/30"
                  style={{ gridTemplateColumns: `repeat(${gridColumns}, 1fr)` }}
                >
                  {selectedAssets.map((asset) => (
                    <motion.div
                      key={asset.id}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="flex items-center justify-center"
                    >
                      <PdfLabelPreview asset={asset} />
                    </motion.div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

        <style>{`
          @media print {
            body * {
              visibility: hidden;
            }
            .print\\:break-inside-avoid,
            .print\\:break-inside-avoid * {
              visibility: visible;
            }
            .print\\:break-inside-avoid {
              position: absolute;
              left: 0;
              top: 0;
            }
          }
        `}</style>
      </div>
    </div>
  );
}
