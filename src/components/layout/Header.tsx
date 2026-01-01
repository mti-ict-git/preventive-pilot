import { Bell, Search, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface HeaderProps {
  title: string;
  subtitle?: string;
}

const Header = ({ title, subtitle }: HeaderProps) => {
  return (
    <header className="h-16 bg-card/50 backdrop-blur-sm border-b border-border px-6 flex items-center justify-between sticky top-0 z-30">
      <div>
        <h1 className="text-xl font-bold text-foreground">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-4">
        {/* Search */}
        <div className="relative hidden md:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search assets, tasks..."
            className="w-64 pl-10 bg-muted/50 border-border"
          />
        </div>

        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="w-5 h-5 text-muted-foreground" />
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-destructive rounded-full text-[10px] font-bold text-destructive-foreground flex items-center justify-center">
                3
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel>Notifications</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="flex flex-col items-start gap-1 py-3">
              <span className="font-medium text-foreground">5 PM Tasks Overdue</span>
              <span className="text-xs text-muted-foreground">Critical assets need attention</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="flex flex-col items-start gap-1 py-3">
              <span className="font-medium text-foreground">Snipe-IT Sync Complete</span>
              <span className="text-xs text-muted-foreground">243 assets synchronized</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="flex flex-col items-start gap-1 py-3">
              <span className="font-medium text-foreground">Monthly Report Ready</span>
              <span className="text-xs text-muted-foreground">December 2025 compliance report</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                <User className="w-4 h-4 text-primary" />
              </div>
              <div className="hidden md:block text-left">
                <p className="text-sm font-medium text-foreground">Admin User</p>
                <p className="text-xs text-muted-foreground">Administrator</p>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Profile Settings</DropdownMenuItem>
            <DropdownMenuItem>Preferences</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive">Sign Out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};

export default Header;
