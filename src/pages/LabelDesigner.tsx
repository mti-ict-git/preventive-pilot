import { useState } from "react";
import { motion } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import {
  QrCode,
  Printer,
  Download,
  Plus,
  Minus,
  Type,
  Image,
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

interface LabelConfig {
  width: number;
  height: number;
  qrSize: number;
  showAssetTag: boolean;
  showAssetName: boolean;
  showCategory: boolean;
  showLocation: boolean;
  showCustomText: boolean;
  customText: string;
  fontSize: number;
  padding: number;
  borderRadius: number;
  showBorder: boolean;
  showLogo: boolean;
  orientation: "portrait" | "landscape";
}

interface Asset {
  id: string;
  assetTag: string;
  name: string;
  category: string;
  location: string;
}

const mockAssets: Asset[] = [
  { id: "1", assetTag: "IT-LAP-001", name: "Dell Latitude 5520", category: "Laptop", location: "HQ Floor 2" },
  { id: "2", assetTag: "IT-LAP-002", name: "ThinkPad X1 Carbon", category: "Laptop", location: "HQ Floor 3" },
  { id: "3", assetTag: "IT-SRV-001", name: "Dell PowerEdge R740", category: "Server", location: "DC Room A" },
  { id: "4", assetTag: "IT-MON-001", name: "Dell U2722D", category: "Monitor", location: "HQ Floor 2" },
  { id: "5", assetTag: "IT-NET-001", name: "Cisco Catalyst 9200", category: "Network", location: "DC Room B" },
];

const labelPresets = [
  { name: "Small (30x20mm)", width: 30, height: 20 },
  { name: "Medium (50x30mm)", width: 50, height: 30 },
  { name: "Large (70x40mm)", width: 70, height: 40 },
  { name: "Square (50x50mm)", width: 50, height: 50 },
];

export default function LabelDesigner() {
  const [selectedAssets, setSelectedAssets] = useState<Asset[]>([mockAssets[0]]);
  const [config, setConfig] = useState<LabelConfig>({
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
  });
  const [gridColumns, setGridColumns] = useState(3);

  const updateConfig = <K extends keyof LabelConfig>(key: K, value: LabelConfig[K]) => {
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

  const handlePrint = () => {
    window.print();
    toast.success("Print dialog opened");
  };

  const handleExport = () => {
    toast.success("Labels exported as PDF");
  };

  const resetConfig = () => {
    setConfig({
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
    });
    toast.info("Configuration reset to defaults");
  };

  const LabelPreview = ({ asset }: { asset: Asset }) => {
    const scale = 4;
    const isLandscape = config.orientation === "landscape";
    const displayWidth = isLandscape ? config.width : config.height;
    const displayHeight = isLandscape ? config.height : config.width;

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
          value={`https://snipeit.local/hardware/${asset.id}`}
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
            <div className="truncate opacity-60">{asset.category}</div>
          )}
          {config.showLocation && (
            <div className="truncate opacity-60">{asset.location}</div>
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <QrCode className="h-8 w-8 text-primary" />
            </div>
            Label Print Designer
          </h1>
          <p className="text-muted-foreground mt-1">
            Design and print QR code labels for your assets
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={resetConfig}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset
          </Button>
          <Button variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Export PDF
          </Button>
          <Button onClick={handlePrint} className="bg-primary hover:bg-primary/90">
            <Printer className="h-4 w-4 mr-2" />
            Print Labels
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Panel - Configuration */}
        <div className="lg:col-span-1 space-y-4">
          <Tabs defaultValue="layout" className="w-full">
            <TabsList className="grid w-full grid-cols-3 bg-card/50">
              <TabsTrigger value="layout">
                <Layers className="h-4 w-4 mr-1" />
                Layout
              </TabsTrigger>
              <TabsTrigger value="content">
                <Type className="h-4 w-4 mr-1" />
                Content
              </TabsTrigger>
              <TabsTrigger value="style">
                <Palette className="h-4 w-4 mr-1" />
                Style
              </TabsTrigger>
            </TabsList>

            <TabsContent value="layout" className="mt-4">
              <Card className="border-border/50 bg-card/30 backdrop-blur">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
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
                        className="h-8 bg-background/50"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Height (mm)</Label>
                      <Input
                        type="number"
                        value={config.height}
                        onChange={(e) => updateConfig("height", parseInt(e.target.value) || 20)}
                        className="h-8 bg-background/50"
                      />
                    </div>
                  </div>

                  {/* Orientation */}
                  <div className="space-y-2">
                    <Label className="text-xs">Orientation</Label>
                    <Select
                      value={config.orientation}
                      onValueChange={(v: "portrait" | "landscape") => updateConfig("orientation", v)}
                    >
                      <SelectTrigger className="h-8 bg-background/50">
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
                      className="py-2"
                    />
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
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <Slider
                        value={[gridColumns]}
                        onValueChange={([v]) => setGridColumns(v)}
                        min={1}
                        max={6}
                        step={1}
                        className="flex-1"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setGridColumns(Math.min(6, gridColumns + 1))}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="content" className="mt-4">
              <Card className="border-border/50 bg-card/30 backdrop-blur">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Type className="h-4 w-4" />
                    Label Content
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Toggle Options */}
                  <div className="space-y-3">
                    {[
                      { key: "showAssetTag", label: "Asset Tag" },
                      { key: "showAssetName", label: "Asset Name" },
                      { key: "showCategory", label: "Category" },
                      { key: "showLocation", label: "Location" },
                      { key: "showCustomText", label: "Custom Text" },
                      { key: "showLogo", label: "Company Logo" },
                    ].map((item) => (
                      <div key={item.key} className="flex items-center justify-between">
                        <Label className="text-sm">{item.label}</Label>
                        <Switch
                          checked={config[item.key as keyof LabelConfig] as boolean}
                          onCheckedChange={(v) => updateConfig(item.key as keyof LabelConfig, v)}
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
                          className="h-8 bg-background/50"
                        />
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="style" className="mt-4">
              <Card className="border-border/50 bg-card/30 backdrop-blur">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
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
                    />
                  </div>

                  <Separator className="bg-border/50" />

                  {/* Border Toggle */}
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Show Border</Label>
                    <Switch
                      checked={config.showBorder}
                      onCheckedChange={(v) => updateConfig("showBorder", v)}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Asset Selection */}
          <Card className="border-border/50 bg-card/30 backdrop-blur">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center justify-between">
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
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {mockAssets.map((asset) => {
                  const isSelected = selectedAssets.some((a) => a.id === asset.id);
                  return (
                    <motion.div
                      key={asset.id}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        isSelected
                          ? "border-primary bg-primary/10"
                          : "border-border/50 bg-background/30 hover:border-border"
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
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Panel - Preview */}
        <div className="lg:col-span-2">
          <Card className="border-border/50 bg-card/30 backdrop-blur h-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
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
                  className="grid gap-4 p-4 bg-slate-100 dark:bg-slate-800/50 rounded-lg min-h-[400px]"
                  style={{ gridTemplateColumns: `repeat(${gridColumns}, 1fr)` }}
                >
                  {selectedAssets.map((asset) => (
                    <motion.div
                      key={asset.id}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="flex items-center justify-center"
                    >
                      <LabelPreview asset={asset} />
                    </motion.div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Print Styles - Hidden on screen */}
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
  );
}
