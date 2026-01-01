import { motion } from "framer-motion";
import {
  BarChart3,
  Download,
  FileText,
  Calendar,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Server,
} from "lucide-react";
import Header from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const Reports = () => {
  const reportTypes = [
    {
      title: "Monthly PM Report",
      description: "Comprehensive overview of PM activities for the month",
      icon: Calendar,
      color: "primary",
      lastGenerated: "Dec 31, 2025",
    },
    {
      title: "Compliance Report",
      description: "PM compliance rates by category, location, and PIC",
      icon: TrendingUp,
      color: "success",
      lastGenerated: "Dec 31, 2025",
    },
    {
      title: "Overdue History",
      description: "Historical analysis of overdue PM tasks",
      icon: AlertTriangle,
      color: "warning",
      lastGenerated: "Dec 30, 2025",
    },
    {
      title: "Assets Without PM",
      description: "List of assets with PM disabled or no schedule",
      icon: Server,
      color: "destructive",
      lastGenerated: "Dec 28, 2025",
    },
  ];

  const quickStats = [
    { label: "Total PM Completed", value: "1,247", trend: "+12% vs last month" },
    { label: "Average Compliance", value: "96.8%", trend: "+2.3% vs last month" },
    { label: "Avg Completion Time", value: "48 min", trend: "-5 min vs last month" },
    { label: "Assets Maintained", value: "892", trend: "+45 new assets" },
  ];

  return (
    <div className="min-h-screen">
      <Header title="Reports & Audit" subtitle="Generate compliance reports and audit trails" />

      <div className="p-6 space-y-6">
        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {quickStats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="stat-card"
            >
              <p className="text-sm text-muted-foreground mb-1">{stat.label}</p>
              <p className="text-2xl font-bold text-foreground">{stat.value}</p>
              <p className="text-xs text-success mt-1">{stat.trend}</p>
            </motion.div>
          ))}
        </div>

        {/* Report Period Selector */}
        <div className="flex items-center gap-4">
          <Select defaultValue="dec2025">
            <SelectTrigger className="w-48 bg-muted/50">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="dec2025">December 2025</SelectItem>
              <SelectItem value="nov2025">November 2025</SelectItem>
              <SelectItem value="oct2025">October 2025</SelectItem>
              <SelectItem value="q42025">Q4 2025</SelectItem>
              <SelectItem value="2025">Year 2025</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" className="gap-2">
            <Calendar className="w-4 h-4" />
            Custom Range
          </Button>
        </div>

        {/* Report Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {reportTypes.map((report, index) => (
            <motion.div
              key={report.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + index * 0.1 }}
            >
              <Card className="glass border-border hover:border-primary/50 transition-all duration-300 cursor-pointer group">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className={`w-12 h-12 rounded-xl bg-${report.color}/20 flex items-center justify-center`}>
                      <report.icon className={`w-6 h-6 text-${report.color}`} />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="gap-2">
                        <FileText className="w-4 h-4" />
                        PDF
                      </Button>
                      <Button size="sm" variant="outline" className="gap-2">
                        <Download className="w-4 h-4" />
                        Excel
                      </Button>
                    </div>
                  </div>
                  <CardTitle className="text-foreground mt-4">{report.title}</CardTitle>
                  <CardDescription>{report.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Last generated: {report.lastGenerated}</span>
                    <Button variant="ghost" size="sm" className="text-primary">
                      Generate New
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Audit Trail Preview */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="glass rounded-xl p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Recent Audit Trail</h3>
              <p className="text-sm text-muted-foreground">System activity log for compliance tracking</p>
            </div>
            <Button variant="outline">View Full Log</Button>
          </div>

          <div className="space-y-4">
            {[
              { action: "PM Task Completed", asset: "LAPTOP-001", user: "John Doe", time: "10 min ago" },
              { action: "Template Modified", asset: "PM Server Monthly", user: "Admin", time: "1 hour ago" },
              { action: "Snipe-IT Sync", asset: "243 assets synced", user: "System", time: "2 hours ago" },
              { action: "Report Generated", asset: "December Compliance", user: "Sarah Miller", time: "3 hours ago" },
              { action: "Asset PM Enabled", asset: "PTR-FL3-02", user: "Mike Roberts", time: "5 hours ago" },
            ].map((log, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-primary" />
                  <div>
                    <p className="font-medium text-foreground">{log.action}</p>
                    <p className="text-sm text-muted-foreground">{log.asset}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-foreground">{log.user}</p>
                  <p className="text-xs text-muted-foreground">{log.time}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Reports;
