import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/hooks/useBusiness";
import { useCrypto } from "@/hooks/useCrypto";
import { decryptField } from "@/lib/crypto";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { format, subDays, eachDayOfInterval } from "date-fns";
import { ArrowUpRight, ArrowDownLeft, Target, TrendingUp } from "lucide-react";

const Analytics = () => {
  const { activeBusiness } = useBusiness();
  const { dek, isUnlocked } = useCrypto();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalIncome: 0,
    totalExpense: 0,
    profit: 0,
    avgTxValue: 0,
  });
  const [last30DaysData, setLast30DaysData] = useState<any[]>([]);
  const [categoryData, setCategoryData] = useState<any[]>([]);
  const [runningBalanceData, setRunningBalanceData] = useState<any[]>([]);

  useEffect(() => {
    const fetchAndProcessData = async () => {
      if (!activeBusiness || !isUnlocked || !dek) return;

      setLoading(true);

      const { data: rows } = await supabase
        .from("transactions")
        .select("*, categories(name, color)")
        .eq("business_id", activeBusiness.id)
        .order("transaction_date", { ascending: true }); // ASC for running balance

      const txs = rows || [];

      // Decrypt amounts (backward compat: fall back to plaintext for old rows)
      const decryptedTxs = await Promise.all(
        txs.map(async (row) => {
          let amount = Number(row.amount);
          if (row.amount_enc && row.amount_iv && dek) {
            try { amount = parseFloat(await decryptField(row.amount_enc, row.amount_iv, dek)); } catch { /* fallback */ }
          }
          return { ...row, amount };
        })
      );

      // --- c. Running Balance (all time) ---
      let balance = 0;
      const rbData = decryptedTxs.map((tx) => {
        if (tx.type === "credit") balance += tx.amount;
        else balance -= tx.amount;
        return {
          date: format(new Date(tx.transaction_date), "dd MMM yy"),
          balance,
        };
      });
      setRunningBalanceData(rbData);

      // --- a. Last 30 Days Cash Flow ---
      const endDate = new Date();
      const startDate = subDays(endDate, 29);
      const daysArray = eachDayOfInterval({ start: startDate, end: endDate }).map((d) =>
        format(d, "yyyy-MM-dd")
      );

      const txsInLast30Days = decryptedTxs.filter(
        (tx) => new Date(tx.transaction_date) >= startDate
      );

      const dailyCache: Record<string, { credit: number; debit: number }> = {};
      daysArray.forEach((d) => (dailyCache[d] = { credit: 0, debit: 0 }));

      txsInLast30Days.forEach((tx) => {
        const d = tx.transaction_date;
        if (dailyCache[d]) {
          if (tx.type === "credit") dailyCache[d].credit += tx.amount;
          else dailyCache[d].debit += tx.amount;
        }
      });

      const l30dData = daysArray.map((d) => ({
        date: format(new Date(d), "dd MMM"),
        credit: dailyCache[d].credit,
        debit: dailyCache[d].debit,
      }));
      setLast30DaysData(l30dData);

      // --- d. Stats This Month ---
      const currentMonthStr = format(new Date(), "yyyy-MM");
      const thisMonthTxs = decryptedTxs.filter((tx) =>
        tx.transaction_date.startsWith(currentMonthStr)
      );

      let totalIncome = 0;
      let totalExpense = 0;
      thisMonthTxs.forEach((tx) => {
        if (tx.type === "credit") totalIncome += tx.amount;
        else totalExpense += tx.amount;
      });

      setStats({
        totalIncome,
        totalExpense,
        profit: totalIncome - totalExpense,
        avgTxValue: thisMonthTxs.length
          ? (totalIncome + totalExpense) / thisMonthTxs.length
          : 0,
      });

      // --- b. Category Breakdown (expense only) ---
      const expenseTxs = decryptedTxs.filter((tx) => tx.type === "debit");
      const catMap: Record<string, { value: number; color: string; name: string }> = {};

      expenseTxs.forEach((tx) => {
        const catName = tx.categories?.name || "Uncategorized";
        const catColor = tx.categories?.color || "#9CA3AF";
        if (!catMap[catName]) {
          catMap[catName] = { name: catName, value: 0, color: catColor };
        }
        catMap[catName].value += tx.amount;
      });
      setCategoryData(Object.values(catMap).sort((a, b) => b.value - a.value));

      setLoading(false);
    };

    fetchAndProcessData();
  }, [activeBusiness, dek, isUnlocked]);

  if (!isUnlocked) {
    return (
      <div className="p-8 text-center text-muted-foreground animate-fade-in">
        <h2 className="text-xl font-semibold mb-2">Vault is locked</h2>
        <p>Please log in again to decrypt your data.</p>
      </div>
    );
  }

  if (!activeBusiness) {
    return <div className="p-8 text-center text-muted-foreground">Select a business first.</div>;
  }

  if (loading) {
    return <div className="text-center text-muted-foreground p-8">Loading analytics...</div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-sm text-muted-foreground">Insights for {format(new Date(), "MMMM yyyy")}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Stat Cards */}
        <div className="glass-card p-4">
          <div className="flex justify-between items-start mb-1">
            <p className="text-sm text-muted-foreground">Total Income (This Month)</p>
            <div className="p-1.5 rounded-full bg-chart-credit/10 text-chart-credit"><ArrowDownLeft className="w-4 h-4"/></div>
          </div>
          <p className="text-2xl font-bold font-mono text-chart-credit">
            ₹{stats.totalIncome.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>

        <div className="glass-card p-4">
          <div className="flex justify-between items-start mb-1">
            <p className="text-sm text-muted-foreground">Total Expense (This Month)</p>
            <div className="p-1.5 rounded-full bg-chart-debit/10 text-chart-debit"><ArrowUpRight className="w-4 h-4"/></div>
          </div>
          <p className="text-2xl font-bold font-mono text-chart-debit">
            ₹{stats.totalExpense.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>

        <div className="glass-card p-4">
          <div className="flex justify-between items-start mb-1">
            <p className="text-sm text-muted-foreground">Net Profit/Loss</p>
            <div className={`p-1.5 rounded-full ${stats.profit >= 0 ? "bg-chart-credit/10 text-chart-credit" : "bg-chart-debit/10 text-chart-debit"}`}><Target className="w-4 h-4"/></div>
          </div>
          <p className={`text-2xl font-bold font-mono ${stats.profit >= 0 ? "text-chart-credit" : "text-chart-debit"}`}>
            ₹{Math.abs(stats.profit).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>

        <div className="glass-card p-4">
          <div className="flex justify-between items-start mb-1">
            <p className="text-sm text-muted-foreground">Avg. Transaction Value</p>
            <div className="p-1.5 rounded-full bg-primary/10 text-primary"><TrendingUp className="w-4 h-4"/></div>
          </div>
          <p className="text-2xl font-bold font-mono text-primary">
            ₹{stats.avgTxValue.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      <div className="glass-card p-4 md:p-6 space-y-4">
        <h2 className="text-lg font-semibold">Cash Flow (Last 30 Days)</h2>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={last30DaysData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} tickMargin={10} minTickGap={20} />
              <YAxis tickFormatter={(val) => `₹${val>=1000 ? (val/1000).toFixed(0)+'k' : val}`} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
              <Tooltip
                contentStyle={{ backgroundColor: "hsl(var(--background))", borderRadius: "8px", border: "1px solid hsl(var(--border))" }}
                formatter={(value: number) => [`₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, undefined]}
              />
              <Legend wrapperStyle={{ paddingTop: "10px" }} />
              <Bar dataKey="credit" name="Credit (In)" fill="#10B981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="debit" name="Debit (Out)" fill="#EF4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card p-4 md:p-6 space-y-4">
          <h2 className="text-lg font-semibold">Running Balance</h2>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={runningBalanceData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} minTickGap={30} />
                <YAxis tickFormatter={(val) => `₹${val>=1000 ? (val/1000).toFixed(0)+'k' : val}`} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: "hsl(var(--background))", borderRadius: "8px", border: "1px solid hsl(var(--border))" }}
                  formatter={(value: number) => [`₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, "Balance"]}
                />
                <Line type="stepAfter" dataKey="balance" stroke="#3B82F6" strokeWidth={2} dot={false} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-card p-4 md:p-6 space-y-4">
          <h2 className="text-lg font-semibold">Expense Breakdown (All Time)</h2>
          {categoryData.length > 0 ? (
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--background))", borderRadius: "8px", border: "1px solid hsl(var(--border))" }}
                    formatter={(value: number) => [`₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, undefined]}
                  />
                  <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: "12px" }} />
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color || "#9CA3AF"} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">
              No expenses recorded yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Analytics;
