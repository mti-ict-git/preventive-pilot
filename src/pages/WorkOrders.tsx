import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Wrench, Search, Filter, AlertTriangle, CheckCircle, Clock, MapPin, Tags, User, Server } from "lucide-react";
import Header from "@/components/layout/Header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiGetLookups, apiListWorkOrders, type ListWorkOrdersResponse, type LookupsResponse, type WorkOrderListItem } from "@/lib/api";

const impactBadgeClass = (level: string | null): string => {
  if (!level) return "bg-muted/40 text-muted-foreground border-muted/60";
  const v = level.toLowerCase();
  if (v === "critical") return "bg-destructive/20 text-destructive border-destructive/30";
  if (v === "high") return "bg-warning/20 text-warning border-warning/30";
  return "bg-primary/20 text-primary border-primary/30";
};

const statusBadge = (status: string): { label: string; color: string; icon: React.ElementType } => {
  const s = status.toLowerCase();
  if (s === "completed") return { label: "Completed", color: "bg-success/20 text-success border-success/30", icon: CheckCircle };
  if (s === "in_progress") return { label: "In Progress", color: "bg-primary/20 text-primary border-primary/30", icon: Wrench };
  if (s === "cancelled") return { label: "Cancelled", color: "bg-muted/40 text-muted-foreground border-muted/60", icon: AlertTriangle };
  if (s === "overdue") return { label: "Overdue", color: "bg-destructive/20 text-destructive border-destructive/30", icon: AlertTriangle };
  return { label: "Open", color: "bg-accent/20 text-accent border-accent/30", icon: Clock };
};

const WorkOrders = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [status, setStatus] = useState<string>("");
  const [impactLevel, setImpactLevel] = useState<string>("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [locationId, setLocationId] = useState<string>("");
  const [assigned, setAssigned] = useState<"any" | "unassigned" | "me">("any");
  const [reportedFrom, setReportedFrom] = useState<string>("");
  const [reportedTo, setReportedTo] = useState<string>("");

  const lookupsQuery = useQuery<LookupsResponse>({
    queryKey: ["lookups"],
    queryFn: apiGetLookups,
    staleTime: 60_000,
  });

  const listInput = useMemo(() => {
    const input: Parameters<typeof apiListWorkOrders>[0] = { page: 1, pageSize: 100 };
    if (status.trim()) input.status = status.trim();
    if (impactLevel.trim()) input.impactLevel = impactLevel.trim();
    if (categoryId.trim()) input.categoryId = categoryId.trim();
    if (locationId.trim()) input.locationId = locationId.trim();
    if (assigned) input.assigned = assigned;
    if (reportedFrom.trim()) input.reportedFrom = new Date(reportedFrom).toISOString();
    if (reportedTo.trim()) input.reportedTo = new Date(reportedTo).toISOString();
    return input;
  }, [status, impactLevel, categoryId, locationId, assigned, reportedFrom, reportedTo]);

  const workOrdersQuery = useQuery<ListWorkOrdersResponse>({
    queryKey: ["work-orders", listInput],
    queryFn: () => apiListWorkOrders(listInput),
  });

  const items: WorkOrderListItem[] = (workOrdersQuery.data?.items ?? []).filter((w) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    const assetTag = w.asset?.assetTag ?? "";
    const name = w.asset?.name ?? w.facility?.name ?? "";
    const number = w.taskNumber ?? "";
    return assetTag.toLowerCase().includes(q) || name.toLowerCase().includes(q) || number.toLowerCase().includes(q);
  });

  return (
    <div className="min-h-screen">
      <Header title="Work Orders" subtitle="Corrective maintenance work orders" />

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 md:col-span-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by ID, asset, facility"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-muted/50"
              />
            </div>
          </div>
          <div className="col-span-12 md:col-span-2">
            <Select value={status} onValueChange={(v) => setStatus(v === "__all__" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-12 md:col-span-2">
            <Select value={impactLevel} onValueChange={(v) => setImpactLevel(v === "__all__" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Impact" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-12 md:col-span-2">
            <Select value={assigned} onValueChange={(v) => setAssigned(v as "any" | "unassigned" | "me")}>
              <SelectTrigger>
                <SelectValue placeholder="Assigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any</SelectItem>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                <SelectItem value="me">Assigned to Me</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-12 md:col-span-2">
            <Select value={locationId} onValueChange={(v) => setLocationId(v === "__all__" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Location" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All</SelectItem>
                {(lookupsQuery.data?.locations ?? [])
                  .slice()
                  .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))
                  .map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name ?? "—"}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-12 md:col-span-2">
            <Select value={categoryId} onValueChange={(v) => setCategoryId(v === "__all__" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All</SelectItem>
                {(lookupsQuery.data?.assetCategories ?? [])
                  .slice()
                  .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))
                  .map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name ?? "—"}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-12 md:col-span-2">
            <Input type="datetime-local" value={reportedFrom} onChange={(e) => setReportedFrom(e.target.value)} />
          </div>
          <div className="col-span-12 md:col-span-2">
            <Input type="datetime-local" value={reportedTo} onChange={(e) => setReportedTo(e.target.value)} />
          </div>
          <div className="col-span-12 md:col-span-2">
            <Button variant="outline" className="gap-2" onClick={() => {
              setStatus("");
              setImpactLevel("");
              setCategoryId("");
              setLocationId("");
              setAssigned("any");
              setReportedFrom("");
              setReportedTo("");
            }}>
              <Filter className="w-4 h-4" />
              Reset
            </Button>
          </div>
        </div>

        <Card className="glass border-border">
          <CardHeader>
            <CardTitle className="text-foreground flex items-center gap-2">
              <Wrench className="w-5 h-5 text-primary" />
              Work Orders
            </CardTitle>
          </CardHeader>
          <CardContent>
            {workOrdersQuery.isLoading ? (
              <div className="text-sm text-muted-foreground p-4">Loading…</div>
            ) : workOrdersQuery.isError ? (
              <div className="text-sm text-destructive p-4">Failed to load work orders.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Asset/Facility</TableHead>
                    <TableHead>Symptom</TableHead>
                    <TableHead>Impact</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Reported</TableHead>
                    <TableHead>Assigned</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((w) => {
                    const s = statusBadge(w.status);
                    const assetLabel = w.asset ? `${w.asset.assetTag ?? ""} ${w.asset.name ?? ""}`.trim() : w.facility ? w.facility.name ?? "—" : "—";
                    const assignedLabel = w.assignedTo.displayName ?? w.assignedTo.roleName ?? "Unassigned";
                    const reported = w.reportedAt ? new Date(w.reportedAt).toLocaleString() : "—";
                    return (
                      <TableRow key={w.id} className="hover:bg-muted/40">
                        <TableCell className="font-mono text-sm text-muted-foreground">{w.taskNumber}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {w.asset ? <Server className="w-4 h-4 text-muted-foreground" /> : <MapPin className="w-4 h-4 text-muted-foreground" />}
                            <span className="text-foreground">{assetLabel || "—"}</span>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[300px] truncate">{w.symptom ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={impactBadgeClass(w.impactLevel)}>
                            {w.impactLevel ?? "—"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={s.color}>
                            <s.icon className="w-3 h-3 mr-1" />
                            {s.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{reported}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">{assignedLabel}</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default WorkOrders;
