import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import TemplateFormDialog from "@/components/templates/TemplateFormDialog";
import TemplateDetailDialog from "@/components/templates/TemplateDetailDialog";
import { toast } from "@/hooks/use-toast";
import {
  ApiError,
  apiCreateTemplate,
  apiDeleteTemplate,
  apiGetLookups,
  apiGetTemplate,
  apiListTemplates,
  apiUpdateTemplate,
  type CreateTemplateInput,
  type TemplateDetail,
} from "@/lib/api";
import type { TemplateFormData } from "@/components/templates/TemplateFormDialog";

const Templates = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editInitialData, setEditInitialData] = useState<TemplateFormData | undefined>(undefined);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const queryClient = useQueryClient();

  const lookupsQuery = useQuery({
    queryKey: ["lookups"],
    queryFn: apiGetLookups,
    staleTime: 5 * 60_000,
  });

  const templatesQuery = useQuery({
    queryKey: ["templates"],
    queryFn: () => apiListTemplates(),
  });

  const templateDetailQuery = useQuery({
    queryKey: ["template", selectedTemplateId],
    queryFn: () => apiGetTemplate(selectedTemplateId ?? ""),
    enabled: selectedTemplateId !== null && (detailDialogOpen || editDialogOpen),
  });

  const createMutation = useMutation({
    mutationFn: (input: CreateTemplateInput) => apiCreateTemplate(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["templates"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (input: { templateId: string; data: Partial<CreateTemplateInput> }) =>
      apiUpdateTemplate({ templateId: input.templateId, ...input.data }),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["templates"] });
      await queryClient.invalidateQueries({ queryKey: ["template", variables.templateId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (templateId: string) => apiDeleteTemplate(templateId),
    onSuccess: async (_data, templateId) => {
      await queryClient.invalidateQueries({ queryKey: ["templates"] });
      await queryClient.invalidateQueries({ queryKey: ["template", templateId] });
    },
  });

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      Laptop: "bg-primary/20 text-primary border-primary/30",
      Server: "bg-accent/20 text-accent border-accent/30",
      Network: "bg-warning/20 text-warning border-warning/30",
      Printer: "bg-success/20 text-success border-success/30",
    };
    return colors[category] || "bg-muted text-muted-foreground";
  };

  const parseEstimatedDurationMinutes = (raw: string): number | null => {
    const value = raw.trim().toLowerCase();
    if (!value) return null;
    const match = value.match(/\d+(\.\d+)?/);
    if (!match) return null;
    const num = Number(match[0]);
    if (!Number.isFinite(num) || num <= 0) return null;
    if (value.includes("hour") || value.includes("hr") || value.endsWith("h")) {
      return Math.round(num * 60);
    }
    return Math.round(num);
  };

  const toCreateInput = (data: TemplateFormData, includeChecklistIds: boolean): CreateTemplateInput => {
    return {
      name: data.name,
      description: data.description ? data.description : null,
      intervalDays: data.intervalDays,
      applicableCategoryId: data.applicableCategoryId,
      estimatedDurationMinutes: parseEstimatedDurationMinutes(data.estimatedDuration),
      requiredRoleId: data.requiredRoleId,
      isActive: data.isActive,
      checklistItems: data.checklistItems.map((item, idx) => {
        const base = {
          sortOrder: idx,
          itemText: item.itemText,
          isMandatory: item.isMandatory,
          requiresNotes: item.requiresNotes,
          requiresPassFail: item.requiresPassFail,
          enableAttachment: item.enableAttachment,
          requiresAttachment: item.requiresAttachment,
          isActive: item.isActive,
        };
        return includeChecklistIds ? { ...base, id: item.id } : base;
      }),
    };
  };

  const toEditInitialData = useCallback((template: TemplateDetail): TemplateFormData => {
    return {
      name: template.name,
      description: template.description ?? "",
      applicableCategoryId: template.applicableCategory?.id ?? null,
      intervalDays: template.intervalDays,
      estimatedDuration: template.estimatedDurationMinutes !== null ? `${template.estimatedDurationMinutes} min` : "",
      requiredRoleId: template.requiredRole?.id ?? null,
      isActive: template.isActive,
      checklistItems: template.checklistItems.map((i) => ({
        id: i.id,
        itemText: i.itemText,
        isMandatory: i.isMandatory,
        requiresNotes: i.requiresNotes,
        requiresPassFail: i.requiresPassFail,
        enableAttachment: i.enableAttachment,
        requiresAttachment: i.requiresAttachment,
        isActive: i.isActive,
      })),
    };
  }, []);

  useEffect(() => {
    if (!editDialogOpen) return;
    if (editInitialData) return;
    if (!templateDetailQuery.data) return;
    setEditInitialData(toEditInitialData(templateDetailQuery.data));
  }, [editDialogOpen, editInitialData, templateDetailQuery.data, toEditInitialData]);

  const filteredTemplates = useMemo(() => {
    const items = templatesQuery.data?.items ?? [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter((t) => {
      const cat = t.applicableCategory?.name ?? "";
      return t.name.toLowerCase().includes(q) || cat.toLowerCase().includes(q);
    });
  }, [searchQuery, templatesQuery.data?.items]);

  const handleCreateTemplate = async (data: TemplateFormData) => {
    try {
      await createMutation.mutateAsync(toCreateInput(data, false));
      toast({ title: "Template created", description: `${data.name} has been created.` });
    } catch (err: unknown) {
      const message = err instanceof ApiError ? err.message : "Failed to create template";
      toast({ title: "Create failed", description: message, variant: "destructive" });
      throw err;
    }
  };

  const handleTemplateClick = (templateId: string) => {
    setSelectedTemplateId(templateId);
    setDetailDialogOpen(true);
  };

  const handleEditFromDetail = () => {
    const detail = templateDetailQuery.data;
    if (!detail || selectedTemplateId === null) {
      toast({ title: "Template not loaded", description: "Please try again." });
      return;
    }
    setEditInitialData(toEditInitialData(detail));
    setDetailDialogOpen(false);
    setEditDialogOpen(true);
  };

  const handleEditTemplate = async (data: TemplateFormData) => {
    if (!selectedTemplateId) {
      toast({ title: "Edit failed", description: "No template selected", variant: "destructive" });
      throw new Error("No template selected");
    }

    try {
      await updateMutation.mutateAsync({
        templateId: selectedTemplateId,
        data: toCreateInput(data, true),
      });
      toast({ title: "Template updated", description: `${data.name} has been saved.` });
    } catch (err: unknown) {
      const message = err instanceof ApiError ? err.message : "Failed to update template";
      toast({ title: "Update failed", description: message, variant: "destructive" });
      throw err;
    }
  };

  const handleDuplicate = async (templateId: string) => {
    try {
      const detail = await apiGetTemplate(templateId);
      const copiedName = `${detail.name} (Copy)`;
      const formLike = toEditInitialData(detail);
      await createMutation.mutateAsync({
        ...toCreateInput(formLike, false),
        name: copiedName,
      });
      toast({ title: "Template duplicated", description: `${copiedName} has been created.` });
    } catch (err: unknown) {
      const message = err instanceof ApiError ? err.message : "Failed to duplicate template";
      toast({ title: "Duplicate failed", description: message, variant: "destructive" });
    }
  };

  const handleDelete = (input: { id: string; name: string }) => {
    setDeleteTarget(input);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;

    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      toast({ title: "Template deleted", description: `${deleteTarget.name} has been deactivated.` });

      if (selectedTemplateId === deleteTarget.id) {
        setDetailDialogOpen(false);
        setEditDialogOpen(false);
        setSelectedTemplateId(null);
      }
    } catch (err: unknown) {
      const message = err instanceof ApiError ? err.message : "Failed to delete template";
      toast({ title: "Delete failed", description: message, variant: "destructive" });
    } finally {
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
    }
  };

  const roles = lookupsQuery.data?.roles ?? [];
  const assetCategories = lookupsQuery.data?.assetCategories ?? [];

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
              onClick={() => handleTemplateClick(template.id)}
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
                        setSelectedTemplateId(template.id);
                        setEditInitialData(undefined);
                        setDetailDialogOpen(false);
                        setEditDialogOpen(true);
                      }}
                    >
                      <Edit2 className="w-4 h-4" /> Edit Template
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="gap-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleDuplicate(template.id);
                      }}
                    >
                      <Copy className="w-4 h-4" /> Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="gap-2 text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete({ id: template.id, name: template.name });
                      }}
                    >
                      <Trash2 className="w-4 h-4" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <h3 className="font-semibold text-lg text-foreground mb-1">{template.name}</h3>
              <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{template.description ?? ""}</p>

              <div className="flex items-center gap-2 mb-4">
                <Badge
                  variant="outline"
                  className={getCategoryColor(template.applicableCategory?.name ?? "Any")}
                >
                  {template.applicableCategory?.name ?? "Any"}
                </Badge>
                <Badge variant="outline" className="bg-secondary/50">
                  {template.intervalDays} days
                </Badge>
                {!template.isActive && (
                  <Badge variant="outline" className="bg-muted/20 text-muted-foreground border-border">
                    Inactive
                  </Badge>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
                <div className="flex items-center gap-2">
                  <CheckSquare className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">v{template.version}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    {template.estimatedDurationMinutes !== null ? `${template.estimatedDurationMinutes} min` : "—"}
                  </span>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  Updated {new Date(template.updatedAt).toLocaleDateString()}
                </span>
                <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </motion.div>
          ))}
        </div>

        {filteredTemplates.length === 0 && !templatesQuery.isLoading && (
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
        roles={roles}
        assetCategories={assetCategories}
      />

      {/* Template Detail Dialog */}
      <TemplateDetailDialog
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
        template={templateDetailQuery.data ?? null}
        onEdit={handleEditFromDetail}
      />

      <TemplateFormDialog
        open={editDialogOpen}
        onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) setEditInitialData(undefined);
        }}
        onSubmit={handleEditTemplate}
        roles={roles}
        assetCategories={assetCategories}
        initialData={editInitialData}
      />

      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open);
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete template</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? `Deactivate “${deleteTarget.name}”? Scheduled tasks will not be created from it.` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmDelete();
              }}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Templates;
