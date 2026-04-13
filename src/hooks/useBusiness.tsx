import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

interface Business {
  id: string;
  name: string;
  type: string | null;
  gstin: string | null;
  address: string | null;
}

interface BusinessContextType {
  businesses: Business[];
  activeBusiness: Business | null;
  setActiveBusiness: (b: Business) => void;
  loading: boolean;
  refetch: () => void;
}

const BusinessContext = createContext<BusinessContextType>({
  businesses: [],
  activeBusiness: null,
  setActiveBusiness: () => {},
  loading: true,
  refetch: () => {},
});

export const BusinessProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [activeBusiness, setActiveBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchBusinesses = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("businesses")
      .select("*")
      .order("created_at", { ascending: true });
    if (data) {
      setBusinesses(data);
      if (!activeBusiness && data.length > 0) {
        setActiveBusiness(data[0]);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchBusinesses();
  }, [user]);

  return (
    <BusinessContext.Provider value={{ businesses, activeBusiness, setActiveBusiness, loading, refetch: fetchBusinesses }}>
      {children}
    </BusinessContext.Provider>
  );
};

export const useBusiness = () => useContext(BusinessContext);
