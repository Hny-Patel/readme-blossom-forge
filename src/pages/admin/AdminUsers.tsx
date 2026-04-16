import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Search, ShieldBan, ShieldCheck, CreditCard, Building2, ChevronRight } from "lucide-react";
import { format } from "date-fns";

interface UserRow {
  user_id: string;
  display_name: string | null;
  joined_at: string;
  plan_id: string | null;
  subscription_status: string | null;
  business_count: number;
  total_paid: number;
  is_restricted: boolean | null;
}

const AdminUsers = () => {
  const { user: adminUser } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("__all__");
  const [selected, setSelected] = useState<UserRow | null>(null);
  const [userBusinesses, setUserBusinesses] = useState<any[]>([]);
  const [userPayments, setUserPayments] = useState<any[]>([]);
  const [blockDialog, setBlockDialog] = useState(false);
  const [blockReason, setBlockReason] = useState("");
  const [subDialog, setSubDialog] = useState(false);
  const [subForm, setSubForm] = useState({ plan_id: "free", billing_cycle: "monthly", end_date: "" });

  const fetchUsers = useCallback(async () => {
    const { data } = await (supabase.from("admin_user_stats" as any).select("*").order("joined_at", { ascending: false }) as any);
    setUsers((data || []) as UserRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const fetchUserDetail = useCallback(async (u: UserRow) => {
    setSelected(u);
    const [bizRes, payRes] = await Promise.all([
      (supabase.from("businesses" as any).select("id, name, type, created_at").eq("user_id", u.user_id) as any),
      (supabase.from("payments" as any).select("*").eq("user_id", u.user_id).order("created_at", { ascending: false }).limit(10) as any),
    ]);
    setUserBusinesses(bizRes.data || []);
    setUserPayments(payRes.data || []);
  }, []);

  const handleBlock = async () => {
    if (!selected || !adminUser) return;
    await (supabase.from("login_restrictions" as any).insert({
      user_id: selected.user_id,
      restriction_type: "blocked",
      reason: blockReason,
      created_by: adminUser.id,
      is_active: true,
    }) as any);
    toast.success("User blocked");
    setBlockDialog(false);
    setBlockReason("");
    fetchUsers();
    setSelected((prev) => prev ? { ...prev, is_restricted: true } : prev);
  };

  const handleUnblock = async () => {
    if (!selected) return;
    await (supabase.from("login_restrictions" as any)
      .update({ is_active: false })
      .eq("user_id", selected.user_id)
      .eq("is_active", true) as any);
    toast.success("User unblocked");
    fetchUsers();
    setSelected((prev) => prev ? { ...prev, is_restricted: false } : prev);
  };

  const handleUpgrade = async () => {
    if (!selected) return;
    // Expire existing active subscriptions
    await (supabase.from("subscriptions" as any)
      .update({ status: "cancelled" })
      .eq("user_id", selected.user_id)
      .in("status", ["active", "trial"]) as any);
    // Insert new
    await (supabase.from("subscriptions" as any).insert({
      user_id: selected.user_id,
      plan_id: subForm.plan_id,
      status: "active",
      billing_cycle: subForm.billing_cycle,
      end_date: subForm.end_date || null,
      gateway: "manual",
    }) as any);
    toast.success("Subscription updated");
    setSubDialog(false);
    fetchUsers();
    setSelected((prev) => prev ? { ...prev, plan_id: subForm.plan_id } : prev);
  };

  const filtered = users.filter((u) => {
    const name = (u.display_name ?? u.user_id).toLowerCase();
    const matchSearch = !search || name.includes(search.toLowerCase());
    const matchPlan = planFilter === "__all__" || u.plan_id === planFilter;
    return matchSearch && matchPlan;
  });

  const PLAN_COLORS: Record<string, string> = {
    free: "text-muted-foreground", starter: "text-blue-400", pro: "text-chart-credit", enterprise: "text-amber-400",
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Users</h1>
        <p className="text-sm text-muted-foreground mt-1">{users.length} total users</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4">
        {/* List */}
        <div className="glass-card flex flex-col">
          <div className="p-3 border-b border-border space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
              <Input placeholder="Search users..." className="pl-8 h-8 text-sm" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={planFilter} onValueChange={setPlanFilter}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Filter by plan" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Plans</SelectItem>
                <SelectItem value="free">Free</SelectItem>
                <SelectItem value="starter">Starter</SelectItem>
                <SelectItem value="pro">Pro</SelectItem>
                <SelectItem value="enterprise">Enterprise</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1 overflow-auto divide-y divide-border">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-14 m-3 rounded-lg bg-muted/30 animate-pulse" />
              ))
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">No users found</div>
            ) : (
              filtered.map((u) => (
                <button
                  key={u.user_id}
                  onClick={() => fetchUserDetail(u)}
                  className={`w-full text-left px-4 py-3 hover:bg-muted/30 transition-colors flex items-center justify-between gap-2 ${selected?.user_id === u.user_id ? "bg-muted/40" : ""}`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{u.display_name || "—"}</p>
                      {u.is_restricted && <ShieldBan className="w-3.5 h-3.5 text-chart-debit flex-shrink-0" />}
                    </div>
                    <p className={`text-xs font-semibold capitalize ${PLAN_COLORS[u.plan_id ?? "free"]}`}>
                      {u.plan_id ?? "free"}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-muted-foreground">{u.business_count} biz</p>
                    <p className="text-xs font-mono text-chart-credit">₹{Number(u.total_paid).toLocaleString("en-IN")}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Detail panel */}
        <div className="glass-card flex flex-col">
          {!selected ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm p-8 text-center">
              Select a user to view details
            </div>
          ) : (
            <div className="p-5 space-y-5 overflow-auto flex-1">
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-bold text-lg">{selected.display_name || "Unnamed User"}</h2>
                  <p className="text-xs text-muted-foreground font-mono">{selected.user_id}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Joined {format(new Date(selected.joined_at), "dd MMM yyyy")}
                  </p>
                </div>
                <div className={`text-xs font-semibold px-2 py-1 rounded capitalize ${
                  selected.is_restricted ? "bg-chart-debit/10 text-chart-debit" : "bg-chart-credit/10 text-chart-credit"
                }`}>
                  {selected.is_restricted ? "Blocked" : "Active"}
                </div>
              </div>

              {/* Plan */}
              <div className="bg-muted/30 rounded-lg p-3 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Current Plan</p>
                  <p className={`font-bold capitalize ${PLAN_COLORS[selected.plan_id ?? "free"]}`}>
                    {selected.plan_id ?? "free"}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => { setSubForm({ plan_id: selected.plan_id ?? "free", billing_cycle: "monthly", end_date: "" }); setSubDialog(true); }}>
                  <CreditCard className="w-3.5 h-3.5 mr-1" /> Change Plan
                </Button>
              </div>

              {/* Businesses */}
              {userBusinesses.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Businesses ({userBusinesses.length})</p>
                  <div className="space-y-1">
                    {userBusinesses.map((b: any) => (
                      <div key={b.id} className="flex items-center gap-2 text-sm px-2 py-1.5 bg-muted/20 rounded">
                        <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                        <span>{b.name || "—"}</span>
                        <span className="text-xs text-muted-foreground ml-auto capitalize">{b.type || ""}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Payments */}
              {userPayments.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Recent Payments</p>
                  <div className="space-y-1">
                    {userPayments.map((p: any) => (
                      <div key={p.id} className="flex items-center justify-between text-sm px-2 py-1.5 bg-muted/20 rounded">
                        <span className="font-mono text-xs">{p.invoice_number}</span>
                        <span className={`text-xs font-semibold ${p.status === "paid" ? "text-chart-credit" : p.status === "failed" ? "text-chart-debit" : "text-amber-400"}`}>
                          {p.status}
                        </span>
                        <span className="font-mono text-xs">₹{Number(p.amount).toLocaleString("en-IN")}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Block / Unblock */}
              <div className="border-t border-border pt-3">
                {selected.is_restricted ? (
                  <Button size="sm" variant="outline" className="text-chart-credit border-chart-credit/30" onClick={handleUnblock}>
                    <ShieldCheck className="w-3.5 h-3.5 mr-1" /> Unblock User
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" className="text-chart-debit border-chart-debit/30" onClick={() => setBlockDialog(true)}>
                    <ShieldBan className="w-3.5 h-3.5 mr-1" /> Block User
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Block dialog */}
      <Dialog open={blockDialog} onOpenChange={setBlockDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Block User</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">This will prevent the user from accessing the app.</p>
            <Input placeholder="Reason (optional)" value={blockReason} onChange={(e) => setBlockReason(e.target.value)} />
            <div className="flex gap-2">
              <Button className="flex-1 bg-chart-debit hover:bg-chart-debit/80" onClick={handleBlock}>Block</Button>
              <Button variant="outline" className="flex-1" onClick={() => setBlockDialog(false)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Subscription dialog */}
      <Dialog open={subDialog} onOpenChange={setSubDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Change Subscription</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Plan</label>
              <Select value={subForm.plan_id} onValueChange={(v) => setSubForm({ ...subForm, plan_id: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">Free</SelectItem>
                  <SelectItem value="starter">Starter</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                  <SelectItem value="enterprise">Enterprise</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Billing Cycle</label>
              <Select value={subForm.billing_cycle} onValueChange={(v) => setSubForm({ ...subForm, billing_cycle: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                  <SelectItem value="lifetime">Lifetime</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">End Date (leave blank = no expiry)</label>
              <Input type="date" value={subForm.end_date} onChange={(e) => setSubForm({ ...subForm, end_date: e.target.value })} />
            </div>
            <div className="flex gap-2 pt-1">
              <Button className="flex-1" onClick={handleUpgrade}>Save</Button>
              <Button variant="outline" className="flex-1" onClick={() => setSubDialog(false)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminUsers;
