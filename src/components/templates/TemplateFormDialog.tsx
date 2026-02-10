import { useEffect, useState } from "react";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import {
  Plus,
  GripVertical,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import type { LookupAssetCategory, LookupRole } from "@/lib/api";

export interface ChecklistItem {
  id: string;
  itemText: string;
  isMandatory: boolean;
  requiresNotes: boolean;
  requiresPassFail: boolean;
  enableAttachment: boolean;
  requiresAttachment: boolean;
  isActive: boolean;
}

export interface TemplateFormData {
  name: string;
  description: string;
  applicableCategoryId: string | null;
  intervalDays: number;
  estimatedDuration: string;
  requiredRoleId: string | null;
  isActive: boolean;
  checklistItems: ChecklistItem[];
}

const createEmptyTemplateFormData = (): TemplateFormData => ({
  name: "",
  description: "",
  applicableCategoryId: null,
  intervalDays: 30,
  estimatedDuration: "",
  requiredRoleId: null,
  isActive: true,
  checklistItems: [],
});

interface TemplateFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: TemplateFormData) => Promise<void> | void;
  roles: LookupRole[];
  assetCategories: LookupAssetCategory[];
  initialData?: TemplateFormData;
}

const TemplateFormDialog = ({
  open,
  onOpenChange,
  onSubmit,
  roles,
  assetCategories,
  initialData,
}: TemplateFormDialogProps) => {
  const noneValue = "__none__";

  const [formData, setFormData] = useState<TemplateFormData>(() => initialData ?? createEmptyTemplateFormData());

  const [newItemText, setNewItemText] = useState("");

  useEffect(() => {
    if (!open) return;
    setFormData(initialData ?? createEmptyTemplateFormData());
    setNewItemText("");
  }, [open, initialData]);

  const addChecklistItem = () => {
    if (!newItemText.trim()) return;
    
    const newItem: ChecklistItem = {
      id: crypto.randomUUID(),
      itemText: newItemText.trim(),
      isMandatory: true,
      requiresNotes: false,
      requiresPassFail: true,
      enableAttachment: false,
      requiresAttachment: false,
      isActive: true,
    };
    
    setFormData({
      ...formData,
      checklistItems: [...formData.checklistItems, newItem],
    });
    setNewItemText("");
  };

  const removeChecklistItem = (id: string) => {
    setFormData({
      ...formData,
      checklistItems: formData.checklistItems.filter((item) => item.id !== id),
    });
  };

  const updateChecklistItem = (id: string, updates: Partial<ChecklistItem>) => {
    setFormData({
      ...formData,
      checklistItems: formData.checklistItems.map((item) =>
        item.id === id ? { ...item, ...updates } : item
      ),
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || formData.checklistItems.length === 0) {
      toast({
        title: "Validation Error",
        description: "Please fill in the required fields and add at least one checklist item.",
        variant: "destructive",
      });
      return;
    }

    try {
      await onSubmit(formData);
      onOpenChange(false);
    } catch {
      return;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card border border-border/60 shadow-xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-foreground">
            {initialData ? "Edit Template" : "Create PM Template"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label htmlFor="name">Template Name *</Label>
              <Input
                id="name"
                placeholder="e.g., PM Laptop Quarterly"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="mt-1.5 bg-muted/50"
              />
            </div>

            <div className="col-span-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Describe the maintenance procedure..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="mt-1.5 bg-muted/50 resize-none"
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="category">Asset Category</Label>
              <Select
                value={formData.applicableCategoryId ?? noneValue}
                onValueChange={(value) =>
                  setFormData({
                    ...formData,
                    applicableCategoryId: value === noneValue ? null : value,
                  })
                }
              >
                <SelectTrigger className="mt-1.5 bg-muted/50">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={noneValue}>Any</SelectItem>
                  {assetCategories
                    .filter((c) => c.isActive)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="interval">Interval (days) *</Label>
              <Select
                value={String(formData.intervalDays)}
                onValueChange={(value) => setFormData({ ...formData, intervalDays: Number(value) })}
              >
                <SelectTrigger className="mt-1.5 bg-muted/50">
                  <SelectValue placeholder="Select interval" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 days (Monthly)</SelectItem>
                  <SelectItem value="90">90 days (Quarterly)</SelectItem>
                  <SelectItem value="180">180 days (Semi-Annual)</SelectItem>
                  <SelectItem value="365">365 days (Annual)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="duration">Estimated Duration</Label>
              <Input
                id="duration"
                placeholder="e.g., 45 min"
                value={formData.estimatedDuration}
                onChange={(e) => setFormData({ ...formData, estimatedDuration: e.target.value })}
                className="mt-1.5 bg-muted/50"
              />
            </div>

            <div>
              <Label htmlFor="role">Required Role</Label>
              <Select
                value={formData.requiredRoleId ?? noneValue}
                onValueChange={(value) =>
                  setFormData({
                    ...formData,
                    requiredRoleId: value === noneValue ? null : value,
                  })
                }
              >
                <SelectTrigger className="mt-1.5 bg-muted/50">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={noneValue}>Any</SelectItem>
                  {roles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-2">
              <div className="flex items-center justify-between mt-1.5 rounded-md border border-border bg-muted/30 px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-foreground">Active</p>
                  <p className="text-xs text-muted-foreground">Inactive templates won't be scheduled.</p>
                </div>
                <Switch checked={formData.isActive} onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })} />
              </div>
            </div>
          </div>

          {/* Checklist Editor */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">Checklist Items *</Label>
              <span className="text-sm text-muted-foreground">
                {formData.checklistItems.length} items
              </span>
            </div>

            {/* Add new item */}
            <div className="flex gap-2">
              <Input
                placeholder="Add checklist item..."
                value={newItemText}
                onChange={(e) => setNewItemText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addChecklistItem())}
                className="bg-muted/50"
              />
              <Button type="button" onClick={addChecklistItem} size="icon" variant="secondary">
                <Plus className="w-4 h-4" />
              </Button>
            </div>

            {/* Checklist items */}
            <Reorder.Group
              as="div"
              axis="y"
              className="space-y-2 max-h-64 overflow-y-auto"
              values={formData.checklistItems}
              onReorder={(items) =>
                setFormData({
                  ...formData,
                  checklistItems: items,
                })
              }
           >
              <AnimatePresence>
                {formData.checklistItems.map((item, index) => (
                  <Reorder.Item
                    key={item.id}
                    value={item}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="glass rounded-lg p-3 space-y-3"
                  >
                    <div className="flex items-center gap-3">
                      <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />
                      <span className="text-sm font-medium text-muted-foreground w-6">
                        {index + 1}.
                      </span>
                      <span className="flex-1 text-sm text-foreground">{item.itemText}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => removeChecklistItem(item.id)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pl-10">
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={item.isMandatory}
                          onCheckedChange={(checked) =>
                            updateChecklistItem(item.id, { isMandatory: checked === true })
                          }
                        />
                        <span className="text-muted-foreground">Mandatory</span>
                      </label>

                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={item.requiresPassFail}
                          onCheckedChange={(checked) =>
                            updateChecklistItem(item.id, { requiresPassFail: checked === true })
                          }
                        />
                        <span className="text-muted-foreground">Pass/Fail</span>
                      </label>

                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={item.requiresNotes}
                          onCheckedChange={(checked) =>
                            updateChecklistItem(item.id, { requiresNotes: checked === true })
                          }
                        />
                        <span className="text-muted-foreground">Notes Required</span>
                      </label>

                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={item.enableAttachment}
                          onCheckedChange={(checked) => {
                            const enabled = checked === true;
                            updateChecklistItem(item.id, {
                              enableAttachment: enabled,
                              requiresAttachment: enabled ? item.requiresAttachment : false,
                            });
                          }}
                        />
                        <span className="text-muted-foreground">Enable Attachment</span>
                      </label>

                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={item.requiresAttachment}
                          disabled={!item.enableAttachment}
                          onCheckedChange={(checked) => {
                            const required = checked === true;
                            updateChecklistItem(item.id, {
                              requiresAttachment: required,
                              enableAttachment: required ? true : item.enableAttachment,
                            });
                          }}
                        />
                        <span className="text-muted-foreground">Attachment Required</span>
                      </label>
                    </div>
                  </Reorder.Item>
                ))}
              </AnimatePresence>

              {formData.checklistItems.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No checklist items yet.</p>
                  <p className="text-sm">Add items above to build your maintenance checklist.</p>
                </div>
              )}
            </Reorder.Group>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="bg-gradient-to-r from-primary to-accent">
              {initialData ? "Save Changes" : "Create Template"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default TemplateFormDialog;
