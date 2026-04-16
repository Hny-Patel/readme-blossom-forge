import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/hooks/useBusiness";
import { useCrypto } from "@/hooks/useCrypto";
import { decryptField } from "@/lib/crypto";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { ArrowDownLeft, ArrowUpRight, IndianRupee, TrendingUp, Plus, Lock } from "lucide-react";
import WhatsAppReminder from "@/components/WhatsAppReminder";
import { Link } from "react-router-dom";
import { format, subDays } from "date-fns";

const Dashboard = () => {
  const navigate = useNavigate();
  const { activeBusiness } = useBusiness();
  const { dek } = useCrypto();
  const [loading, setLoading] = useState(false);
  const [metrics, setMetrics] = useState({
    totalCredit: 0, totalDebit: 0, netBalance: 0, accountCount: 0,
  });
  const [recentTxns, setRecentTxns] = useState<any[]>([]);
  const [miniChart, setMiniChart] = useState<{ date: string; credit: number; debit: number }[]>([]);
  const [topAccounts, setTopAccounts] = useState<{ name: string; volume: number; net: number }[]>([]);
  const [pendingDues, setPendingDues] = useState<any[]>([]);

  useEffect(() => {
    if (!activeBusiness || !dek) return;
    const run = async () => {
      setLoading(true);
      const [txRes, accRes] = await Promise.all([
        supabase.from("transactions").select("*, accounts!account_id(id, name, phone)").eq("business_id", activeBusiness.id).order("transaction_date", { ascending: false }),
        supabase.from("accounts").select("id").eq("business_id", activeBusiness.id),
      ]);

      const raw = txRes.data || [];

      // Decrypt amounts
      const txns = await Promise.all(raw.map(async (tx) => {
        let amount = Number(tx.amount);
        if (tx.amount_enc && tx.amount_iv && dek) {
          try { amount = parseFloat(await decryptField(tx.amount_enc, tx.amount_iv, dek)); } catch { /* fallback */ }
        }
        let notes = tx.notes as string | null;
        if (tx.notes_enc && tx.notes_iv && dek) {
          try { notes = await decryptField(tx.notes_enc, tx.notes_iv, dek); } catch { /* fallback */ }
        }
        return { ...tx, amount, notes, _encrypted: !!(tx.amount_enc) };
      }));

      // Totals
      const totalCredit = txns.filter(t => t.type === "credit").reduce((s, t) => s + t.amount, 0);
      const totalDebit = txns.filter(t => t.type === "debit").reduce((s, t) => s + t.amount, 0);
      setMetrics({ totalCredit, totalDebit, netBalance: totalCredit - totalDebit, accountCount: accRes.data?.length || 0 });

      // Recent 10
      setRecentTxns(txns.slice(0, 10));

      // Mini chart: last 7 days
      const today = new Date();
      const dayMap: Record<string, { credit: number; debit: number }> = {};
      for (let i = 6; i >= 0; i--) {
        dayMap[format(subDays(today, i), "dd MMM")] = { credit: 0, debit: 0 };
      }
      txns.forEach((tx) => {
        const label = format(new Date(tx.transaction_date), "dd MMM");
        if (dayMap[label]) {
          if (tx.type === "credit") dayMap[label].credit += tx.amount;
          else dayMap[label].debit += tx.amount;
        }
      });
      setMiniChart(Object.entries(dayMap).map(([date, v]) => ({ date, ...v })));

      // Top 5 accounts by volume
      const accMap: Record<string, { name: string; credit: number; debit: number }> = {};
      txns.forEach((tx) => {
        if (!tx.account_id) return;
        if (!accMap[tx.account_id]) accMap[tx.account_id] = { name: tx.accounts?.name || "—", credit: 0, debit: 0 };
        if (tx.type === "credit") accMap[tx.account_id].credit += tx.amount;
        else accMap[tx.account_id].debit += tx.amount;
      });
      const sorted = Object.entries(accMap)
        .map(([id, v]) => ({ id, name: v.name, volume: v.credit + v.debit, net: v.credit - v.debit }))
        .sort((a, b) => b.volume - a.volume)
        .slice(0, 5);
      setTopAccounts(sorted);

      // Pending dues
      const pending = txns
        .filter((t) => (t as any).payment_status === "pending")
        .sort((a, b) => new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime());
      setPendingDues(pending);

      setLoading(false);
    };
    run();
  }, [activeBusiness, dek]);

  const markPaid = async (txId: string) => {
    await (supabase.from("transactions") as any).update({ payment_status: "paid" }).eq("id", txId);
    setPendingDues((prev) => prev.filter((t) => t.id !== txId));
  };

  if (!dek) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center gap-3">
        <div style={{ fontSize: "40px" }}>🔒</div>
        <h2 className="text-xl font-semibold">Vault is locked</h2>
        <p className="text-muted-foreground text-sm">
          Your encryption key is not loaded. Please sign in again.
        </p>
        <Button onClick={() => navigate("/login", { state: { vaultLocked: true } })}>
          Unlock Vault
        </Button>
      </div>
    );
  }

  if (!activeBusiness) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <h2 className="text-xl font-semibold mb-2">No business found</h2>
        <p className="text-muted-foreground mb-4">Create a business to get started.</p>
      </div>
    );
  }

  const statCards = [
    { label: "Total Credit", value: metrics.totalCredit, icon: ArrowDownLeft, color: "text-chart-credit" },
    { label: "Total Debit", value: metrics.totalDebit, icon: ArrowUpRight, color: "text-chart-debit" },
    { label: "Net Balance", value: metrics.netBalance, icon: TrendingUp, color: metrics.netBalance >= 0 ? "text-chart-credit" : "text-chart-debit" },
    { label: "Accounts", value: metrics.accountCount, icon: IndianRupee, color: "text-info", isCurrency: false },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground text-sm">{activeBusiness.name}</p>
        </div>
        <Link to="/transactions">
          <Button size="sm"><Plus className="w-4 h-4 mr-1" /> New Transaction</Button>
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)
          : statCards.map(({ label, value, icon: Icon, color, isCurrency = true }) => (
            <div key={label} className="glass-card p-4 animate-slide-up">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">{label}</span>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
              <p className={`text-2xl font-bold font-mono ${color}`}>
                {isCurrency ? `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : value}
              </p>
            </div>
          ))}
      </div>

      {/* Mini cash flow chart */}
      <div className="glass-card p-4">
        <h2 className="font-semibold mb-3 text-sm text-muted-foreground uppercase tracking-wide">Cash Flow — Last 7 Days</h2>
        {loading ? <Skeleton className="h-[180px] w-full" /> : (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={miniChart} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
              <Tooltip formatter={(v: number) => `₹${v.toLocaleString("en-IN")}`} />
              <Bar dataKey="credit" name="Credit" fill="#10B981" radius={[3, 3, 0, 0]} />
              <Bar dataKey="debit" name="Debit" fill="#EF4444" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Transactions */}
        <div className="glass-card">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold">Recent Transactions</h2>
            <Link to="/transactions" className="text-xs text-primary hover:underline">View all</Link>
          </div>
          {loading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
            </div>
          ) : recentTxns.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">No transactions yet.</div>
          ) : (
            <div className="divide-y divide-border">
              {recentTxns.map((tx) => (
                <div
                  key={tx.id}
                  className={`flex items-center justify-between p-3 hover:bg-muted/30 transition-colors ${tx.account_id ? "cursor-pointer" : ""}`}
                  onClick={() => tx.account_id && navigate(`/accounts/${tx.account_id}`)}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center ${tx.type === "credit" ? "bg-chart-credit/10" : "bg-chart-debit/10"}`}>
                      {tx.type === "credit" ? <ArrowDownLeft className="w-3.5 h-3.5 text-chart-credit" /> : <ArrowUpRight className="w-3.5 h-3.5 text-chart-debit" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium leading-tight">{tx.accounts?.name || "—"}</p>
                      <p className="text-xs text-muted-foreground">{format(new Date(tx.transaction_date), "dd MMM yyyy")}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {tx._encrypted && <Lock className="w-3 h-3 text-muted-foreground/40" />}
                    <span className={`font-mono text-sm font-semibold ${tx.type === "credit" ? "text-chart-credit" : "text-chart-debit"}`}>
                      {tx.type === "credit" ? "+" : "-"}₹{Number(tx.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Accounts */}
        <div className="glass-card">
          <div className="p-4 border-b border-border">
            <h2 className="font-semibold">Top Accounts</h2>
          </div>
          {loading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
            </div>
          ) : topAccounts.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">No account data yet.</div>
          ) : (
            <div className="divide-y divide-border">
              {topAccounts.map((acc, i) => {
                const initials = acc.name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
                return (
                  <div key={i} className="flex items-center justify-between p-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                        {initials}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{acc.name}</p>
                        <p className="text-xs text-muted-foreground">Vol: ₹{acc.volume.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</p>
                      </div>
                    </div>
                    <span className={`text-sm font-mono font-semibold ${acc.net >= 0 ? "text-chart-credit" : "text-chart-debit"}`}>
                      {acc.net >= 0 ? "+" : "-"}₹{Math.abs(acc.net).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Pending Dues */}
      <div className="glass-card">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold">Pending Dues</h2>
          {!loading && pendingDues.length > 0 && (
            <span className="text-xs text-amber-400 bg-amber-400/10 border border-amber-400/30 px-2 py-0.5 rounded-full font-mono">
              {pendingDues.length} pending
            </span>
          )}
        </div>
        {loading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
          </div>
        ) : pendingDues.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">No pending dues 🎉</div>
        ) : (
          <div className="divide-y divide-border">
            {pendingDues.map((tx) => {
              const txDate = new Date(tx.transaction_date);
              const daysAgo = Math.floor((Date.now() - txDate.getTime()) / (1000 * 60 * 60 * 24));
              const isOverdue = daysAgo > 7;
              return (
                <div key={tx.id} className="flex items-center justify-between p-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{tx.accounts?.name || "—"}</p>
                    <p className={`text-xs mt-0.5 ${isOverdue ? "text-chart-debit" : "text-muted-foreground"}`}>
                      {format(txDate, "dd MMM yyyy")} · {daysAgo === 0 ? "Today" : `${daysAgo}d ago`}
                      {isOverdue && " · Overdue"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 ml-3 flex-wrap justify-end">
                    <span className={`font-mono text-sm font-semibold ${tx.type === "credit" ? "text-chart-credit" : "text-chart-debit"}`}>
                      {tx.type === "credit" ? "+" : "-"}₹{Number(tx.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </span>
                    {tx.accounts?.phone && (
                      <WhatsAppReminder
                        customerName={tx.accounts?.name || ""}
                        customerPhone={tx.accounts.phone}
                        pendingAmount={tx.amount}
                        businessName={activeBusiness?.name || ""}
                        accountType="customer"
                      />
                    )}
                    <Button size="sm" variant="outline" className="text-xs h-7 px-2" onClick={() => markPaid(tx.id)}>
                      Mark Paid
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
