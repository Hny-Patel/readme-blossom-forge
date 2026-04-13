import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { ArrowDownLeft, ArrowUpRight, IndianRupee, TrendingUp, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

interface DashboardMetrics {
  totalCredit: number;
  totalDebit: number;
  netBalance: number;
  accountCount: number;
  recentTransactions: any[];
}

const Dashboard = () => {
  const { user } = useAuth();
  const { activeBusiness } = useBusiness();
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    totalCredit: 0, totalDebit: 0, netBalance: 0, accountCount: 0, recentTransactions: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeBusiness) return;
    const fetchMetrics = async () => {
      setLoading(true);
      const [txRes, accRes] = await Promise.all([
        supabase
          .from("transactions")
          .select("*, accounts(name)")
          .eq("business_id", activeBusiness.id)
          .order("transaction_date", { ascending: false }),
        supabase
          .from("accounts")
          .select("id")
          .eq("business_id", activeBusiness.id),
      ]);

      const txns = txRes.data || [];
      const totalCredit = txns.filter((t) => t.type === "credit").reduce((s, t) => s + Number(t.amount), 0);
      const totalDebit = txns.filter((t) => t.type === "debit").reduce((s, t) => s + Number(t.amount), 0);

      setMetrics({
        totalCredit,
        totalDebit,
        netBalance: totalCredit - totalDebit,
        accountCount: accRes.data?.length || 0,
        recentTransactions: txns.slice(0, 10),
      });
      setLoading(false);
    };
    fetchMetrics();
  }, [activeBusiness]);

  const statCards = [
    { label: "Total Credit", value: metrics.totalCredit, icon: ArrowDownLeft, color: "text-chart-credit" },
    { label: "Total Debit", value: metrics.totalDebit, icon: ArrowUpRight, color: "text-chart-debit" },
    { label: "Net Balance", value: metrics.netBalance, icon: TrendingUp, color: metrics.netBalance >= 0 ? "text-chart-credit" : "text-chart-debit" },
    { label: "Accounts", value: metrics.accountCount, icon: IndianRupee, color: "text-info", isCurrency: false },
  ];

  if (!activeBusiness) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <h2 className="text-xl font-semibold mb-2">No business found</h2>
        <p className="text-muted-foreground mb-4">Create a business to get started.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground text-sm">{activeBusiness.name}</p>
        </div>
        <Link to="/transactions">
          <Button size="sm">
            <Plus className="w-4 h-4 mr-1" /> New Transaction
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(({ label, value, icon: Icon, color, isCurrency = true }) => (
          <div key={label} className="glass-card p-4 animate-slide-up">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">{label}</span>
              <Icon className={`w-4 h-4 ${color}`} />
            </div>
            <p className={`text-2xl font-bold font-mono ${color}`}>
              {isCurrency !== false ? `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : value}
            </p>
          </div>
        ))}
      </div>

      <div className="glass-card">
        <div className="p-4 border-b border-border">
          <h2 className="font-semibold">Recent Transactions</h2>
        </div>
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Loading...</div>
        ) : metrics.recentTransactions.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            No transactions yet. Create your first one!
          </div>
        ) : (
          <div className="divide-y divide-border">
            {metrics.recentTransactions.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${tx.type === "credit" ? "bg-chart-credit/10" : "bg-chart-debit/10"}`}>
                    {tx.type === "credit" ? (
                      <ArrowDownLeft className="w-4 h-4 text-chart-credit" />
                    ) : (
                      <ArrowUpRight className="w-4 h-4 text-chart-debit" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{tx.accounts?.name || "—"}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(tx.transaction_date), "dd MMM yyyy")}
                      {tx.payment_method && ` • ${tx.payment_method.toUpperCase()}`}
                    </p>
                  </div>
                </div>
                <span className={`font-mono font-semibold ${tx.type === "credit" ? "text-chart-credit" : "text-chart-debit"}`}>
                  {tx.type === "credit" ? "+" : "-"}₹{Number(tx.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
