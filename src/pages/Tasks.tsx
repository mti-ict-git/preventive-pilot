import { useState } from "react";
import { motion } from "framer-motion";
import {
  ClipboardList,
  Search,
  Filter,
  Clock,
  AlertTriangle,
  CheckCircle,
  User,
  Server,
  ChevronRight,
  Calendar,
} from "lucide-react";
import Header from "@/components/layout/Header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";

const Tasks = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");

  const tasks = [
    {
      id: "PM-2026-001",
      asset: "LAPTOP-001",
      assetName: "Dell Latitude 5520",
      template: "PM Laptop Quarterly",
      status: "in_progress",
      priority: "normal",
      dueDate: "2026-01-01",
      pic: "John Doe",
      progress: 60,
      checklistComplete: 7,
      checklistTotal: 12,
    },
    {
      id: "PM-2026-002",
      asset: "SRV-WEB-01",
      assetName: "HP ProLiant DL380",
      template: "PM Server Monthly",
      status: "overdue",
      priority: "high",
      dueDate: "2025-12-28",
      pic: "Sarah Miller",
      progress: 30,
      checklistComplete: 5,
      checklistTotal: 18,
    },
    {
      id: "PM-2026-003",
      asset: "SW-CORE-01",
      assetName: "Cisco Catalyst 9300",
      template: "PM Network Device",
      status: "upcoming",
      priority: "normal",
      dueDate: "2026-01-05",
      pic: "Mike Roberts",
      progress: 0,
      checklistComplete: 0,
      checklistTotal: 10,
    },
    {
      id: "PM-2026-004",
      asset: "LAPTOP-045",
      assetName: "Lenovo ThinkPad T14",
      template: "PM Laptop Quarterly",
      status: "completed",
      priority: "normal",
      dueDate: "2025-12-30",
      pic: "Lisa Kim",
      progress: 100,
      checklistComplete: 12,
      checklistTotal: 12,
    },
    {
      id: "PM-2026-005",
      asset: "SRV-DB-01",
      assetName: "Dell PowerEdge R740",
      template: "PM Server Monthly",
      status: "due_today",
      priority: "high",
      dueDate: "2026-01-01",
      pic: "Sarah Miller",
      progress: 0,
      checklistComplete: 0,
      checklistTotal: 18,
    },
  ];

  const getStatusConfig = (status: string) => {
    const config = {
      upcoming: { label: "Upcoming", color: "bg-accent/20 text-accent border-accent/30", icon: Clock },
      in_progress: { label: "In Progress", color: "bg-primary/20 text-primary border-primary/30", icon: ClipboardList },
      due_today: { label: "Due Today", color: "bg-warning/20 text-warning border-warning/30", icon: AlertTriangle },
      overdue: { label: "Overdue", color: "bg-destructive/20 text-destructive border-destructive/30", icon: AlertTriangle },
      completed: { label: "Completed", color: "bg-success/20 text-success border-success/30", icon: CheckCircle },
    };
    return config[status as keyof typeof config];
  };

  const stats = [
    { label: "Total Tasks", value: 89, color: "primary" },
    { label: "Due Today", value: 12, color: "warning" },
    { label: "Overdue", value: 5, color: "destructive" },
    { label: "Completed", value: 234, color: "success" },
  ];

  const filteredTasks = tasks.filter((task) => {
    const matchesSearch =
      task.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.asset.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.assetName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTab = activeTab === "all" || task.status === activeTab;
    return matchesSearch && matchesTab;
  });

  return (
    <div className="min-h-screen">
      <Header title="PM Tasks" subtitle="Track and execute maintenance tasks" />

      <div className="p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="stat-card"
            >
              <p className="text-sm text-muted-foreground">{stat.label}</p>
              <p className={`text-3xl font-bold text-${stat.color}`}>{stat.value}</p>
            </motion.div>
          ))}
        </div>

        {/* Filters & Search */}
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by task ID, asset..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-muted/50"
            />
          </div>
          <Button variant="outline" className="gap-2">
            <Filter className="w-4 h-4" />
            Filters
          </Button>
          <Button variant="outline" className="gap-2">
            <Calendar className="w-4 h-4" />
            Calendar View
          </Button>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="bg-muted/50 p-1">
            <TabsTrigger value="all">All Tasks</TabsTrigger>
            <TabsTrigger value="due_today">Due Today</TabsTrigger>
            <TabsTrigger value="overdue">Overdue</TabsTrigger>
            <TabsTrigger value="in_progress">In Progress</TabsTrigger>
            <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-4">
            <div className="space-y-3">
              {filteredTasks.map((task, index) => {
                const statusConfig = getStatusConfig(task.status);
                return (
                  <motion.div
                    key={task.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="glass rounded-xl p-5 hover:border-primary/50 transition-all duration-300 cursor-pointer group"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center shrink-0">
                          <Server className="w-6 h-6 text-muted-foreground" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-sm text-muted-foreground">{task.id}</span>
                            <Badge variant="outline" className={statusConfig.color}>
                              <statusConfig.icon className="w-3 h-3 mr-1" />
                              {statusConfig.label}
                            </Badge>
                            {task.priority === "high" && (
                              <Badge variant="outline" className="bg-destructive/20 text-destructive border-destructive/30">
                                High Priority
                              </Badge>
                            )}
                          </div>
                          <h3 className="font-semibold text-foreground">{task.asset}</h3>
                          <p className="text-sm text-muted-foreground">{task.assetName} • {task.template}</p>
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>

                    <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
                      <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">{task.pic}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">Due: {task.dueDate}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 min-w-48">
                        <Progress value={task.progress} className="h-2" />
                        <span className="text-sm text-muted-foreground whitespace-nowrap">
                          {task.checklistComplete}/{task.checklistTotal}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Tasks;
