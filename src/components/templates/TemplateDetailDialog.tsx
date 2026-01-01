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

interface ChecklistItem {
  id: number;
  text: string;
  mandatory: boolean;
  requiresNotes: boolean;
  passFailRequired: boolean;
}

interface Template {
  id: number;
  name: string;
  description: string;
  category: string;
  interval: number;
  checklistItems: number | ChecklistItem[];
  estimatedDuration: string;
  requiredRole: string;
  lastModified: string;
  usageCount: number;
}

interface TemplateDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: Template | null;
  onEdit: () => void;
}

const TemplateDetailDialog = ({
  open,
  onOpenChange,
  template,
  onEdit,
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

  // Mock checklist items for display
  const mockChecklistItems: ChecklistItem[] = [
    { id: 1, text: "Visual inspection of external components", mandatory: true, requiresNotes: false, passFailRequired: true },
    { id: 2, text: "Clean dust from vents and fans", mandatory: true, requiresNotes: false, passFailRequired: true },
    { id: 3, text: "Check power supply and cables", mandatory: true, requiresNotes: false, passFailRequired: true },
    { id: 4, text: "Verify operating system updates", mandatory: true, requiresNotes: true, passFailRequired: true },
    { id: 5, text: "Run hardware diagnostics", mandatory: true, requiresNotes: true, passFailRequired: true },
    { id: 6, text: "Check antivirus and security software", mandatory: true, requiresNotes: false, passFailRequired: true },
    { id: 7, text: "Verify backup configuration", mandatory: false, requiresNotes: true, passFailRequired: false },
    { id: 8, text: "Check disk space and cleanup if needed", mandatory: true, requiresNotes: false, passFailRequired: true },
    { id: 9, text: "Test network connectivity", mandatory: true, requiresNotes: false, passFailRequired: true },
    { id: 10, text: "Document any issues found", mandatory: false, requiresNotes: true, passFailRequired: false },
  ];

  const checklistItems = Array.isArray(template.checklistItems) 
    ? template.checklistItems 
    : mockChecklistItems.slice(0, typeof template.checklistItems === 'number' ? template.checklistItems : 10);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden glass border-border">
        <DialogHeader className="pb-4 border-b border-border">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center flex-shrink-0">
              <FileText className="w-7 h-7 text-primary" />
            </div>
            <div className="flex-1">
              <DialogTitle className="text-xl font-bold text-foreground mb-2">
                {template.name}
              </DialogTitle>
              <p className="text-sm text-muted-foreground">{template.description}</p>
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
                <Badge variant="outline" className={getCategoryColor(template.category)}>
                  {template.category}
                </Badge>
              </div>

              <div className="glass rounded-lg p-3">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Calendar className="w-4 h-4" />
                  <span className="text-xs">Interval</span>
                </div>
                <p className="font-semibold text-foreground">{template.interval} days</p>
              </div>

              <div className="glass rounded-lg p-3">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Clock className="w-4 h-4" />
                  <span className="text-xs">Duration</span>
                </div>
                <p className="font-semibold text-foreground">{template.estimatedDuration}</p>
              </div>

              <div className="glass rounded-lg p-3">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <User className="w-4 h-4" />
                  <span className="text-xs">Required Role</span>
                </div>
                <p className="font-semibold text-foreground">{template.requiredRole}</p>
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
                  <span className="text-xs">Usage Count</span>
                </div>
                <p className="font-semibold text-foreground">{template.usageCount} times</p>
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
                      <p className="text-sm text-foreground">{item.text}</p>
                      <div className="flex items-center gap-3 mt-2">
                        {item.mandatory && (
                          <span className="flex items-center gap-1 text-xs text-warning">
                            <CheckCircle2 className="w-3 h-3" />
                            Mandatory
                          </span>
                        )}
                        {item.passFailRequired && (
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
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Last Modified */}
            <div className="text-xs text-muted-foreground pt-4 border-t border-border">
              Last modified: {template.lastModified}
            </div>
          </div>
        </ScrollArea>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-border">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={onEdit} className="bg-gradient-to-r from-primary to-accent">
            Edit Template
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TemplateDetailDialog;
