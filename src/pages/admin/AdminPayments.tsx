import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Search, Plus, Pencil } from "lucide-react";
import { format } from "date-fns";

interface Payment {
  id: string;
  user_id: string;
  subscription_id: string | null;
  invoice_number: string;
  amount: number;
  currency: string;
  status: string;
  payment_method: string | null;
  payment_date: string | null;
  notes: string | null;
  profiles?: { display_name: string | null };
}

const STATUS_COLORS: Record<string, string> = {
  paid: "text-chart-credit", pending: "text-amber-400", failed: "text-chart-debit", refunded: "text-muted-foreground",
};

const EMPTY_FORM = {
  user_id: "", subscription_id: "", amount: "", currency: "INR",
  status: "paid", payment_method: "bank_transfer", payment_date: new Date().toISOString().split("T")[0], notes: "",
};

const AdminPayments = () => {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("__all__");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Payment | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [users, setUsers] = useState<any[]>([]);
  const [userSubs, setUserSubs] = useState<any[]>([]);

  const fetchPayments = useCallback(async () => {
    const { data } = await (supabase
      .from("payments" as any)
      .select("*, profiles(display_name)")
      .order("created_at", { ascending: false }) as any);
    setPayments(data || []);
    setLoading(false);
  }, []);

  const fetchUsers = useCallback(async () => {
    const { data } = await (supabase.from("profiles" as any).select("user_id, display_name").order("display_name") as any);
    setUsers(data || []);
  }, []);

  useEffect(() => { fetchPayments(); fetchUsers(); }, [fetchPayments, fetchUsers]);

  const fetchSubsForUser = async (userId: string) => {
    const { data } = await (supabase.from("subscriptions" as any).select("id, plan_id, status").eq("user_id", userId) as any);
    setUserSubs(data || []);
  };

  const openCreate = async () => {
    // Get next invoice number
    const { data } = await (supabase.rpc("next_invoice_number" as any) as any);
    setForm({ ...EMPTY_FORM, payment_date: new Date().toISOString().split("T")[0] });
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (p: Payment) => {
    setForm({
      user_id: p.user_id,
      subscription_id: p.subscription_id || "",
      amount: String(p.amount),
      currency: p.currency,
      status: p.status,
      payment_method: p.payment_method || "bank_transfer",
      payment_date: p.payment_date ? p.payment_date.split("T")[0] : "",
      notes: p.notes || "",
    });
    setEditing(p);
    fetchSubsForUser(p.user_id);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.user_id || !form.amount) { toast.error("User and amount are required"); return; }
    const payload: any = {
      user_id: form.user_id,
      subscription_id: form.subscription_id || null,
      amount: parseFloat(form.amount),
      currency: form.currency,
      status: form.status,
      payment_method: form.payment_method || null,
      payment_date: form.payment_date || null,
      notes: form.notes || null,
    };

    if (editing) {
      const { error } = await (supabase.from("payments" as any).update(payload).eq("id", editing.id) as any);
      if (error) { toast.error(error.message); return; }
      toast.success("Payment updated");
    } else {
      // Auto invoice number
      const { data: invNum } = await (supabase.rpc("next_invoice_number" as any) as any);
      payload.invoice_number = invNum || `INV-${Date.now()}`;
      const { error } = await (supabase.from("payments" as any).insert(payload) as any);
      if (error) { toast.error(error.message); return; }
      toast.success("Payment recorded — " + payload.invoice_number);
    }
    setDialogOpen(false);
    fetchPayments();
  };

  const filtered = payments.filter((p) => {
    const name = (p.profiles?.display_name ?? p.user_id).toLowerCase();
    const matchSearch = !search || name.includes(search.toLowerCase()) || p.invoice_number.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "__all__" || p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalPaid = payments.filter((p) => p.status === "paid").reduce((s, p) => s + Number(p.amount), 0);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Payments</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Total collected: <span className="font-mono text-chart-credit font-bold">₹{totalPaid.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="w-4 h-4 mr-1" /> Record Payment
        </Button>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
          <Input placeholder="Search by user or invoice..." className="pl-8 h-8 text-sm" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Status</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="refunded">Refunded</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="grid grid-cols-[120px_1fr_90px_100px_80px_80px_36px] gap-2 px-4 py-2 bg-muted/40 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b border-border">
          <span>Invoice</span><span>User</span><span>Amount</span><span>Method</span><span>Date</span><span>Status</span><span></span>
        </div>
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 m-2 rounded bg-muted/20 animate-pulse" />)
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No payments found</div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((p) => (
              <div key={p.id} className="grid grid-cols-[120px_1fr_90px_100px_80px_80px_36px] gap-2 px-4 py-3 items-center hover:bg-muted/20 text-sm">
                <span className="font-mono text-xs">{p.invoice_number}</span>
                <span className="truncate text-xs">{p.profiles?.display_name || p.user_id.slice(0,8)+"..."}</span>
                <span className="font-mono text-xs font-bold">₹{Number(p.amount).toLocaleString("en-IN")}</span>
                <span className="text-xs text-muted-foreground capitalize">{(p.payment_method || "—").replace("_"," ")}</span>
                <span className="text-xs text-muted-foreground">{p.payment_date ? format(new Date(p.payment_date), "dd MMM yy") : "—"}</span>
                <span className={`text-xs font-semibold capitalize ${STATUS_COLORS[p.status]}`}>{p.status}</span>
                <button onClick={() => openEdit(p)} className="p-1 hover:text-primary transition-colors">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editing ? "Edit Payment" : "Record Payment"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">User</Label>
              <Select value={form.user_id} onValueChange={(v) => { setForm({ ...form, user_id: v, subscription_id: "" }); fetchSubsForUser(v); }}>
                <SelectTrigger><SelectValue placeholder="Select user" /></SelectTrigger>
                <SelectContent>
                  {users.map((u: any) => (
                    <SelectItem key={u.user_id} value={u.user_id}>{u.display_name || u.user_id.slice(0,8)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {userSubs.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs">Subscription (optional)</Label>
                <Select value={form.subscription_id || "__none__"} onValueChange={(v) => setForm({ ...form, subscription_id: v === "__none__" ? "" : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— None —</SelectItem>
                    {userSubs.map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>{s.plan_id} ({s.status})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Amount (₹)</Label>
                <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Payment Method</Label>
                <Select value={form.payment_method} onValueChange={(v) => setForm({ ...form, payment_method: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    <SelectItem value="upi">UPI</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="razorpay">Razorpay</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                    <SelectItem value="refunded">Refunded</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Payment Date</Label>
                <Input type="date" value={form.payment_date} onChange={(e) => setForm({ ...form, payment_date: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes..." />
            </div>
            <div className="flex gap-2 pt-1">
              <Button className="flex-1" onClick={handleSave}>{editing ? "Update" : "Record"}</Button>
              <Button variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminPayments;
