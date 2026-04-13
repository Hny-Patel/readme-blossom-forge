import { ReactNode, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { useCrypto } from "@/hooks/useCrypto";
import { startInactivityTimer } from "@/lib/session";
import {
  LayoutDashboard, Users, ArrowLeftRight, Tag, Settings, LogOut,
  Shield, Menu, X, ChevronDown, Building2, BarChart2, FileText, Lock,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/accounts", icon: Users, label: "Accounts" },
  { to: "/transactions", icon: ArrowLeftRight, label: "Transactions" },
  { to: "/categories", icon: Tag, label: "Categories" },
  { to: "/analytics", icon: BarChart2, label: "Analytics" },
  { to: "/reports", icon: FileText, label: "Reports" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

const AppLayout = ({ children }: { children: ReactNode }) => {
  const { user, signOut } = useAuth();
  const { businesses, activeBusiness, setActiveBusiness } = useBusiness();
  const { isUnlocked, lockVault } = useCrypto();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Auto-logout after 30 min inactivity
  useEffect(() => {
    const cleanup = startInactivityTimer(() => {
      lockVault();
      signOut();
    });
    return cleanup;
  }, []);

  return (
    <div className="min-h-screen flex bg-background">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-sidebar border-r border-sidebar-border flex flex-col transition-transform lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="p-4 border-b border-sidebar-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Shield className="w-4 h-4 text-primary" />
            </div>
            <span className="font-bold text-gradient">VaultLedger</span>
            <button className="ml-auto lg:hidden" onClick={() => setSidebarOpen(false)}>
              <X className="w-5 h-5" />
            </button>
          </div>

          {businesses.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="mt-3 w-full flex items-center gap-2 px-3 py-2 rounded-md bg-sidebar-accent text-sm text-sidebar-foreground hover:bg-sidebar-accent/80 transition-colors">
                  <Building2 className="w-4 h-4 text-muted-foreground" />
                  <span className="truncate flex-1 text-left">{activeBusiness?.name}</span>
                  <ChevronDown className="w-3 h-3 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {businesses.map((b) => (
                  <DropdownMenuItem key={b.id} onClick={() => setActiveBusiness(b)}>
                    {b.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map(({ to, icon: Icon, label }) => {
            const active = location.pathname === to;
            return (
              <Link
                key={to}
                to={to}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                }`}
              >
                <Icon className={`w-4 h-4 ${active ? "text-primary" : ""}`} />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-sidebar-border space-y-2">
          {/* Vault status indicator */}
          <div className="flex items-center gap-2 px-3 py-1.5">
            <div className={`w-2 h-2 rounded-full ${isUnlocked ? "bg-chart-credit" : "bg-amber-400"}`} />
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Lock className="w-3 h-3" />
              {isUnlocked ? "Vault Encrypted" : "Vault Locked"}
            </span>
          </div>

          <div className="px-3 py-1 text-xs text-muted-foreground truncate">
            {user?.email}
          </div>
          <button
            onClick={signOut}
            className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm text-sidebar-foreground hover:bg-sidebar-accent/50 w-full transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-h-screen">
        <header className="h-14 border-b border-border flex items-center px-4 lg:hidden">
          <button onClick={() => setSidebarOpen(true)}>
            <Menu className="w-5 h-5" />
          </button>
          <span className="ml-3 font-semibold text-gradient">VaultLedger</span>
        </header>
        <div className="flex-1 p-4 lg:p-6 overflow-auto">{children}</div>
      </main>
    </div>
  );
};

export default AppLayout;
