import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/* ─── Plan feature shape ──────────────────────────────────── */
export interface PlanFeatures {
  max_businesses: number | null;
  max_accounts: number | null;
  max_transactions_per_month: number | null;
  has_analytics: boolean;
  has_pdf_reports: boolean;
  has_cashbook: boolean;
  has_expenses: boolean;
  has_data_export: boolean;
}

export interface Plan {
  id: string;
  name: string;
  description: string | null;
  price_monthly: number;
  price_yearly: number;
  currency: string;
  features: PlanFeatures;
}

export interface Subscription {
  id: string;
  plan_id: string;
  status: string;
  billing_cycle: string;
  start_date: string;
  end_date: string | null;
}

export interface UsageStats {
  businesses: number;
  accounts: number;
  transactions_this_month: number;
}

const DEFAULT_FEATURES: PlanFeatures = {
  max_businesses: 1,
  max_accounts: 10,
  max_transactions_per_month: 50,
  has_analytics: false,
  has_pdf_reports: false,
  has_cashbook: false,
  has_expenses: false,
  has_data_export: false,
};

interface SubscriptionContextValue {
  subscription: Subscription | null;
  plan: Plan | null;
  features: PlanFeatures;
  usageStats: UsageStats;
  loading: boolean;
  /** Returns true if the user is OVER the limit for this feature type */
  isOverLimit: (type: keyof UsageStats) => boolean;
  /** Returns true if the feature is unavailable on their plan */
  featureLocked: (feature: keyof PlanFeatures) => boolean;
  refetch: () => void;
}

const SubscriptionContext = createContext<SubscriptionContextValue>({
  subscription: null,
  plan: null,
  features: DEFAULT_FEATURES,
  usageStats: { businesses: 0, accounts: 0, transactions_this_month: 0 },
  loading: true,
  isOverLimit: () => false,
  featureLocked: () => false,
  refetch: () => {},
});

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();

  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [features, setFeatures] = useState<PlanFeatures>(DEFAULT_FEATURES);
  const [usageStats, setUsageStats] = useState<UsageStats>({
    businesses: 0,
    accounts: 0,
    transactions_this_month: 0,
  });
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!user) { setLoading(false); return; }

    // 1. Fetch active subscription + plan
    const { data: subData } = await (supabase
      .from("subscriptions" as any)
      .select("*, plans(*)")
      .eq("user_id", user.id)
      .in("status", ["active", "trial"])
      .order("created_at", { ascending: false })
      .limit(1)
      .single() as any);

    if (subData) {
      const sub: Subscription = {
        id: subData.id,
        plan_id: subData.plan_id,
        status: subData.status,
        billing_cycle: subData.billing_cycle,
        start_date: subData.start_date,
        end_date: subData.end_date,
      };
      setSubscription(sub);

      const p: Plan = {
        id: subData.plans.id,
        name: subData.plans.name,
        description: subData.plans.description,
        price_monthly: subData.plans.price_monthly,
        price_yearly: subData.plans.price_yearly,
        currency: subData.plans.currency,
        features: subData.plans.features as PlanFeatures,
      };
      setPlan(p);
      setFeatures(p.features);
    } else {
      // fallback — treat as free plan
      setFeatures(DEFAULT_FEATURES);
    }

    // 2. Fetch usage stats
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [bizRes, accRes, txRes] = await Promise.all([
      supabase.from("businesses").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      supabase.from("accounts").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      supabase.from("transactions").select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("transaction_date", startOfMonth.toISOString()),
    ]);

    setUsageStats({
      businesses: bizRes.count ?? 0,
      accounts: accRes.count ?? 0,
      transactions_this_month: txRes.count ?? 0,
    });

    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!authLoading) fetchAll();
  }, [user, authLoading]);

  const isOverLimit = useCallback((type: keyof UsageStats): boolean => {
    const limit = {
      businesses: features.max_businesses,
      accounts: features.max_accounts,
      transactions_this_month: features.max_transactions_per_month,
    }[type];
    if (limit === null || limit === undefined) return false;
    return usageStats[type] >= limit;
  }, [features, usageStats]);

  const featureLocked = useCallback((feature: keyof PlanFeatures): boolean => {
    if (typeof features[feature] === "boolean") return !(features[feature] as boolean);
    return false;
  }, [features]);

  return (
    <SubscriptionContext.Provider value={{
      subscription, plan, features, usageStats, loading,
      isOverLimit, featureLocked, refetch: fetchAll,
    }}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  return useContext(SubscriptionContext);
}
