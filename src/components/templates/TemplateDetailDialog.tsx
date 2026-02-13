import {
  FileText,
  Clock,
  CheckSquare,
  User,
  Calendar,
  Tag,
  CheckCircle2,
  XCircle,
  MessageSquare,
  Paperclip,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { TemplateDetail } from "@/lib/api";

interface TemplateDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: TemplateDetail | null;
  onEdit: () => void;
  canEdit?: boolean;
}

const TemplateDetailDialog = ({
  open,
  onOpenChange,
  template,
  onEdit,
  canEdit = true,
}: TemplateDetailDialogProps) => {
  if (!template) return null;

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      Laptop: "bg-primary/20 text-primary border-primary/30",
      Server: "bg-accent/20 text-accent border-accent/30",
      Network: "bg-warning/20 text-warning border-warning/30",
      Printer: "bg-success/20 text-success border-success/30",
    };
    return colors[category] || "bg-muted text-muted-foreground";
  };

  const checklistItems = template.checklistItems ?? [];
  const categoryName = template.applicableCategory?.name ?? "Any";
  const roleName = template.requiredRole?.name ?? "Any";
  const durationText = template.estimatedDurationMinutes !== null ? `${template.estimatedDurationMinutes} min` : "—";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden bg-card border border-border/60 shadow-xl">
        <DialogHeader className="pb-4 border-b border-border">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center flex-shrink-0">
              <FileText className="w-7 h-7 text-primary" />
            </div>
            <div className="flex-1">
              <DialogTitle className="text-xl font-bold text-foreground mb-2">
                {template.name}
              </DialogTitle>
              <p className="text-sm text-muted-foreground">{template.description ?? ""}</p>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-6 py-4">
            {/* Template Info Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="glass rounded-lg p-3">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Tag className="w-4 h-4" />
                  <span className="text-xs">Category</span>
                </div>
                <Badge variant="outline" className={getCategoryColor(categoryName)}>
                  {categoryName}
                </Badge>
              </div>

              <div className="glass rounded-lg p-3">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Calendar className="w-4 h-4" />
                  <span className="text-xs">Interval</span>
                </div>
                <p className="font-semibold text-foreground">{template.intervalDays} days</p>
              </div>

              <div className="glass rounded-lg p-3">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Clock className="w-4 h-4" />
                  <span className="text-xs">Duration</span>
                </div>
                <p className="font-semibold text-foreground">{durationText}</p>
              </div>

              <div className="glass rounded-lg p-3">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <User className="w-4 h-4" />
                  <span className="text-xs">Required Role</span>
                </div>
                <p className="font-semibold text-foreground">{roleName}</p>
              </div>

              <div className="glass rounded-lg p-3">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <CheckSquare className="w-4 h-4" />
                  <span className="text-xs">Checklist Items</span>
                </div>
                <p className="font-semibold text-foreground">{checklistItems.length} items</p>
              </div>

              <div className="glass rounded-lg p-3">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <FileText className="w-4 h-4" />
                  <span className="text-xs">Version</span>
                </div>
                <p className="font-semibold text-foreground">v{template.version}</p>
              </div>
            </div>

            {/* Checklist Items */}
            <div>
              <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                <CheckSquare className="w-5 h-5 text-primary" />
                Checklist Items
              </h3>
              <div className="space-y-2">
                {checklistItems.map((item, index) => (
                  <div
                    key={item.id}
                    className="glass rounded-lg p-3 flex items-start gap-3"
                  >
                    <span className="text-sm font-medium text-muted-foreground w-6 flex-shrink-0">
                      {index + 1}.
                    </span>
                    <div className="flex-1">
                      <p className="text-sm text-foreground">{item.itemText}</p>
                      <div className="flex items-center gap-3 mt-2">
                        {item.isMandatory && (
                          <span className="flex items-center gap-1 text-xs text-warning">
                            <CheckCircle2 className="w-3 h-3" />
                            Mandatory
                          </span>
                        )}
                        {item.requiresPassFail && (
                          <span className="flex items-center gap-1 text-xs text-primary">
                            <XCircle className="w-3 h-3" />
                            Pass/Fail
                          </span>
                        )}
                        {item.requiresNotes && (
                          <span className="flex items-center gap-1 text-xs text-accent">
                            <MessageSquare className="w-3 h-3" />
                            Notes Required
                          </span>
                        )}
                        {item.enableAttachment && item.requiresAttachment && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Paperclip className="w-3 h-3" />
                            Attachment Required
                          </span>
                        )}
                        {item.enableAttachment && !item.requiresAttachment && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Paperclip className="w-3 h-3" />
                            Attachment Optional
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Last Modified */}
            <div className="text-xs text-muted-foreground pt-4 border-t border-border">
              Last modified: {new Date(template.updatedAt).toLocaleString()}
            </div>
          </div>
        </ScrollArea>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-border">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {canEdit && (
            <Button onClick={onEdit} className="bg-gradient-to-r from-primary to-accent">
              Edit Template
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TemplateDetailDialog;
