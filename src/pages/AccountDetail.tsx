import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { useCrypto } from "@/hooks/useCrypto";
import { encryptField, decryptField } from "@/lib/crypto";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, ArrowDownLeft, ArrowUpRight, Plus, Phone, Mail } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const PAGE_SIZE = 20;

const AccountDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeBusiness } = useBusiness();
  const { dek } = useCrypto();

  const [account, setAccount] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ credited: 0, debited: 0, count: 0 });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [form, setForm] = useState({
    type: "credit", amount: "", category_id: "", payment_method: "cash",
    notes: "", transaction_date: new Date().toISOString().split("T")[0],
  });

  const fetchAccount = async () => {
    if (!id) return;
    const { data } = await supabase.from("accounts").select("*").eq("id", id).single();
    if (!data) { navigate("/accounts"); return; }
    let name = data.name;
    if (data.name_enc && data.name_iv && dek) {
      try { name = await decryptField(data.name_enc, data.name_iv, dek); } catch { /* fallback */ }
    }
    let phone = data.phone;
    if (data.phone_enc && data.phone_iv && dek) {
      try { phone = await decryptField(data.phone_enc, data.phone_iv, dek); } catch { /* fallback */ }
    }
    let email = data.email;
    if (data.email_enc && data.email_iv && dek) {
      try { email = await decryptField(data.email_enc, data.email_iv, dek); } catch { /* fallback */ }
    }
    setAccount({ ...data, name, phone, email });
  };

  const fetchTransactions = async () => {
    if (!id) return;
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, count } = await supabase
      .from("transactions")
      .select("*, categories(name, color)", { count: "exact" })
      .eq("account_id", id)
      .order("transaction_date", { ascending: false })
      .range(from, to);

    const decrypted = await Promise.all((data || []).map(async (tx) => {
      let amount = Number(tx.amount);
      if (tx.amount_enc && tx.amount_iv && dek) {
        try { amount = parseFloat(await decryptField(tx.amount_enc, tx.amount_iv, dek)); } catch { /* fallback */ }
      }
      let notes = tx.notes as string | null;
      if (tx.notes_enc && tx.notes_iv && dek) {
        try { notes = await decryptField(tx.notes_enc, tx.notes_iv, dek); } catch { /* fallback */ }
      }
      return { ...tx, amount, notes };
    }));

    setTransactions(decrypted);
    setTotalCount(count || 0);
  };

  const fetchAllForStats = async () => {
    if (!id) return;
    const { data } = await supabase.from("transactions").select("amount, amount_enc, amount_iv, type").eq("account_id", id);
    let credited = 0, debited = 0;
    await Promise.all((data || []).map(async (tx) => {
      let amount = Number(tx.amount);
      if (tx.amount_enc && tx.amount_iv && dek) {
        try { amount = parseFloat(await decryptField(tx.amount_enc, tx.amount_iv, dek)); } catch { /* fallback */ }
      }
      if (tx.type === "credit") credited += amount;
      else debited += amount;
    }));
    setStats({ credited, debited, count: data?.length || 0 });
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      const catRes = await supabase.from("categories").select("id, name, type, color").order("name");
      setCategories(catRes.data || []);
      await fetchAccount();
      await Promise.all([fetchTransactions(), fetchAllForStats()]);
      setLoading(false);
    };
    init();
  }, [id, dek]);

  useEffect(() => {
    fetchTransactions();
  }, [page]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !activeBusiness || !id) return;
    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount <= 0) { toast.error("Enter a valid amount"); return; }

    let encFields: Record<string, string> = {};
    if (dek) {
      const { ciphertext: amount_enc, iv: amount_iv } = await encryptField(amount.toString(), dek);
      encFields = { amount_enc, amount_iv };
      if (form.notes) {
        const { ciphertext: notes_enc, iv: notes_iv } = await encryptField(form.notes, dek);
        encFields = { ...encFields, notes_enc, notes_iv };
      }
    }

    const { error } = await (supabase as any).rpc("create_transaction", {
      p_user_id: user.id,
      p_business_id: activeBusiness.id,
      p_account_id: id,
      p_type: form.type,
      p_payment_method: form.payment_method,
      p_amount: amount,
      p_amount_enc: encFields.amount_enc || null,
      p_amount_iv: encFields.amount_iv || null,
      p_notes: form.notes || null,
      p_notes_enc: encFields.notes_enc || null,
      p_notes_iv: encFields.notes_iv || null,
      p_category_id: form.category_id || null,
      p_transaction_date: form.transaction_date,
    });
    if (error) { toast.error(error.message); return; }

    toast.success("Transaction added");
    setForm({ type: "credit", amount: "", category_id: "", payment_method: "cash", notes: "", transaction_date: new Date().toISOString().split("T")[0] });
    setDialogOpen(false);
    setPage(0);
    await Promise.all([fetchTransactions(), fetchAllForStats()]);
  };

  const netBalance = stats.credited - stats.debited;

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!account) return null;

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/accounts")}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Accounts
        </Button>
      </div>

      {/* Header */}
      <div className="glass-card p-5">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">{account.name}</h1>
            <span className={`text-xs px-2 py-0.5 rounded-full mt-1 inline-block ${account.type === "customer" ? "bg-chart-credit/10 text-chart-credit" : "bg-info/10 text-info"}`}>
              {account.type}
            </span>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="w-4 h-4 mr-1" /> Add Transaction</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>New Transaction</DialogTitle></DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="credit">Credit (In)</SelectItem>
                        <SelectItem value="debit">Debit (Out)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Amount (₹)</Label>
                    <Input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Payment</Label>
                    <Select value={form.payment_method} onValueChange={(v) => setForm({ ...form, payment_method: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="bank">Bank</SelectItem>
                        <SelectItem value="upi">UPI</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input type="date" value={form.transaction_date} onChange={(e) => setForm({ ...form, transaction_date: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
                </div>
                <Button type="submit" className="w-full">Create Transaction</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
        {(account.email || account.phone) && (
          <div className="flex gap-4 mt-3 text-sm text-muted-foreground">
            {account.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{account.phone}</span>}
            {account.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{account.email}</span>}
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-card p-4">
          <p className="text-sm text-muted-foreground mb-1">Total Received</p>
          <p className="text-2xl font-bold font-mono text-chart-credit">₹{stats.credited.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
          <p className="text-xs text-muted-foreground mt-1">{stats.count} transactions total</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-sm text-muted-foreground mb-1">Total Paid</p>
          <p className="text-2xl font-bold font-mono text-chart-debit">₹{stats.debited.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-sm text-muted-foreground mb-1">Net Balance</p>
          <p className={`text-2xl font-bold font-mono ${netBalance >= 0 ? "text-chart-credit" : "text-chart-debit"}`}>
            {netBalance >= 0 ? "+" : "-"}₹{Math.abs(netBalance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {/* Transaction list */}
      {transactions.length === 0 ? (
        <div className="glass-card p-8 text-center text-muted-foreground">No transactions for this account yet.</div>
      ) : (
        <div className="glass-card divide-y divide-border">
          {transactions.map((tx) => (
            <div key={tx.id} className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${tx.type === "credit" ? "bg-chart-credit/10" : "bg-chart-debit/10"}`}>
                  {tx.type === "credit" ? <ArrowDownLeft className="w-4 h-4 text-chart-credit" /> : <ArrowUpRight className="w-4 h-4 text-chart-debit" />}
                </div>
                <div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{format(new Date(tx.transaction_date), "dd MMM yyyy")}</span>
                    <span>•</span>
                    <span>{tx.payment_method?.toUpperCase()}</span>
                    {tx.categories?.name && (
                      <><span>•</span><span style={{ color: tx.categories.color || undefined }}>{tx.categories.name}</span></>
                    )}
                  </div>
                  {tx.notes && <p className="text-xs text-muted-foreground mt-0.5">{tx.notes}</p>}
                </div>
              </div>
              <span className={`font-mono font-semibold ${tx.type === "credit" ? "text-chart-credit" : "text-chart-debit"}`}>
                {tx.type === "credit" ? "+" : "-"}₹{Number(tx.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AccountDetail;
