import { Bell, Search, User } from "lucide-react";
import { useNavigate } from "react-router-dom";
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
import { clearAccessToken } from "@/lib/auth";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiGetMyPreferences, apiUpdateMyPreferences, type ThemeMode, type UserPreferencesResponse } from "@/lib/api";

interface HeaderProps {
  title: string;
  subtitle?: string;
}

const palettes: ReadonlyArray<{ key: string; label: string }> = [
  { key: "industrial", label: "Industrial" },
  { key: "emerald", label: "Emerald" },
  { key: "amber", label: "Amber" },
  { key: "purple", label: "Purple" },
];

const applyPaletteClass = (palette: string | null) => {
  const root = document.documentElement;
  for (const p of ["industrial", "emerald", "amber", "purple"]) {
    root.classList.remove(`palette-${p}`);
  }
  if (palette) root.classList.add(`palette-${palette}`);
};

const Header = ({ title, subtitle }: HeaderProps) => {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const [currentPalette, setCurrentPalette] = useState<string | null>(null);

  const prefsQuery = useQuery<UserPreferencesResponse>({
    queryKey: ["me", "preferences"],
    queryFn: apiGetMyPreferences,
  });

  useEffect(() => {
    const pm = prefsQuery.data?.themeMode ?? null;
    const pp = prefsQuery.data?.themePalette ?? null;
    if (pm) setTheme(pm);
    setCurrentPalette(pp);
    applyPaletteClass(pp);
  }, [prefsQuery.data, setTheme]);

  const updatePrefs = useMutation({
    mutationFn: (input: { themeMode?: ThemeMode | null; themePalette?: string | null }) =>
      apiUpdateMyPreferences(input),
    onSuccess: (_data, variables) => {
      if (variables.themeMode) setTheme(variables.themeMode);
      if (variables.themePalette !== undefined) {
        const palette = variables.themePalette ?? null;
        setCurrentPalette(palette);
        applyPaletteClass(palette);
      }
    },
  });
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
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
              }}
            >
              Theme
            </DropdownMenuItem>
            <div className="px-2 py-1.5">
              <div className="flex items-center gap-2">
                <Button
                  variant={theme === "dark" ? "default" : "outline"}
                  size="sm"
                  onClick={() => updatePrefs.mutate({ themeMode: "dark" })}
                >
                  Dark
                </Button>
                <Button
                  variant={theme === "light" ? "default" : "outline"}
                  size="sm"
                  onClick={() => updatePrefs.mutate({ themeMode: "light" })}
                >
                  Light
                </Button>
              </div>
            </div>
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
              }}
            >
              Color Palette
            </DropdownMenuItem>
            <div className="px-2 py-1.5 grid grid-cols-2 gap-2">
              {palettes.map((p) => (
                <Button
                  key={p.key}
                  variant={currentPalette === p.key ? "default" : "outline"}
                  size="sm"
                  onClick={() => updatePrefs.mutate({ themePalette: p.key })}
                >
                  {p.label}
                </Button>
              ))}
              <Button
                variant={currentPalette === null ? "default" : "outline"}
                size="sm"
                onClick={() => updatePrefs.mutate({ themePalette: null })}
              >
                Default
              </Button>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive"
              onSelect={() => {
                clearAccessToken();
                navigate("/login");
              }}
            >
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};

export default Header;
