import { motion } from "framer-motion";
import {
  Server,
  CheckCircle,
  Clock,
  AlertTriangle,
  TrendingUp,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import Header from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const Dashboard = () => {
  const stats = [
    {
      title: "Total Assets in PM",
      value: "1,247",
      change: "+12",
      trend: "up",
      icon: Server,
      color: "primary",
    },
    {
      title: "Upcoming PM",
      value: "89",
      change: "Next 7 days",
      trend: "neutral",
      icon: Calendar,
      color: "accent",
    },
    {
      title: "Due Today",
      value: "12",
      change: "Action needed",
      trend: "warning",
      icon: Clock,
      color: "warning",
    },
    {
      title: "Overdue",
      value: "5",
      change: "-3 from last week",
      trend: "down",
      icon: AlertTriangle,
      color: "destructive",
    },
  ];

  const complianceData = [
    { name: "Jan", rate: 92 },
    { name: "Feb", rate: 88 },
    { name: "Mar", rate: 95 },
    { name: "Apr", rate: 91 },
    { name: "May", rate: 94 },
    { name: "Jun", rate: 97 },
    { name: "Jul", rate: 96 },
    { name: "Aug", rate: 98 },
    { name: "Sep", rate: 95 },
    { name: "Oct", rate: 97 },
    { name: "Nov", rate: 96 },
    { name: "Dec", rate: 98 },
  ];

  const overdueByCategory = [
    { name: "Laptops", value: 2, color: "hsl(217, 91%, 60%)" },
    { name: "Servers", value: 1, color: "hsl(188, 95%, 45%)" },
    { name: "Network", value: 1, color: "hsl(38, 92%, 50%)" },
    { name: "Printers", value: 1, color: "hsl(0, 72%, 51%)" },
  ];

  const recentTasks = [
    { asset: "LAPTOP-001", type: "PM Laptop Q4", status: "completed", pic: "John D." },
    { asset: "SRV-WEB-01", type: "PM Server Monthly", status: "in_progress", pic: "Sarah M." },
    { asset: "SW-CORE-01", type: "PM Network Device", status: "overdue", pic: "Mike R." },
    { asset: "LAPTOP-045", type: "PM Laptop Q4", status: "upcoming", pic: "Lisa K." },
    { asset: "PTR-FL3-02", type: "PM Printer Monthly", status: "completed", pic: "John D." },
  ];

  const getStatusBadge = (status: string) => {
    const styles = {
      completed: "bg-success/20 text-success",
      in_progress: "bg-primary/20 text-primary",
      overdue: "bg-destructive/20 text-destructive",
      upcoming: "bg-accent/20 text-accent",
    };
    const labels = {
      completed: "Completed",
      in_progress: "In Progress",
      overdue: "Overdue",
      upcoming: "Upcoming",
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status as keyof typeof styles]}`}>
        {labels[status as keyof typeof labels]}
      </span>
    );
  };

  return (
    <div className="min-h-screen">
      <Header title="Dashboard" subtitle="Preventive Maintenance Overview" />
      
      <div className="p-6 space-y-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat, index) => (
            <motion.div
              key={stat.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="stat-card"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">{stat.title}</p>
                  <p className="text-3xl font-bold text-foreground">{stat.value}</p>
                  <div className="flex items-center gap-1 mt-2">
                    {stat.trend === "up" && <ArrowUpRight className="w-4 h-4 text-success" />}
                    {stat.trend === "down" && <ArrowDownRight className="w-4 h-4 text-success" />}
                    <span className={`text-sm ${stat.trend === "warning" ? "text-warning" : "text-muted-foreground"}`}>
                      {stat.change}
                    </span>
                  </div>
                </div>
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                  stat.color === "primary" ? "bg-primary/20" :
                  stat.color === "accent" ? "bg-accent/20" :
                  stat.color === "warning" ? "bg-warning/20" :
                  "bg-destructive/20"
                }`}>
                  <stat.icon className={`w-6 h-6 ${
                    stat.color === "primary" ? "text-primary" :
                    stat.color === "accent" ? "text-accent" :
                    stat.color === "warning" ? "text-warning" :
                    "text-destructive"
                  }`} />
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Compliance Rate Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="glass rounded-xl p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Compliance Rate</h3>
              <p className="text-sm text-muted-foreground">Monthly PM completion rate</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-3xl font-bold gradient-text">98%</p>
                <p className="text-sm text-muted-foreground">Current Month</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-success/20 flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-success" />
              </div>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={complianceData}>
                <defs>
                  <linearGradient id="complianceGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(217, 33%, 17%)" />
                <XAxis dataKey="name" stroke="hsl(215, 20%, 55%)" fontSize={12} />
                <YAxis stroke="hsl(215, 20%, 55%)" fontSize={12} domain={[80, 100]} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(222, 47%, 10%)",
                    border: "1px solid hsl(217, 33%, 17%)",
                    borderRadius: "8px",
                  }}
                  labelStyle={{ color: "hsl(210, 40%, 98%)" }}
                />
                <Area
                  type="monotone"
                  dataKey="rate"
                  stroke="hsl(217, 91%, 60%)"
                  strokeWidth={2}
                  fill="url(#complianceGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Bottom Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Overdue by Category */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="glass rounded-xl p-6"
          >
            <h3 className="text-lg font-semibold text-foreground mb-4">Overdue by Category</h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={overdueByCategory}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={70}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {overdueByCategory.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(222, 47%, 10%)",
                      border: "1px solid hsl(217, 33%, 17%)",
                      borderRadius: "8px",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-4">
              {overdueByCategory.map((item) => (
                <div key={item.name} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-sm text-muted-foreground">{item.name}</span>
                  <span className="text-sm font-medium text-foreground ml-auto">{item.value}</span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Recent Tasks */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="glass rounded-xl p-6 lg:col-span-2"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">Recent PM Tasks</h3>
              <button className="text-sm text-primary hover:underline">View All</button>
            </div>
            <div className="space-y-3">
              {recentTasks.map((task, index) => (
                <motion.div
                  key={task.asset}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.7 + index * 0.1 }}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
                      <Server className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{task.asset}</p>
                      <p className="text-sm text-muted-foreground">{task.type}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-muted-foreground hidden md:block">{task.pic}</span>
                    {getStatusBadge(task.status)}
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
