import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Users, CreditCard, TrendingUp, ShieldCheck } from "lucide-react";

const COLORS = ["#8B5CF6", "#10B981", "#F59E0B", "#3B82F6"];

const AdminDashboard = () => {
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeSubscriptions: 0,
    mrr: 0,
    newThisMonth: 0,
  });
  const [planDist, setPlanDist] = useState<{ name: string; value: number }[]>([]);
  const [signupChart, setSignupChart] = useState<{ month: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const startOfMonth = new Date();
      startOfMonth.setDate(1); startOfMonth.setHours(0,0,0,0);

      const [profilesRes, subsRes, paymentsRes, newRes] = await Promise.all([
        (supabase.from("profiles" as any).select("id", { count: "exact", head: true }) as any),
        (supabase.from("subscriptions" as any).select("plan_id, plans(name, price_monthly)").in("status", ["active","trial"]) as any),
        (supabase.from("payments" as any).select("amount").eq("status", "paid") as any),
        (supabase.from("profiles" as any).select("id", { count: "exact", head: true }).gte("created_at", startOfMonth.toISOString()) as any),
      ]);

      const subs = subsRes.data || [];
      const mrr = subs.reduce((sum: number, s: any) => sum + (s.plans?.price_monthly ?? 0), 0);

      // Plan distribution
      const dist: Record<string, number> = {};
      subs.forEach((s: any) => { dist[s.plan_id] = (dist[s.plan_id] || 0) + 1; });
      setPlanDist(Object.entries(dist).map(([name, value]) => ({ name, value })));

      setStats({
        totalUsers: profilesRes.count ?? 0,
        activeSubscriptions: subs.length,
        mrr,
        newThisMonth: newRes.count ?? 0,
      });

      // Signup trend: last 6 months
      const months = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        months.push({
          label: d.toLocaleString("en-IN", { month: "short", year: "2-digit" }),
          start: new Date(d.getFullYear(), d.getMonth(), 1).toISOString(),
          end: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).toISOString(),
        });
      }
      const chartData = await Promise.all(months.map(async (m) => {
        const { count } = await (supabase.from("profiles" as any)
          .select("id", { count: "exact", head: true })
          .gte("created_at", m.start)
          .lte("created_at", m.end) as any);
        return { month: m.label, count: count ?? 0 };
      }));
      setSignupChart(chartData);

      setLoading(false);
    };
    fetch();
  }, []);

  const cards = [
    { label: "Total Users", value: stats.totalUsers, icon: Users, color: "text-primary" },
    { label: "Active Subscriptions", value: stats.activeSubscriptions, icon: ShieldCheck, color: "text-chart-credit" },
    { label: "MRR (₹)", value: `₹${stats.mrr.toLocaleString("en-IN")}`, icon: TrendingUp, color: "text-amber-400" },
    { label: "New This Month", value: stats.newThisMonth, icon: CreditCard, color: "text-blue-400" },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Platform overview</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="glass-card p-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{c.label}</p>
              <c.icon className={`w-4 h-4 ${c.color}`} />
            </div>
            {loading ? (
              <div className="h-7 w-20 bg-muted/40 rounded animate-pulse" />
            ) : (
              <p className="text-2xl font-bold font-mono">{c.value}</p>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Signup trend */}
        <div className="glass-card p-4">
          <p className="text-sm font-semibold mb-3">New Signups (6 months)</p>
          {loading ? (
            <div className="h-48 bg-muted/20 rounded animate-pulse" />
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={signupChart}>
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1e2229", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12, color: "#f0f2f8" }}
                />
                <Bar dataKey="count" fill="#8B5CF6" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Plan distribution */}
        <div className="glass-card p-4">
          <p className="text-sm font-semibold mb-3">Plan Distribution</p>
          {loading ? (
            <div className="h-48 bg-muted/20 rounded animate-pulse" />
          ) : planDist.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">No active subscriptions</div>
          ) : (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="50%" height={160}>
                <PieChart>
                  <Pie data={planDist} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" labelLine={false}>
                    {planDist.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2">
                {planDist.map((d, i) => (
                  <div key={d.name} className="flex items-center gap-2 text-sm">
                    <div className="w-3 h-3 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                    <span className="capitalize">{d.name}</span>
                    <span className="text-muted-foreground ml-auto font-mono">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
