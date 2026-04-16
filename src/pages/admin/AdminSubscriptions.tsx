import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Search, Pencil } from "lucide-react";
import { format } from "date-fns";

interface SubRow {
  id: string;
  user_id: string;
  plan_id: string;
  status: string;
  billing_cycle: string;
  start_date: string;
  end_date: string | null;
  trial_end_date: string | null;
  notes: string | null;
  profiles?: { display_name: string | null };
}

const STATUS_COLORS: Record<string, string> = {
  active: "text-chart-credit", trial: "text-blue-400", expired: "text-muted-foreground", cancelled: "text-chart-debit",
};

const AdminSubscriptions = () => {
  const [subs, setSubs] = useState<SubRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("__all__");
  const [editing, setEditing] = useState<SubRow | null>(null);
  const [form, setForm] = useState({ plan_id: "free", status: "active", billing_cycle: "monthly", end_date: "", notes: "" });

  const fetchSubs = useCallback(async () => {
    const { data } = await (supabase
      .from("subscriptions" as any)
      .select("*, profiles(display_name)")
      .order("created_at", { ascending: false }) as any);
    setSubs(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchSubs(); }, [fetchSubs]);

  const openEdit = (s: SubRow) => {
    setEditing(s);
    setForm({
      plan_id: s.plan_id,
      status: s.status,
      billing_cycle: s.billing_cycle,
      end_date: s.end_date ? s.end_date.split("T")[0] : "",
      notes: s.notes || "",
    });
  };

  const handleSave = async () => {
    if (!editing) return;
    const { error } = await (supabase.from("subscriptions" as any).update({
      plan_id: form.plan_id,
      status: form.status,
      billing_cycle: form.billing_cycle,
      end_date: form.end_date || null,
      notes: form.notes || null,
    }).eq("id", editing.id) as any);
    if (error) { toast.error(error.message); return; }
    toast.success("Subscription updated");
    setEditing(null);
    fetchSubs();
  };

  const filtered = subs.filter((s) => {
    const name = (s.profiles?.display_name ?? s.user_id).toLowerCase();
    const matchSearch = !search || name.includes(search.toLowerCase());
    const matchStatus = statusFilter === "__all__" || s.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Subscriptions</h1>
        <p className="text-sm text-muted-foreground mt-1">{subs.length} total subscriptions</p>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
          <Input placeholder="Search by user..." className="pl-8 h-8 text-sm" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="trial">Trial</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="grid grid-cols-[1fr_80px_80px_100px_80px_40px] gap-2 px-4 py-2 bg-muted/40 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b border-border">
          <span>User</span><span>Plan</span><span>Cycle</span><span>Expires</span><span>Status</span><span></span>
        </div>
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 m-2 rounded bg-muted/20 animate-pulse" />)
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No subscriptions found</div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((s) => (
              <div key={s.id} className="grid grid-cols-[1fr_80px_80px_100px_80px_40px] gap-2 px-4 py-3 items-center hover:bg-muted/20 text-sm">
                <span className="truncate">{s.profiles?.display_name || s.user_id.slice(0, 8) + "..."}</span>
                <span className="font-semibold capitalize text-xs">{s.plan_id}</span>
                <span className="text-xs text-muted-foreground capitalize">{s.billing_cycle}</span>
                <span className="text-xs text-muted-foreground">
                  {s.end_date ? format(new Date(s.end_date), "dd MMM yy") : "—"}
                </span>
                <span className={`text-xs font-semibold capitalize ${STATUS_COLORS[s.status]}`}>{s.status}</span>
                <button onClick={() => openEdit(s)} className="p-1 hover:text-primary transition-colors">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={() => setEditing(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Edit Subscription</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Plan</label>
              <Select value={form.plan_id} onValueChange={(v) => setForm({ ...form, plan_id: v })}>
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
              <label className="text-xs text-muted-foreground">Status</label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="trial">Trial</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Billing Cycle</label>
              <Select value={form.billing_cycle} onValueChange={(v) => setForm({ ...form, billing_cycle: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                  <SelectItem value="lifetime">Lifetime</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">End Date</label>
              <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Notes</label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Admin notes..." />
            </div>
            <div className="flex gap-2 pt-1">
              <Button className="flex-1" onClick={handleSave}>Save</Button>
              <Button variant="outline" className="flex-1" onClick={() => setEditing(null)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminSubscriptions;
