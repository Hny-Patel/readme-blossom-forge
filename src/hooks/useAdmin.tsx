import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface AdminContextValue {
  isAdmin: boolean;
  adminLoading: boolean;
}

const AdminContext = createContext<AdminContextValue>({ isAdmin: false, adminLoading: true });

export function AdminProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminLoading, setAdminLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setIsAdmin(false);
      setAdminLoading(false);
      return;
    }

    const run = async () => {
      try {
        const { data, error } = await (supabase.from("admin_users" as any).select("user_id").eq("user_id", user.id).single()) as any;
        if (error) console.warn("[useAdmin] admin check error:", error.message);
        setIsAdmin(!!data);
      } catch (err) {
        console.warn("[useAdmin] admin check failed:", err);
        setIsAdmin(false);
      } finally {
        setAdminLoading(false);
      }
    };
    run();
  }, [user, authLoading]);

  return (
    <AdminContext.Provider value={{ isAdmin, adminLoading }}>
      {children}
    </AdminContext.Provider>
  );
}

export function useAdmin() {
  return useContext(AdminContext);
}
