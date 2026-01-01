import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Trash2,
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

interface ChecklistItem {
  id: string;
  text: string;
  mandatory: boolean;
  requiresNotes: boolean;
  passFailRequired: boolean;
}

interface TemplateFormData {
  name: string;
  description: string;
  category: string;
  interval: number;
  estimatedDuration: string;
  requiredRole: string;
  checklistItems: ChecklistItem[];
}

interface TemplateFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: TemplateFormData) => void;
  initialData?: TemplateFormData;
}

const TemplateFormDialog = ({
  open,
  onOpenChange,
  onSubmit,
  initialData,
}: TemplateFormDialogProps) => {
  const [formData, setFormData] = useState<TemplateFormData>(
    initialData || {
      name: "",
      description: "",
      category: "",
      interval: 30,
      estimatedDuration: "",
      requiredRole: "Technician",
      checklistItems: [],
    }
  );

  const [newItemText, setNewItemText] = useState("");

  const addChecklistItem = () => {
    if (!newItemText.trim()) return;
    
    const newItem: ChecklistItem = {
      id: crypto.randomUUID(),
      text: newItemText.trim(),
      mandatory: true,
      requiresNotes: false,
      passFailRequired: true,
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.category || formData.checklistItems.length === 0) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields and add at least one checklist item.",
        variant: "destructive",
      });
      return;
    }
    
    onSubmit(formData);
    onOpenChange(false);
    toast({
      title: "Template Created",
      description: `${formData.name} has been created successfully.`,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto glass border-border">
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
              <Label htmlFor="category">Asset Category *</Label>
              <Select
                value={formData.category}
                onValueChange={(value) => setFormData({ ...formData, category: value })}
              >
                <SelectTrigger className="mt-1.5 bg-muted/50">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Laptop">Laptop</SelectItem>
                  <SelectItem value="Server">Server</SelectItem>
                  <SelectItem value="Network">Network</SelectItem>
                  <SelectItem value="Printer">Printer</SelectItem>
                  <SelectItem value="Desktop">Desktop</SelectItem>
                  <SelectItem value="Mobile">Mobile Device</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="interval">Interval (days) *</Label>
              <Select
                value={formData.interval.toString()}
                onValueChange={(value) => setFormData({ ...formData, interval: parseInt(value) })}
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
                value={formData.requiredRole}
                onValueChange={(value) => setFormData({ ...formData, requiredRole: value })}
              >
                <SelectTrigger className="mt-1.5 bg-muted/50">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Technician">Technician</SelectItem>
                  <SelectItem value="Senior Technician">Senior Technician</SelectItem>
                  <SelectItem value="Supervisor">Supervisor</SelectItem>
                </SelectContent>
              </Select>
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
            <div className="space-y-2 max-h-64 overflow-y-auto">
              <AnimatePresence>
                {formData.checklistItems.map((item, index) => (
                  <motion.div
                    key={item.id}
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
                      <span className="flex-1 text-sm text-foreground">{item.text}</span>
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
                    
                    <div className="flex items-center gap-6 pl-10">
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={item.mandatory}
                          onCheckedChange={(checked) =>
                            updateChecklistItem(item.id, { mandatory: checked as boolean })
                          }
                        />
                        <span className="text-muted-foreground">Mandatory</span>
                      </label>
                      
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={item.passFailRequired}
                          onCheckedChange={(checked) =>
                            updateChecklistItem(item.id, { passFailRequired: checked as boolean })
                          }
                        />
                        <span className="text-muted-foreground">Pass/Fail</span>
                      </label>
                      
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={item.requiresNotes}
                          onCheckedChange={(checked) =>
                            updateChecklistItem(item.id, { requiresNotes: checked as boolean })
                          }
                        />
                        <span className="text-muted-foreground">Notes Required</span>
                      </label>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {formData.checklistItems.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No checklist items yet.</p>
                  <p className="text-sm">Add items above to build your maintenance checklist.</p>
                </div>
              )}
            </div>
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
