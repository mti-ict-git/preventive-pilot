import { useState } from "react";
import { motion } from "framer-motion";
import {
  FileText,
  Plus,
  Search,
  Edit2,
  Trash2,
  Copy,
  Clock,
  CheckSquare,
  MoreVertical,
  ChevronRight,
} from "lucide-react";
import Header from "@/components/layout/Header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import TemplateFormDialog from "@/components/templates/TemplateFormDialog";
import TemplateDetailDialog from "@/components/templates/TemplateDetailDialog";
import { toast } from "@/hooks/use-toast";

interface Template {
  id: number;
  name: string;
  description: string;
  category: string;
  interval: number;
  checklistItems: number;
  estimatedDuration: string;
  requiredRole: string;
  lastModified: string;
  usageCount: number;
}

interface ChecklistItemInput {
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
  checklistItems: ChecklistItemInput[];
}

const Templates = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  const [templates, setTemplates] = useState<Template[]>([
    {
      id: 1,
      name: "PM Laptop Quarterly",
      description: "Standard quarterly maintenance for laptops and notebooks",
      category: "Laptop",
      interval: 90,
      checklistItems: 12,
      estimatedDuration: "45 min",
      requiredRole: "Technician",
      lastModified: "2025-12-15",
      usageCount: 156,
    },
    {
      id: 2,
      name: "PM Server Monthly",
      description: "Monthly server health check and maintenance",
      category: "Server",
      interval: 30,
      checklistItems: 18,
      estimatedDuration: "2 hours",
      requiredRole: "Technician",
      lastModified: "2025-12-20",
      usageCount: 89,
    },
    {
      id: 3,
      name: "PM Network Device",
      description: "Quarterly maintenance for switches and routers",
      category: "Network",
      interval: 90,
      checklistItems: 10,
      estimatedDuration: "30 min",
      requiredRole: "Technician",
      lastModified: "2025-11-10",
      usageCount: 45,
    },
    {
      id: 4,
      name: "PM Printer Monthly",
      description: "Monthly printer cleaning and maintenance",
      category: "Printer",
      interval: 30,
      checklistItems: 8,
      estimatedDuration: "20 min",
      requiredRole: "Technician",
      lastModified: "2025-12-01",
      usageCount: 234,
    },
    {
      id: 5,
      name: "PM Server Semi-Annual",
      description: "Comprehensive server maintenance every 6 months",
      category: "Server",
      interval: 180,
      checklistItems: 25,
      estimatedDuration: "4 hours",
      requiredRole: "Senior Technician",
      lastModified: "2025-10-05",
      usageCount: 12,
    },
  ]);

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      Laptop: "bg-primary/20 text-primary border-primary/30",
      Server: "bg-accent/20 text-accent border-accent/30",
      Network: "bg-warning/20 text-warning border-warning/30",
      Printer: "bg-success/20 text-success border-success/30",
    };
    return colors[category] || "bg-muted text-muted-foreground";
  };

  const filteredTemplates = templates.filter(
    (template) =>
      template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreateTemplate = (data: TemplateFormData) => {
    const newTemplate: Template = {
      id: templates.length + 1,
      name: data.name,
      description: data.description,
      category: data.category,
      interval: data.interval,
      checklistItems: data.checklistItems.length,
      estimatedDuration: data.estimatedDuration || "N/A",
      requiredRole: data.requiredRole,
      lastModified: new Date().toISOString().split("T")[0],
      usageCount: 0,
    };
    setTemplates([newTemplate, ...templates]);
  };

  const handleDuplicate = (template: Template) => {
    const duplicated: Template = {
      ...template,
      id: templates.length + 1,
      name: `${template.name} (Copy)`,
      usageCount: 0,
      lastModified: new Date().toISOString().split("T")[0],
    };
    setTemplates([duplicated, ...templates]);
    toast({
      title: "Template Duplicated",
      description: `${duplicated.name} has been created.`,
    });
  };

  const handleDelete = (id: number) => {
    setTemplates(templates.filter((t) => t.id !== id));
    toast({
      title: "Template Deleted",
      description: "The template has been removed.",
    });
  };

  const handleTemplateClick = (template: Template) => {
    setSelectedTemplate(template);
    setDetailDialogOpen(true);
  };

  return (
    <div className="min-h-screen">
      <Header title="PM Templates" subtitle="Standardize your maintenance workflows" />

      <div className="p-6 space-y-6">
        {/* Header Actions */}
        <div className="flex flex-col md:flex-row gap-4 justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-muted/50"
            />
          </div>
          <Button
            onClick={() => setCreateDialogOpen(true)}
            className="gap-2 bg-gradient-to-r from-primary to-accent hover:opacity-90"
          >
            <Plus className="w-4 h-4" />
            Create Template
          </Button>
        </div>

        {/* Templates Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTemplates.map((template, index) => (
            <motion.div
              key={template.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              onClick={() => handleTemplateClick(template)}
              className="glass rounded-xl p-5 hover:border-primary/50 transition-all duration-300 cursor-pointer group"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                  <FileText className="w-6 h-6 text-primary" />
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      className="gap-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedTemplate(template);
                        setDetailDialogOpen(true);
                      }}
                    >
                      <Edit2 className="w-4 h-4" /> Edit Template
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="gap-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDuplicate(template);
                      }}
                    >
                      <Copy className="w-4 h-4" /> Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="gap-2 text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(template.id);
                      }}
                    >
                      <Trash2 className="w-4 h-4" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <h3 className="font-semibold text-lg text-foreground mb-1">{template.name}</h3>
              <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{template.description}</p>

              <div className="flex items-center gap-2 mb-4">
                <Badge variant="outline" className={getCategoryColor(template.category)}>
                  {template.category}
                </Badge>
                <Badge variant="outline" className="bg-secondary/50">
                  {template.interval} days
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
                <div className="flex items-center gap-2">
                  <CheckSquare className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{template.checklistItems} items</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{template.estimatedDuration}</span>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  Used {template.usageCount} times
                </span>
                <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </motion.div>
          ))}
        </div>

        {filteredTemplates.length === 0 && (
          <div className="text-center py-12">
            <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">No templates found</h3>
            <p className="text-muted-foreground mb-4">
              {searchQuery ? "Try a different search term" : "Create your first PM template to get started"}
            </p>
            {!searchQuery && (
              <Button onClick={() => setCreateDialogOpen(true)} className="gap-2">
                <Plus className="w-4 h-4" />
                Create Template
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Create Template Dialog */}
      <TemplateFormDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSubmit={handleCreateTemplate}
      />

      {/* Template Detail Dialog */}
      <TemplateDetailDialog
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
        template={selectedTemplate}
        onEdit={() => {
          setDetailDialogOpen(false);
          // Could open edit dialog here
          toast({
            title: "Edit Mode",
            description: "Template editing coming soon.",
          });
        }}
      />
    </div>
  );
};

export default Templates;
