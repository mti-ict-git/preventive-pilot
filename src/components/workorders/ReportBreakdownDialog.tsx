import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { apiCreateWorkOrder, ApiError } from "@/lib/api";
import { toast } from "@/hooks/use-toast";

type ReportBreakdownDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assetId?: string;
  facilityId?: string;
  templateId?: string | null;
};

const ReportBreakdownDialog = ({ open, onOpenChange, assetId, facilityId, templateId }: ReportBreakdownDialogProps) => {
  const navigate = useNavigate();
  const [symptom, setSymptom] = useState("");
  const [impactLevel, setImpactLevel] = useState<"normal" | "high" | "critical" | "">("");
  const [failureCategory, setFailureCategory] = useState("");
  const [failureCode, setFailureCode] = useState("");
  const [downtimeStartedAt, setDowntimeStartedAt] = useState("");
  const [reportedChannel, setReportedChannel] = useState("");

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!symptom.trim()) throw new Error("Enter symptom");
      const payload = {
        assetId,
        facilityId,
        templateId: templateId ?? undefined,
        symptom: symptom.trim(),
        impactLevel: impactLevel ? impactLevel : undefined,
        failureCategory: failureCategory.trim() || undefined,
        failureCode: failureCode.trim() || undefined,
        downtimeStartedAt: downtimeStartedAt ? new Date(downtimeStartedAt).toISOString() : undefined,
        reportedChannel: reportedChannel.trim() || undefined,
      };
      return apiCreateWorkOrder(payload);
    },
    onSuccess: async (res) => {
      toast({ title: "Breakdown reported", description: `Work Order ${res.id} created` });
      setSymptom("");
      setImpactLevel("");
      setFailureCategory("");
      setFailureCode("");
      setDowntimeStartedAt("");
      setReportedChannel("");
      onOpenChange(false);
      navigate("/work-orders");
    },
    onError: (err: unknown) => {
      const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Failed";
      toast({ title: "Submit failed", description: message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Report Breakdown</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Symptom</label>
            <Textarea value={symptom} onChange={(e) => setSymptom(e.target.value)} placeholder="Describe the issue" />
          </div>
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-12 md:col-span-6 space-y-2">
              <label className="text-sm text-muted-foreground">Impact level</label>
              <Select
                value={impactLevel}
                onValueChange={(v) => setImpactLevel(v === "__none__" ? "" : (v as "normal" | "high" | "critical"))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select impact" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-12 md:col-span-6 space-y-2">
              <label className="text-sm text-muted-foreground">Downtime started</label>
              <Input type="datetime-local" value={downtimeStartedAt} onChange={(e) => setDowntimeStartedAt(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-12 md:col-span-6 space-y-2">
              <label className="text-sm text-muted-foreground">Failure category</label>
              <Input value={failureCategory} onChange={(e) => setFailureCategory(e.target.value)} placeholder="Optional" />
            </div>
            <div className="col-span-12 md:col-span-6 space-y-2">
              <label className="text-sm text-muted-foreground">Failure code</label>
              <Input value={failureCode} onChange={(e) => setFailureCode(e.target.value)} placeholder="Optional" />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Reported channel</label>
            <Input value={reportedChannel} onChange={(e) => setReportedChannel(e.target.value)} placeholder="Phone/WhatsApp/Web" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={createMutation.isPending}>Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !symptom.trim()}>Submit</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export { ReportBreakdownDialog };
