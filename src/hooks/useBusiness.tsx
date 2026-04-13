import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useCrypto } from "./useCrypto";
import { decryptField } from "@/lib/crypto";

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
  const { dek } = useCrypto();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [activeBusiness, setActiveBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchBusinesses = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("businesses")
      .select("*")
      .order("created_at", { ascending: true });

    const decrypted: Business[] = await Promise.all(
      (data || []).map(async (row) => {
        let name = row.name;
        let gstin = row.gstin;
        let address = row.address;

        if (dek) {
          if (row.name_enc && row.name_iv) {
            try { name = await decryptField(row.name_enc, row.name_iv, dek); } catch { /* fallback */ }
          }
          if (row.gstin_enc && row.gstin_iv) {
            try { gstin = await decryptField(row.gstin_enc, row.gstin_iv, dek); } catch { /* fallback */ }
          }
          if (row.address_enc && row.address_iv) {
            try { address = await decryptField(row.address_enc, row.address_iv, dek); } catch { /* fallback */ }
          }
        }

        return { id: row.id, type: row.type, name, gstin, address };
      })
    );

    setBusinesses(decrypted);
    // Always store the decrypted version in activeBusiness
    if (!activeBusiness && decrypted.length > 0) {
      setActiveBusiness(decrypted[0]);
    } else if (activeBusiness) {
      // Refresh active business with newly decrypted data
      const refreshed = decrypted.find((b) => b.id === activeBusiness.id);
      if (refreshed) setActiveBusiness(refreshed);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchBusinesses();
  }, [user, dek]);

  return (
    <BusinessContext.Provider value={{ businesses, activeBusiness, setActiveBusiness, loading, refetch: fetchBusinesses }}>
      {children}
    </BusinessContext.Provider>
  );
};

export const useBusiness = () => useContext(BusinessContext);
