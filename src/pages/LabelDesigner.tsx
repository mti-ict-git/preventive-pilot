import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { buildLabelPdf, buildLabelOutput, labelDimensions, labelSafeArea, type LabelDrawing } from "@/lib/labelPdf";
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
  type LabelPaperPreset,
  type LabelDesignerUiSettingsResponse,
  type LabelDesignerQrPayloadMode,
} from "@/lib/api";
import { labelDraftKey, parseLabelDraft } from "@/lib/labelDraft";
import { getJwtClaims, hasAnyRole } from "@/lib/auth";

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
  { name: "Company Asset (82x18mm)", width: 82, height: 18 },
  { name: "Brother 18mm (50x18mm)", width: 50, height: 18 },
  { name: "Brother 24mm (60x24mm)", width: 60, height: 24 },
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

] as const satisfies ReadonlyArray<{ key: keyof LabelDesignerConfig; label: string }>;

export default function LabelDesigner() {
  const queryClient = useQueryClient();
  const [selectedAssets, setSelectedAssets] = useState<Asset[]>([]);
  const [assetSearch, setAssetSearch] = useState<string>("");
  const [assetCategoryId, setAssetCategoryId] = useState<string>("all");
  const [assetPage, setAssetPage] = useState<number>(1);
  const assetPageSize = 200;

  const [isGenerating, setIsGenerating] = useState(false);
  const canEditDefaults = hasAnyRole(["Superadmin", "Admin"]);
  const canCustomizeLayout = canEditDefaults || hasAnyRole(["Technician"]);


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

  const controlsLocked = !canCustomizeLayout || settingsQuery.isLoading || settingsQuery.isError || isGenerating;

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
  const [presetName, setPresetName] = useState("");
  const [presetError, setPresetError] = useState<string | null>(null);
  const paperPresets = settingsQuery.data?.paperPresets ?? [];
  const [tabValue, setTabValue] = useState("layout");
  const safeArea = labelSafeArea(config);
  const outputQuery = useQuery({
    queryKey: ["label-output", selectedAssets, config, qrPayloadMode, systemStatusQuery.data?.snipeIt.baseUrl],
    queryFn: () => buildLabelOutput(selectedAssets, config, qrPayloadMode, systemStatusQuery.data?.snipeIt.baseUrl),
    enabled: selectedAssets.length > 0 && !settingsQuery.isLoading && !settingsQuery.isError,
    retry: false, gcTime: 0,
  });
  const outputBlocked = !outputQuery.data || outputQuery.isFetching || outputQuery.isError;


  const edited = useRef(false);
  const hydrated = useRef(false);
  const [isDirty, setIsDirty] = useState(false);
  const [draftStorageError, setDraftStorageError] = useState(false);
  const draftKey = labelDraftKey(getJwtClaims()?.sub ?? "anonymous");
  const markEdited = () => { edited.current = true; setIsDirty(true); };

  useEffect(() => {
    const data = settingsQuery.data;
    if (!data || hydrated.current || edited.current) return;
    hydrated.current = true;
    let draft = null;
    try { if (canCustomizeLayout) draft = parseLabelDraft(localStorage.getItem(draftKey)); }
    catch { setDraftStorageError(true); }
    const initial = draft ?? data;
    setConfig(initial.config);
    setGridColumns(initial.gridColumns);
    setQrPayloadMode(initial.qrPayloadMode);
    if (draft) { edited.current = true; setIsDirty(true); }

  }, [settingsQuery.data, canCustomizeLayout, draftKey]);

  useEffect(() => {
    if (!isDirty || !canCustomizeLayout) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify({ config, gridColumns, qrPayloadMode }));
      setDraftStorageError(false);
    } catch { setDraftStorageError(true); }
  }, [isDirty, canCustomizeLayout, draftKey, config, gridColumns, qrPayloadMode]);

  const saveDefaultsMutation = useMutation({
    mutationFn: (settings: LabelDesignerUiSettingsResponse) => {
      if (!canEditDefaults) throw new Error("Only Admin/Superadmin can save shared defaults.");
      return apiUpdateLabelDesignerUiSettings(settings);
    },
    onSuccess: async (_data, savedSettings) => {
      if (JSON.stringify(savedSettings.config) === JSON.stringify(config) && savedSettings.qrPayloadMode === qrPayloadMode && savedSettings.gridColumns === gridColumns) {
        edited.current = false;
        setIsDirty(false);
        try { localStorage.removeItem(draftKey); setDraftStorageError(false); } catch { setDraftStorageError(true); }
      }
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
    markEdited();
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const [logoError, setLogoError] = useState<string | null>(null);
  const loadLogo = async (file?: File) => {
    if (!file) return;
    setLogoError(null);
    if (!["image/png", "image/jpeg"].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setLogoError("Use a PNG or JPG logo up to 2 MB."); return;
    }
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("read"));
        reader.readAsDataURL(file);
      });
      updateConfig("logoDataUrl", dataUrl); updateConfig("showLogo", true);
    } catch { setLogoError("Could not read the logo. Select the file again."); }
  };

  const applyPreset = (preset: typeof labelPresets[0]) => {
    const company = preset.name.startsWith("Company Asset");
    updateConfig("layout", company ? "companyAsset" : "standard");
    updateConfig("orientation", "landscape");
    if (company) { updateConfig("showLogo", true); updateConfig("showBorder", true); updateConfig("fontSize", 8); }
    updateConfig("width", preset.width);
    updateConfig("height", preset.height);
    updateConfig("qrSize", Math.floor(Math.min(preset.width, preset.height) * 0.7));
    updateConfig("padding", 1);
  };

  const savePaperPreset = () => {
    if (!canEditDefaults) return;
    const name = presetName.trim();
    if (!name || name.length > 60) { setPresetError("Enter a preset name, up to 60 characters."); return; }
    if (paperPresets.some(p => p.name.toLowerCase() === name.toLowerCase())) { setPresetError("This name already exists. Choose a different name."); return; }
    if (paperPresets.length >= 20) { setPresetError("The shared library supports up to 20 presets."); return; }
    const preset: LabelPaperPreset = { name, width: config.width, height: config.height, orientation: config.orientation,
      qrSize: config.qrSize, padding: config.padding, showBorder: config.showBorder,
      borderInsetMm: config.borderInsetMm ?? (labelDimensions(config).height === 18 ? 1.5 : 0.5), printOffsetYmm: config.printOffsetYmm ?? 0 };
    setPresetError(null);
    saveDefaultsMutation.mutate({ qrPayloadMode, gridColumns, config, paperPresets: [...paperPresets, preset] }, { onSuccess: () => { setPresetName(""); toast.success("Paper preset saved"); } });
  };
  const applyPaperPreset = (preset: LabelPaperPreset) => {
    const { name: _name, ...paper } = preset;
    markEdited(); setConfig(prev => ({ ...prev, ...paper }));
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
      setIsGenerating(true);
      const pdfBytes = await buildLabelPdf(selectedAssets, config, qrPayloadMode, systemStatusQuery.data?.snipeIt.baseUrl);
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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to print labels");
    } finally { setIsGenerating(false); }
  };

  const handleExport = async () => {
    if (selectedAssets.length === 0) {
      toast.error("Select assets first");
      return;
    }
    try {
      setIsGenerating(true);
      const pdfBytes = await buildLabelPdf(selectedAssets, config, qrPayloadMode, systemStatusQuery.data?.snipeIt.baseUrl);
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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to export PDF");
    } finally { setIsGenerating(false); }
  };

  const resetConfig = () => {
    markEdited();
    setConfig(defaultDesignerConfig);
    setGridColumns(3);
    setQrPayloadMode("assetId");
    toast.info("Configuration reset to defaults");
  };

  const handleQrPayloadModeChange = (value: string) => {
    markEdited();
    setQrPayloadMode(value as LabelDesignerQrPayloadMode);
  };

  return (
    <div className="min-h-screen bg-background">
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
                  disabled={saveDefaultsMutation.isPending || settingsQuery.isLoading || settingsQuery.isError || isGenerating}
                  onClick={() => saveDefaultsMutation.mutate({ qrPayloadMode, gridColumns, config, paperPresets })}
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
              <Button variant="outline" onClick={handleExport} disabled={isGenerating || settingsQuery.isLoading || settingsQuery.isError || selectedAssets.length === 0 || outputBlocked} className="bg-background/80 shadow-sm">
                <Download className="h-4 w-4 mr-2" />
                Export PDF
              </Button>
              <Button onClick={handlePrint} disabled={isGenerating || settingsQuery.isLoading || settingsQuery.isError || selectedAssets.length === 0 || outputBlocked} className="bg-primary hover:bg-primary/90 shadow-sm">
                <Printer className="h-4 w-4 mr-2" />
                Print Labels
              </Button>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <p role="status" className="text-sm">{settingsQuery.isLoading ? "Loading saved defaults…" : settingsQuery.isError ? "Saved defaults unavailable." : isDirty ? "Unsaved changes — Print and Export use the current values. Draft retained in this browser." : "Using saved defaults. Print and Export use the values shown below."}</p>
          <p className="text-sm text-muted-foreground">PDF: {labelDimensions(config).width} × {labelDimensions(config).height} mm. One label per page. Match the printer tape width and label length; use actual size (100%).</p>
          {saveDefaultsMutation.isError && <p role="alert" className="text-sm text-destructive">Failed to save defaults. Your current settings and browser draft are retained. Try Save Defaults again.</p>}
          {draftStorageError && <p role="alert" className="text-sm text-destructive">Browser draft storage is unavailable. Your changes may be lost when you leave this page.</p>}
          {settingsQuery.isError && <div role="alert">Failed to load saved defaults. <Button variant="outline" onClick={() => void settingsQuery.refetch()}>Retry</Button></div>}
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
                  <div className="space-y-2">
                    <Label htmlFor="label-layout">Label layout</Label>
                    <Select value={config.layout ?? "standard"} onValueChange={v => updateConfig("layout", v as "standard" | "companyAsset")} disabled={controlsLocked}>
                      <SelectTrigger id="label-layout"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="standard">Standard</SelectItem><SelectItem value="companyAsset">Company Asset</SelectItem></SelectContent>
                    </Select>
                  </div>
                  {config.layout === "companyAsset" && <div className="space-y-2">
                    <Label htmlFor="company-logo">Company logo (PNG/JPG, up to 2 MB)</Label>
                    <Input id="company-logo" type="file" accept="image/png,image/jpeg" disabled={controlsLocked} onChange={e => { void loadLogo(e.target.files?.[0]); e.target.value = ""; }} />
                    {logoError && <p role="alert" className="text-xs text-destructive">{logoError}</p>}
                    <p className="text-xs text-muted-foreground">{config.logoDataUrl ? "Logo included. Save Defaults to share this design." : "Using a reconstructed MTI logo from your reference. Upload the official logo to replace it."}</p>
                    {<Button variant="outline" size="sm" disabled={controlsLocked} onClick={() => updateConfig("showLogo", !config.showLogo)}>{config.showLogo ? "Hide logo" : "Show logo"}</Button>}
                    <div className="space-y-2 pt-2">
                      <div className="flex items-center justify-between"><Label>Logo size</Label><span className="text-sm text-muted-foreground">{config.logoSizePercent ?? 100}%</span></div>
                      <Slider aria-label="Logo size" min={25} max={100} step={1} value={[config.logoSizePercent ?? 100]} disabled={controlsLocked || !config.showLogo} onValueChange={([value]) => updateConfig("logoSizePercent", value)} />
                      <p className="text-xs text-muted-foreground">Fits the visible logo in the header. Blank outer margins are ignored; text and QR stay separate.</p>
                    </div>
                    <p className="text-xs text-muted-foreground">Company Asset prints the asset name, QR, Company Asset and DON'T REMOVE. Standard content toggles apply to Standard layout.</p>
                  </div>}
                  {/* Presets */}
                  <div className="space-y-2">
                    <div className="space-y-2">
                      <Label htmlFor="paper-preset">Saved paper presets</Label>
                      <Select disabled={controlsLocked || saveDefaultsMutation.isPending || paperPresets.length === 0} value="" onValueChange={name => { const preset = paperPresets.find(p => p.name === name); if (preset) applyPaperPreset(preset); }}>
                        <SelectTrigger id="paper-preset"><SelectValue placeholder={paperPresets.length ? "Choose a paper preset" : "No saved presets"} /></SelectTrigger>
                        <SelectContent>{paperPresets.map(p => <SelectItem key={p.name} value={p.name}>{p.name} / {p.width} x {p.height} mm</SelectItem>)}</SelectContent>
                      </Select>
                      {canEditDefaults && <>
                      <Label htmlFor="paper-preset-name">New preset name</Label>
                      <Input id="paper-preset-name" maxLength={60} value={presetName} disabled={controlsLocked || saveDefaultsMutation.isPending} onChange={e => { setPresetName(e.target.value); setPresetError(null); }} aria-invalid={!!presetError} aria-describedby="paper-preset-help" placeholder="Brother 45x18 - calibrated" />
                      <Button variant="outline" disabled={controlsLocked || saveDefaultsMutation.isPending} onClick={savePaperPreset}>{saveDefaultsMutation.isPending ? "Saving..." : "Save new paper preset"}</Button>
                      </>}
                      <p id="paper-preset-help" className="text-xs text-muted-foreground">{canEditDefaults ? "Saves current defaults and a shared preset with dimensions, QR size, padding, border and print position. Applying a preset keeps your logo and content." : "Apply a shared preset, then customize it for your print. Your changes stay in your personal browser draft."}</p>
                      {presetError && <p role="alert" className="text-sm text-destructive">{presetError}</p>}
                    </div>
                    <Separator />
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
                      <Label htmlFor="label-length" className="text-xs">Label Length (mm)</Label>
                      <Input
                        id="label-length" min={10} max={200} type="number"
                        value={config.width}
                        onChange={(e) => updateConfig("width", parseInt(e.target.value) || 30)}
                        disabled={controlsLocked}
                        className="h-8 bg-background/80"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="label-tape-width" className="text-xs">Tape Width (mm)</Label>
                      <Input
                        id="label-tape-width" min={10} max={200} type="number"
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

                  <div className="space-y-2">
                    <div className="flex items-center justify-between"><Label>Vertical print position</Label><span className="text-sm text-muted-foreground">{(config.printOffsetYmm ?? 0).toFixed(1)} mm / {(config.printOffsetYmm ?? 0) > 0 ? "Down" : (config.printOffsetYmm ?? 0) < 0 ? "Up" : "Centered"}</span></div>
                    <Slider aria-label="Vertical print position" min={-1} max={1} step={0.1} value={[config.printOffsetYmm ?? 0]} disabled={controlsLocked} onValueChange={([value]) => updateConfig("printOffsetYmm", value)} />
                    <div className="flex justify-between text-xs text-muted-foreground"><span>Up</span><span>Down</span></div>
                    <Button variant="outline" size="sm" disabled={controlsLocked} onClick={() => updateConfig("printOffsetYmm", 0)}>Center print position</Button>
                    <p className="text-xs text-muted-foreground">Moves the entire design, including QR and border. Start with +0.2 mm if printing sits too high. Print one label to calibrate.</p>
                  </div>
                  {/* QR Size */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between"><Label htmlFor="label-border">Enable border</Label><Switch id="label-border" checked={config.showBorder} onCheckedChange={v => updateConfig("showBorder", v)} disabled={controlsLocked} /></div>
                    <div className="flex items-center justify-between"><Label>Border inset</Label><span className="text-sm text-muted-foreground">{(config.borderInsetMm ?? (labelDimensions(config).height === 18 ? 1.5 : 0.5)).toFixed(1)} mm</span></div>
                    <Slider aria-label="Border inset" min={0.5} max={4} step={0.1} value={[config.borderInsetMm ?? (labelDimensions(config).height === 18 ? 1.5 : 0.5)]} disabled={controlsLocked || !config.showBorder} onValueChange={([value]) => updateConfig("borderInsetMm", value)} />
                    <p className="text-xs text-muted-foreground">Requested: {safeArea.requestedBorderInsetMm.toFixed(1)} mm. Effective border inset: {config.showBorder ? `${safeArea.effectiveBorderInsetMm.toFixed(1)} mm` : "border off"}. Content inset: {safeArea.contentInsetMm.toFixed(1)} mm.</p>
                    <p className="text-xs text-muted-foreground">Safe content area: {safeArea.widthMm.toFixed(1)} x {safeArea.heightMm.toFixed(1)} mm. Logo, text and QR share this area; QR includes its clear border. Increase label size or reduce QR/inset if it does not fit.</p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">QR Code Size (including clear border)</Label>
                      <span className="text-xs text-muted-foreground">{config.qrSize}mm</span>
                    </div>
                    <Slider
                      value={[config.qrSize]}
                      onValueChange={([v]) => updateConfig("qrSize", v)}
                      aria-label="QR code size"
                      min={5}
                      max={Math.max(5, Math.min(config.width, config.height) - config.padding * 2)}
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
                      <Label className="text-xs">Preview Grid Columns</Label>
                      <span className="text-xs text-muted-foreground">{gridColumns}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        aria-label="Fewer preview columns"
                        onClick={() => { markEdited(); setGridColumns(Math.max(1, gridColumns - 1)); }}
                        disabled={controlsLocked}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <Slider
                        value={[gridColumns]}
                        onValueChange={([v]) => { markEdited(); setGridColumns(v); }}
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
                        aria-label="More preview columns"
                        onClick={() => { markEdited(); setGridColumns(Math.min(6, gridColumns + 1)); }}
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

                  <Separator className="bg-border/50" />

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
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      aria-label={`Select ${asset.name} (${asset.assetTag})`}
                      key={asset.id}
                      className={`w-full p-3 text-left rounded-lg border cursor-pointer transition-colors shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
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
                    </button>
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
                  style={{ gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))` }}
                >
                  {selectedAssets.map((asset, index) => (
                    <motion.div
                      key={asset.id}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="flex min-w-0 items-center justify-center overflow-auto"
                    >
                      <PdfLabelPreview asset={asset} config={config} drawing={outputQuery.data?.drawings[index]} error={outputQuery.isError ? (outputQuery.error instanceof Error ? outputQuery.error.message : "Preview failed.") : undefined} />
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

function PdfLabelPreview({ asset, config, drawing, error }: {
  asset: Asset; config: LabelDesignerConfig; drawing?: LabelDrawing; error?: string;
}) {
  const { width, height } = labelDimensions(config);
  const d = drawing;
  return <div className="w-full min-w-0 space-y-2">
    <p className="text-xs text-muted-foreground">{width} × {height} mm</p>
    <div className="w-full rounded border bg-white" style={{ aspectRatio: `${width} / ${height}`, minHeight: 100 }}>
      {error ? <p role="alert" className="p-2 text-xs text-destructive">{error}</p>
        : d ? <svg viewBox={`0 0 ${d.width} ${d.height}`} role="img" aria-label={`Label preview for ${asset.name}`} className="h-full w-full">
          <g transform={`translate(0 ${d.verticalOffset})`}>
          {d.showBorder && <rect x={d.borderInset} y={d.borderInset} width={d.width - d.borderInset*2} height={d.height - d.borderInset*2} fill="none" stroke={d.borderBlack ? "#000" : "#b3b3b3"} strokeWidth={d.borderBlack ? 0.8 : 0.5} />}
          {d.logo && (d.logo.viewport ? <svg x={d.logo.x} y={d.height-d.logo.y-d.logo.height} width={d.logo.width} height={d.logo.height} viewBox={`${d.logo.viewport.x} ${d.logo.viewport.y} ${d.logo.viewport.width} ${d.logo.viewport.height}`} overflow="hidden"><image href={d.logo.dataUrl} width={d.logo.viewport.imageWidth} height={d.logo.viewport.imageHeight} /></svg> : <image href={d.logo.dataUrl} x={d.logo.x} y={d.height-d.logo.y-d.logo.height} width={d.logo.width} height={d.logo.height} />)}
          <image href={d.qr.dataUrl} x={d.qr.x} y={d.height - d.qr.y - d.qr.size} width={d.qr.size} height={d.qr.size} />
          {d.lines.map((line, i) => <text key={i} x={line.x} y={d.height - line.y} fontSize={line.size}
            transform={line.rotation ? `rotate(${-line.rotation} ${line.x} ${d.height-line.y})` : undefined}
            fontWeight={line.bold ? 700 : 400} fontFamily="Helvetica, Arial, sans-serif" fill="#000">{line.text}</text>)}
          </g>
        </svg>
        : <p role="status" className="p-2 text-xs text-muted-foreground">Rendering…</p>}
    </div>
  </div>;
}
