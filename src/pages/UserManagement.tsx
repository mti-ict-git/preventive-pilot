import { motion } from "framer-motion";
import {
  Users,
  Shield,
  Plus,
  Search,
  MoreVertical,
  Edit2,
  Trash2,
  Mail,
  Phone,
  Building,
} from "lucide-react";
import Header from "@/components/layout/Header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const UserManagement = () => {
  const users = [
    { id: 1, name: "John Doe", email: "john.doe@company.com", role: "Technician", department: "IT Support", status: "active", tasksCompleted: 156 },
    { id: 2, name: "Sarah Miller", email: "sarah.miller@company.com", role: "Senior Technician", department: "Data Center", status: "active", tasksCompleted: 234 },
    { id: 3, name: "Mike Roberts", email: "mike.roberts@company.com", role: "Technician", department: "Network", status: "active", tasksCompleted: 89 },
    { id: 4, name: "Lisa Kim", email: "lisa.kim@company.com", role: "Supervisor", department: "IT Support", status: "active", tasksCompleted: 45 },
    { id: 5, name: "Admin User", email: "admin@company.com", role: "Admin", department: "IT Management", status: "active", tasksCompleted: 12 },
    { id: 6, name: "Alex Brown", email: "alex.brown@company.com", role: "Viewer", department: "Audit", status: "inactive", tasksCompleted: 0 },
  ];

  const roles = [
    { name: "Admin", description: "Full system access", users: 2, color: "bg-destructive/20 text-destructive" },
    { name: "Supervisor", description: "Manage team and approve tasks", users: 4, color: "bg-warning/20 text-warning" },
    { name: "Technician", description: "Execute PM tasks", users: 12, color: "bg-primary/20 text-primary" },
    { name: "Viewer", description: "Read-only access for auditors", users: 3, color: "bg-muted text-muted-foreground" },
  ];

  const getRoleBadge = (role: string) => {
    const styles: { [key: string]: string } = {
      Admin: "bg-destructive/20 text-destructive border-destructive/30",
      Supervisor: "bg-warning/20 text-warning border-warning/30",
      "Senior Technician": "bg-accent/20 text-accent border-accent/30",
      Technician: "bg-primary/20 text-primary border-primary/30",
      Viewer: "bg-muted text-muted-foreground border-border",
    };
    return <Badge variant="outline" className={styles[role]}>{role}</Badge>;
  };

  return (
    <div className="min-h-screen">
      <Header title="Users & Roles" subtitle="Manage system access and permissions" />

      <div className="p-6 space-y-6">
        {/* Roles Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {roles.map((role, index) => (
            <motion.div
              key={role.name}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="stat-card"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${role.color}`}>
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">{role.name}</p>
                  <p className="text-xs text-muted-foreground">{role.users} users</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">{role.description}</p>
            </motion.div>
          ))}
        </div>

        {/* Users List */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="glass rounded-xl overflow-hidden"
        >
          <div className="p-4 border-b border-border flex flex-col md:flex-row gap-4 justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search users..." className="pl-10 bg-muted/50" />
            </div>
            <Button className="gap-2 bg-gradient-to-r from-primary to-accent hover:opacity-90">
              <Plus className="w-4 h-4" />
              Add User
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground">User</TableHead>
                <TableHead className="text-muted-foreground">Role</TableHead>
                <TableHead className="text-muted-foreground">Department</TableHead>
                <TableHead className="text-muted-foreground">Tasks Completed</TableHead>
                <TableHead className="text-muted-foreground">Status</TableHead>
                <TableHead className="text-muted-foreground"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user, index) => (
                <motion.tr
                  key={user.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 + index * 0.05 }}
                  className="border-border hover:bg-muted/30 transition-colors"
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="w-10 h-10">
                        <AvatarFallback className="bg-primary/20 text-primary">
                          {user.name.split(" ").map((n) => n[0]).join("")}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-foreground">{user.name}</p>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{getRoleBadge(user.role)}</TableCell>
                  <TableCell className="text-muted-foreground">{user.department}</TableCell>
                  <TableCell className="text-foreground">{user.tasksCompleted}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={
                      user.status === "active"
                        ? "bg-success/20 text-success border-success/30"
                        : "bg-muted text-muted-foreground"
                    }>
                      {user.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem className="gap-2">
                          <Edit2 className="w-4 h-4" /> Edit User
                        </DropdownMenuItem>
                        <DropdownMenuItem className="gap-2">
                          <Mail className="w-4 h-4" /> Send Email
                        </DropdownMenuItem>
                        <DropdownMenuItem className="gap-2 text-destructive">
                          <Trash2 className="w-4 h-4" /> Deactivate
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </motion.tr>
              ))}
            </TableBody>
          </Table>
        </motion.div>
      </div>
    </div>
  );
};

export default UserManagement;
