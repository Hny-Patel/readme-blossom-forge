import { ReactNode, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  LayoutDashboard, Users, CreditCard, Package, Receipt,
  Tag, ShieldBan, LogOut, Menu, X, Shield,
} from "lucide-react";

const navItems = [
  { to: "/admin",               icon: LayoutDashboard, label: "Dashboard"     },
  { to: "/admin/users",         icon: Users,           label: "Users"         },
  { to: "/admin/plans",         icon: Package,         label: "Plans"         },
  { to: "/admin/subscriptions", icon: CreditCard,      label: "Subscriptions" },
  { to: "/admin/payments",      icon: Receipt,         label: "Payments"      },
  { to: "/admin/coupons",       icon: Tag,             label: "Coupons"       },
  { to: "/admin/restrictions",  icon: ShieldBan,       label: "Restrictions"  },
];

const AdminLayout = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-64 flex flex-col transition-transform lg:translate-x-0 border-r border-border bg-sidebar ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Logo */}
        <div className="p-4 border-b border-sidebar-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center">
              <Shield className="w-4 h-4 text-red-500" />
            </div>
            <div>
              <span className="font-bold text-sm">VaultLedger</span>
              <span className="block text-[10px] text-red-400 font-semibold uppercase tracking-widest">Admin Panel</span>
            </div>
            <button className="ml-auto lg:hidden" onClick={() => setSidebarOpen(false)}>
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map(({ to, icon: Icon, label }) => {
            const active = to === "/admin"
              ? location.pathname === "/admin"
              : location.pathname.startsWith(to);
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
                <Icon className={`w-4 h-4 ${active ? "text-red-400" : ""}`} />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-sidebar-border space-y-2">
          <Link
            to="/"
            className="flex items-center gap-3 px-3 py-2 rounded-md text-xs text-muted-foreground hover:bg-sidebar-accent/50 transition-colors"
          >
            ← Back to App
          </Link>
          <div className="px-3 py-1 text-xs text-muted-foreground truncate">{user?.email}</div>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm text-sidebar-foreground hover:bg-sidebar-accent/50 w-full transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-h-screen overflow-hidden">
        <header className="h-14 border-b border-border flex items-center px-4 lg:hidden">
          <button onClick={() => setSidebarOpen(true)}>
            <Menu className="w-5 h-5" />
          </button>
          <span className="ml-3 font-semibold text-sm">Admin Panel</span>
        </header>
        <div className="flex-1 p-4 lg:p-6 overflow-auto">{children}</div>
      </main>
    </div>
  );
};

export default AdminLayout;
