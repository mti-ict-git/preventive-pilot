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

const Templates = () => {
  const [searchQuery, setSearchQuery] = useState("");

  const templates = [
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
  ];

  const getCategoryColor = (category: string) => {
    const colors = {
      Laptop: "bg-primary/20 text-primary border-primary/30",
      Server: "bg-accent/20 text-accent border-accent/30",
      Network: "bg-warning/20 text-warning border-warning/30",
      Printer: "bg-success/20 text-success border-success/30",
    };
    return colors[category as keyof typeof colors] || "bg-muted text-muted-foreground";
  };

  const filteredTemplates = templates.filter(
    (template) =>
      template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
          <Button className="gap-2 bg-gradient-to-r from-primary to-accent hover:opacity-90">
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
              className="glass rounded-xl p-5 hover:border-primary/50 transition-all duration-300 cursor-pointer group"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                  <FileText className="w-6 h-6 text-primary" />
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem className="gap-2">
                      <Edit2 className="w-4 h-4" /> Edit Template
                    </DropdownMenuItem>
                    <DropdownMenuItem className="gap-2">
                      <Copy className="w-4 h-4" /> Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuItem className="gap-2 text-destructive">
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
      </div>
    </div>
  );
};

export default Templates;
