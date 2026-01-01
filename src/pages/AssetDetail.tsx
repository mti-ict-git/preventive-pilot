import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Server,
  MapPin,
  User,
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ExternalLink,
  Edit2,
  FileText,
  Image,
  Download,
  ChevronDown,
  ChevronUp,
  Wrench,
  Shield,
  Activity,
} from "lucide-react";
import Header from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";

const AssetDetail = () => {
  const { assetId } = useParams();
  const [pmEnabled, setPmEnabled] = useState(true);
  const [expandedHistory, setExpandedHistory] = useState<number | null>(0);

  // Mock asset data
  const asset = {
    id: assetId || "LAPTOP-001",
    name: "Dell Latitude 5520",
    category: "Laptop",
    manufacturer: "Dell Inc.",
    model: "Latitude 5520",
    serial: "SN-DL5520-2024-001",
    location: "HQ - Floor 2, Desk 42",
    department: "Engineering",
    assignedTo: "John Doe",
    assignedEmail: "john.doe@company.com",
    status: "Deployed",
    purchaseDate: "2024-03-15",
    warrantyExpiry: "2027-03-15",
    lastPM: "2025-11-15",
    nextPM: "2026-02-15",
    pmTemplate: "PM Laptop Quarterly",
    pmInterval: 90,
    totalPMCompleted: 3,
    complianceRate: 100,
    snipeItUrl: "https://assets.company.com/hardware/1234",
  };

  const pmHistory = [
    {
      id: 1,
      taskId: "PM-2025-089",
      template: "PM Laptop Quarterly",
      completedDate: "2025-11-15",
      completedBy: "Sarah Miller",
      duration: "42 min",
      status: "completed",
      notes: "All checks passed. Battery health at 92%. Cleaned fan and vents.",
      checklist: [
        { item: "Visual inspection for physical damage", status: "pass", mandatory: true, notes: "" },
        { item: "Clean keyboard and screen", status: "pass", mandatory: true, notes: "" },
        { item: "Check battery health (>80%)", status: "pass", mandatory: true, notes: "92% health" },
        { item: "Update BIOS if available", status: "pass", mandatory: false, notes: "Updated to v1.15" },
        { item: "Run disk health check", status: "pass", mandatory: true, notes: "" },
        { item: "Verify antivirus definitions", status: "pass", mandatory: true, notes: "" },
        { item: "Clean internal fans/vents", status: "pass", mandatory: false, notes: "Dust removed" },
        { item: "Test all ports (USB, HDMI, etc)", status: "pass", mandatory: true, notes: "" },
        { item: "Verify Windows updates installed", status: "pass", mandatory: true, notes: "" },
        { item: "Check thermal paste condition", status: "skip", mandatory: false, notes: "Not due yet" },
      ],
      evidence: [
        { name: "battery_health_report.pdf", type: "pdf", size: "245 KB", uploadedAt: "2025-11-15 10:30" },
        { name: "disk_health_screenshot.png", type: "image", size: "1.2 MB", uploadedAt: "2025-11-15 10:35" },
        { name: "bios_update_confirmation.png", type: "image", size: "890 KB", uploadedAt: "2025-11-15 10:40" },
      ],
    },
    {
      id: 2,
      taskId: "PM-2025-045",
      template: "PM Laptop Quarterly",
      completedDate: "2025-08-12",
      completedBy: "Mike Roberts",
      duration: "38 min",
      status: "completed",
      notes: "Standard maintenance completed. No issues found.",
      checklist: [
        { item: "Visual inspection for physical damage", status: "pass", mandatory: true, notes: "" },
        { item: "Clean keyboard and screen", status: "pass", mandatory: true, notes: "" },
        { item: "Check battery health (>80%)", status: "pass", mandatory: true, notes: "95% health" },
        { item: "Update BIOS if available", status: "skip", mandatory: false, notes: "Already current" },
        { item: "Run disk health check", status: "pass", mandatory: true, notes: "" },
        { item: "Verify antivirus definitions", status: "pass", mandatory: true, notes: "" },
        { item: "Clean internal fans/vents", status: "pass", mandatory: false, notes: "" },
        { item: "Test all ports (USB, HDMI, etc)", status: "pass", mandatory: true, notes: "" },
        { item: "Verify Windows updates installed", status: "pass", mandatory: true, notes: "" },
        { item: "Check thermal paste condition", status: "skip", mandatory: false, notes: "" },
      ],
      evidence: [
        { name: "maintenance_log.pdf", type: "pdf", size: "180 KB", uploadedAt: "2025-08-12 14:20" },
      ],
    },
    {
      id: 3,
      taskId: "PM-2025-012",
      template: "PM Laptop Quarterly",
      completedDate: "2025-05-08",
      completedBy: "Lisa Kim",
      duration: "55 min",
      status: "completed",
      notes: "Replaced thermal paste. Performance improvement noted.",
      checklist: [
        { item: "Visual inspection for physical damage", status: "pass", mandatory: true, notes: "" },
        { item: "Clean keyboard and screen", status: "pass", mandatory: true, notes: "" },
        { item: "Check battery health (>80%)", status: "pass", mandatory: true, notes: "98% health" },
        { item: "Update BIOS if available", status: "pass", mandatory: false, notes: "Updated to v1.12" },
        { item: "Run disk health check", status: "pass", mandatory: true, notes: "" },
        { item: "Verify antivirus definitions", status: "pass", mandatory: true, notes: "" },
        { item: "Clean internal fans/vents", status: "pass", mandatory: false, notes: "" },
        { item: "Test all ports (USB, HDMI, etc)", status: "pass", mandatory: true, notes: "" },
        { item: "Verify Windows updates installed", status: "pass", mandatory: true, notes: "" },
        { item: "Check thermal paste condition", status: "pass", mandatory: false, notes: "Replaced" },
      ],
      evidence: [
        { name: "thermal_paste_replacement.jpg", type: "image", size: "2.1 MB", uploadedAt: "2025-05-08 11:15" },
        { name: "temperature_before_after.pdf", type: "pdf", size: "320 KB", uploadedAt: "2025-05-08 11:45" },
      ],
    },
  ];

  const getChecklistStatusIcon = (status: string) => {
    switch (status) {
      case "pass":
        return <CheckCircle className="w-4 h-4 text-success" />;
      case "fail":
        return <XCircle className="w-4 h-4 text-destructive" />;
      case "skip":
        return <Clock className="w-4 h-4 text-muted-foreground" />;
      default:
        return null;
    }
  };

  const getPMStatusBadge = () => {
    if (!pmEnabled) {
      return <Badge variant="outline" className="bg-muted text-muted-foreground">PM Disabled</Badge>;
    }
    
    const nextPM = new Date(asset.nextPM);
    const today = new Date();
    const diffDays = Math.ceil((nextPM.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) {
      return <Badge variant="outline" className="bg-destructive/20 text-destructive border-destructive/30">Overdue</Badge>;
    }
    if (diffDays <= 7) {
      return <Badge variant="outline" className="bg-warning/20 text-warning border-warning/30">Due Soon</Badge>;
    }
    return <Badge variant="outline" className="bg-success/20 text-success border-success/30">On Track</Badge>;
  };

  return (
    <div className="min-h-screen">
      <Header title="Asset Details" subtitle={`${asset.id} - ${asset.name}`} />

      <div className="p-6 space-y-6">
        {/* Back Button */}
        <Link to="/assets">
          <Button variant="ghost" className="gap-2 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" />
            Back to Assets
          </Button>
        </Link>

        {/* Asset Header Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-xl p-6"
        >
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center shrink-0">
                <Server className="w-8 h-8 text-primary" />
              </div>
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h2 className="text-2xl font-bold text-foreground">{asset.name}</h2>
                  {getPMStatusBadge()}
                </div>
                <p className="text-muted-foreground font-mono">{asset.id}</p>
                <div className="flex flex-wrap items-center gap-4 mt-3">
                  <Badge variant="secondary">{asset.category}</Badge>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <MapPin className="w-4 h-4" />
                    {asset.location}
                  </div>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <User className="w-4 h-4" />
                    {asset.assignedTo}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                <span className="text-sm text-muted-foreground">PM Enabled</span>
                <Switch checked={pmEnabled} onCheckedChange={setPmEnabled} />
              </div>
              <Button variant="outline" className="gap-2">
                <ExternalLink className="w-4 h-4" />
                Open in Snipe-IT
              </Button>
            </div>
          </div>
        </motion.div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="stat-card"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Last PM</p>
                <p className="text-lg font-semibold text-foreground">{asset.lastPM}</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="stat-card"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center">
                <Clock className="w-5 h-5 text-accent" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Next PM</p>
                <p className="text-lg font-semibold text-foreground">{asset.nextPM}</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="stat-card"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-success/20 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-success" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">PM Completed</p>
                <p className="text-lg font-semibold text-foreground">{asset.totalPMCompleted}</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="stat-card"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-warning/20 flex items-center justify-center">
                <Activity className="w-5 h-5 text-warning" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Compliance</p>
                <p className="text-lg font-semibold text-foreground">{asset.complianceRate}%</p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Tabs Content */}
        <Tabs defaultValue="general" className="w-full">
          <TabsList className="bg-muted/50 p-1">
            <TabsTrigger value="general">General Info</TabsTrigger>
            <TabsTrigger value="history">PM History</TabsTrigger>
            <TabsTrigger value="schedule">Schedule</TabsTrigger>
          </TabsList>

          {/* General Info Tab */}
          <TabsContent value="general" className="mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                <Card className="glass border-border">
                  <CardHeader>
                    <CardTitle className="text-foreground flex items-center gap-2">
                      <Server className="w-5 h-5 text-primary" />
                      Asset Information
                    </CardTitle>
                    <CardDescription>Synced from Snipe-IT</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {[
                      { label: "Manufacturer", value: asset.manufacturer },
                      { label: "Model", value: asset.model },
                      { label: "Serial Number", value: asset.serial },
                      { label: "Category", value: asset.category },
                      { label: "Status", value: asset.status },
                      { label: "Department", value: asset.department },
                    ].map((item, index) => (
                      <div key={index} className="flex justify-between items-center py-2 border-b border-border last:border-0">
                        <span className="text-muted-foreground">{item.label}</span>
                        <span className="font-medium text-foreground">{item.value}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
              >
                <Card className="glass border-border">
                  <CardHeader>
                    <CardTitle className="text-foreground flex items-center gap-2">
                      <Wrench className="w-5 h-5 text-accent" />
                      PM Configuration
                    </CardTitle>
                    <CardDescription>Maintenance settings for this asset</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {[
                      { label: "PM Template", value: asset.pmTemplate },
                      { label: "Interval", value: `${asset.pmInterval} days` },
                      { label: "Last Completed", value: asset.lastPM },
                      { label: "Next Scheduled", value: asset.nextPM },
                      { label: "Assigned PIC", value: "Auto-assign" },
                      { label: "PM Status", value: pmEnabled ? "Enabled" : "Disabled" },
                    ].map((item, index) => (
                      <div key={index} className="flex justify-between items-center py-2 border-b border-border last:border-0">
                        <span className="text-muted-foreground">{item.label}</span>
                        <span className="font-medium text-foreground">{item.value}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="lg:col-span-2"
              >
                <Card className="glass border-border">
                  <CardHeader>
                    <CardTitle className="text-foreground flex items-center gap-2">
                      <Shield className="w-5 h-5 text-warning" />
                      Warranty & Dates
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="p-4 rounded-lg bg-muted/30">
                        <p className="text-sm text-muted-foreground mb-1">Purchase Date</p>
                        <p className="text-lg font-semibold text-foreground">{asset.purchaseDate}</p>
                      </div>
                      <div className="p-4 rounded-lg bg-muted/30">
                        <p className="text-sm text-muted-foreground mb-1">Warranty Expiry</p>
                        <p className="text-lg font-semibold text-foreground">{asset.warrantyExpiry}</p>
                      </div>
                      <div className="p-4 rounded-lg bg-muted/30">
                        <p className="text-sm text-muted-foreground mb-1">Assigned To</p>
                        <p className="text-lg font-semibold text-foreground">{asset.assignedTo}</p>
                        <p className="text-sm text-muted-foreground">{asset.assignedEmail}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </div>
          </TabsContent>

          {/* PM History Tab */}
          <TabsContent value="history" className="mt-4 space-y-4">
            {pmHistory.map((pm, index) => (
              <motion.div
                key={pm.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="glass rounded-xl overflow-hidden"
              >
                {/* History Header */}
                <div
                  className="p-5 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => setExpandedHistory(expandedHistory === pm.id ? null : pm.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-success/20 flex items-center justify-center shrink-0">
                        <CheckCircle className="w-6 h-6 text-success" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-sm text-muted-foreground">{pm.taskId}</span>
                          <Badge variant="outline" className="bg-success/20 text-success border-success/30">
                            Completed
                          </Badge>
                        </div>
                        <h3 className="font-semibold text-foreground">{pm.template}</h3>
                        <p className="text-sm text-muted-foreground">
                          Completed on {pm.completedDate} by {pm.completedBy} • {pm.duration}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right hidden md:block">
                        <p className="text-sm text-muted-foreground">{pm.checklist.filter(c => c.status === 'pass').length}/{pm.checklist.length} checks passed</p>
                        <p className="text-sm text-muted-foreground">{pm.evidence.length} evidence files</p>
                      </div>
                      {expandedHistory === pm.id ? (
                        <ChevronUp className="w-5 h-5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded Content */}
                {expandedHistory === pm.id && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="border-t border-border"
                  >
                    <div className="p-5 space-y-6">
                      {/* Notes */}
                      {pm.notes && (
                        <div className="p-4 rounded-lg bg-muted/30">
                          <p className="text-sm font-medium text-foreground mb-1">Technician Notes</p>
                          <p className="text-muted-foreground">{pm.notes}</p>
                        </div>
                      )}

                      {/* Checklist */}
                      <div>
                        <h4 className="font-semibold text-foreground mb-3">Checklist Results</h4>
                        <div className="space-y-2">
                          {pm.checklist.map((item, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between p-3 rounded-lg bg-muted/20 hover:bg-muted/30 transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                {getChecklistStatusIcon(item.status)}
                                <span className={`text-sm ${item.status === 'skip' ? 'text-muted-foreground' : 'text-foreground'}`}>
                                  {item.item}
                                </span>
                                {item.mandatory && (
                                  <Badge variant="outline" className="text-xs">Required</Badge>
                                )}
                              </div>
                              {item.notes && (
                                <span className="text-sm text-muted-foreground">{item.notes}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Evidence */}
                      <div>
                        <h4 className="font-semibold text-foreground mb-3">Evidence & Attachments</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {pm.evidence.map((file, idx) => (
                            <div
                              key={idx}
                              className="flex items-center gap-3 p-3 rounded-lg bg-muted/20 hover:bg-muted/30 transition-colors cursor-pointer group"
                            >
                              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                                file.type === 'pdf' ? 'bg-destructive/20' : 'bg-primary/20'
                              }`}>
                                {file.type === 'pdf' ? (
                                  <FileText className={`w-5 h-5 ${file.type === 'pdf' ? 'text-destructive' : 'text-primary'}`} />
                                ) : (
                                  <Image className="w-5 h-5 text-primary" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                                <p className="text-xs text-muted-foreground">{file.size} • {file.uploadedAt}</p>
                              </div>
                              <Download className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            ))}
          </TabsContent>

          {/* Schedule Tab */}
          <TabsContent value="schedule" className="mt-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <Card className="glass border-border">
                <CardHeader>
                  <CardTitle className="text-foreground">Upcoming PM Schedule</CardTitle>
                  <CardDescription>Projected maintenance schedule based on current template</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {[
                      { date: "2026-02-15", template: "PM Laptop Quarterly", status: "scheduled" },
                      { date: "2026-05-16", template: "PM Laptop Quarterly", status: "projected" },
                      { date: "2026-08-14", template: "PM Laptop Quarterly", status: "projected" },
                      { date: "2026-11-12", template: "PM Laptop Quarterly", status: "projected" },
                    ].map((schedule, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-4 rounded-lg bg-muted/30"
                      >
                        <div className="flex items-center gap-4">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                            schedule.status === 'scheduled' ? 'bg-primary/20' : 'bg-muted'
                          }`}>
                            <Calendar className={`w-5 h-5 ${
                              schedule.status === 'scheduled' ? 'text-primary' : 'text-muted-foreground'
                            }`} />
                          </div>
                          <div>
                            <p className="font-medium text-foreground">{schedule.date}</p>
                            <p className="text-sm text-muted-foreground">{schedule.template}</p>
                          </div>
                        </div>
                        <Badge variant="outline" className={
                          schedule.status === 'scheduled'
                            ? 'bg-primary/20 text-primary border-primary/30'
                            : 'bg-muted text-muted-foreground'
                        }>
                          {schedule.status === 'scheduled' ? 'Scheduled' : 'Projected'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default AssetDetail;
