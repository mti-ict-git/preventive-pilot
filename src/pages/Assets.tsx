import { useState } from "react";
import { motion } from "framer-motion";
import {
  Server,
  Search,
  Filter,
  Download,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  ExternalLink,
  ChevronRight,
} from "lucide-react";
import Header from "@/components/layout/Header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const Assets = () => {
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const assets = [
    {
      id: "LAPTOP-001",
      name: "Dell Latitude 5520",
      category: "Laptop",
      location: "HQ - Floor 2",
      status: "deployed",
      pmEnabled: true,
      lastPM: "2025-11-15",
      nextPM: "2026-02-15",
      pic: "John Doe",
    },
    {
      id: "SRV-WEB-01",
      name: "HP ProLiant DL380",
      category: "Server",
      location: "Data Center - Rack A1",
      status: "deployed",
      pmEnabled: true,
      lastPM: "2025-12-01",
      nextPM: "2026-01-01",
      pic: "Sarah Miller",
    },
    {
      id: "SW-CORE-01",
      name: "Cisco Catalyst 9300",
      category: "Network",
      location: "Data Center - Rack B2",
      status: "deployed",
      pmEnabled: true,
      lastPM: "2025-10-20",
      nextPM: "2025-12-20",
      pic: "Mike Roberts",
    },
    {
      id: "LAPTOP-045",
      name: "Lenovo ThinkPad T14",
      category: "Laptop",
      location: "HQ - Floor 3",
      status: "deployed",
      pmEnabled: true,
      lastPM: "2025-11-01",
      nextPM: "2026-02-01",
      pic: "Lisa Kim",
    },
    {
      id: "PTR-FL3-02",
      name: "HP LaserJet Pro",
      category: "Printer",
      location: "HQ - Floor 3",
      status: "deployed",
      pmEnabled: false,
      lastPM: "2025-09-15",
      nextPM: null,
      pic: "Unassigned",
    },
    {
      id: "SRV-DB-01",
      name: "Dell PowerEdge R740",
      category: "Server",
      location: "Data Center - Rack A2",
      status: "deployed",
      pmEnabled: true,
      lastPM: "2025-12-10",
      nextPM: "2026-01-10",
      pic: "Sarah Miller",
    },
  ];

  const categories = ["all", "Laptop", "Server", "Network", "Printer"];

  const getStatusBadge = (status: string) => {
    const styles = {
      deployed: "bg-success/20 text-success border-success/30",
      pending: "bg-warning/20 text-warning border-warning/30",
      archived: "bg-muted text-muted-foreground border-border",
    };
    return (
      <Badge variant="outline" className={styles[status as keyof typeof styles]}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const getPMStatus = (lastPM: string | null, nextPM: string | null, pmEnabled: boolean) => {
    if (!pmEnabled) return { status: "disabled", icon: XCircle, color: "text-muted-foreground" };
    if (!nextPM) return { status: "no schedule", icon: Clock, color: "text-muted-foreground" };
    
    const next = new Date(nextPM);
    const today = new Date();
    const diffDays = Math.ceil((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return { status: "overdue", icon: XCircle, color: "text-destructive" };
    if (diffDays <= 7) return { status: "due soon", icon: Clock, color: "text-warning" };
    return { status: "on track", icon: CheckCircle, color: "text-success" };
  };

  const filteredAssets = assets.filter((asset) => {
    const matchesCategory = selectedCategory === "all" || asset.category === selectedCategory;
    const matchesSearch =
      asset.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      asset.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="min-h-screen">
      <Header title="Assets" subtitle="Synchronized from Snipe-IT" />

      <div className="p-6 space-y-6">
        {/* Sync Status Banner */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-xl p-4 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-success/20 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-success" />
            </div>
            <div>
              <p className="font-medium text-foreground">Snipe-IT Sync Active</p>
              <p className="text-sm text-muted-foreground">Last sync: 5 minutes ago • 1,247 assets</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-2">
              <RefreshCw className="w-4 h-4" />
              Sync Now
            </Button>
            <Button variant="outline" size="sm" className="gap-2">
              <ExternalLink className="w-4 h-4" />
              Open Snipe-IT
            </Button>
          </div>
        </motion.div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by asset ID or name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-muted/50"
            />
          </div>
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="w-full md:w-48 bg-muted/50">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat === "all" ? "All Categories" : cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" className="gap-2">
            <Filter className="w-4 h-4" />
            More Filters
          </Button>
          <Button variant="outline" className="gap-2">
            <Download className="w-4 h-4" />
            Export
          </Button>
        </div>

        {/* Assets Table */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="glass rounded-xl overflow-hidden"
        >
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground">Asset ID</TableHead>
                <TableHead className="text-muted-foreground">Name</TableHead>
                <TableHead className="text-muted-foreground">Category</TableHead>
                <TableHead className="text-muted-foreground">Location</TableHead>
                <TableHead className="text-muted-foreground">PM Status</TableHead>
                <TableHead className="text-muted-foreground">Next PM</TableHead>
                <TableHead className="text-muted-foreground">PM Enabled</TableHead>
                <TableHead className="text-muted-foreground"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAssets.map((asset, index) => {
                const pmStatus = getPMStatus(asset.lastPM, asset.nextPM, asset.pmEnabled);
                return (
                  <motion.tr
                    key={asset.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="border-border hover:bg-muted/30 transition-colors cursor-pointer group"
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center">
                          <Server className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <span className="font-mono text-sm text-foreground">{asset.id}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium text-foreground">{asset.name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{asset.category}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{asset.location}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <pmStatus.icon className={`w-4 h-4 ${pmStatus.color}`} />
                        <span className={`text-sm capitalize ${pmStatus.color}`}>{pmStatus.status}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {asset.nextPM || "—"}
                    </TableCell>
                    <TableCell>
                      <Switch checked={asset.pmEnabled} />
                    </TableCell>
                    <TableCell>
                      <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </TableCell>
                  </motion.tr>
                );
              })}
            </TableBody>
          </Table>
        </motion.div>

        {/* Pagination */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {filteredAssets.length} of {assets.length} assets
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled>
              Previous
            </Button>
            <Button variant="outline" size="sm">
              Next
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Assets;
