import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";

const PAGE_SIZE = 20;
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { useCrypto } from "@/hooks/useCrypto";
import { encryptField, decryptField } from "@/lib/crypto";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, ArrowDownLeft, ArrowUpRight, Search, Trash2, Lock, Edit2, Repeat2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { logAudit } from "@/lib/audit";

const defaultForm = {
  type: "credit",
  amount: "",
  account_id: "",
  category_id: "",
  payment_method: "cash",
  notes: "",
  transaction_date: new Date().toISOString().split("T")[0],
  transfer_to_account_id: "",
  payment_status: "paid",
};

const Transactions = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeBusiness } = useBusiness();
  const { dek, isUnlocked } = useCrypto();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<any | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [form, setForm] = useState({ ...defaultForm });

  const resetForm = () => {
    setForm({ ...defaultForm, transaction_date: new Date().toISOString().split("T")[0] });
    setEditingTx(null);
  };

  const fetchData = useCallback(async () => {
    if (!activeBusiness) return;
    setLoading(true);
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const [txRes, accRes, catRes] = await Promise.all([
      supabase
        .from("transactions")
        .select("*, accounts(name), categories(name, color), transfer_account:transfer_to_account_id(name)", { count: "exact" })
        .eq("business_id", activeBusiness.id)
        .order("transaction_date", { ascending: false })
        .range(from, to),
      supabase.from("accounts").select("id, name, type").eq("business_id", activeBusiness.id).order("name"),
      supabase.from("categories").select("id, name, type, color").order("name"),
    ]);

    const rawTxs = txRes.data || [];
    const decrypted = await Promise.all(
      rawTxs.map(async (tx) => {
        let amount = Number(tx.amount);
        let notes = tx.notes as string | null;
        let encrypted = false;

        if (tx.amount_enc && tx.amount_iv && dek) {
          try {
            amount = parseFloat(await decryptField(tx.amount_enc, tx.amount_iv, dek));
            encrypted = true;
          } catch {}
        }
        if (tx.notes_enc && tx.notes_iv && dek) {
          try { notes = await decryptField(tx.notes_enc, tx.notes_iv, dek); } catch {}
        }
        return { ...tx, amount, notes, _encrypted: encrypted };
      })
    );

    setTransactions(decrypted);
    setTotalCount(txRes.count || 0);
    setAccounts(accRes.data || []);
    setCategories(catRes.data || []);
    setLoading(false);
  }, [activeBusiness, dek, page]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !activeBusiness) return;
    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount <= 0) { toast.error("Enter a valid amount"); return; }

    let encryptedFields: Record<string, string> = {};
    if (dek) {
      const { ciphertext: amount_enc, iv: amount_iv } = await encryptField(amount.toString(), dek);
      encryptedFields = { amount_enc, amount_iv };
      if (form.notes) {
        const { ciphertext: notes_enc, iv: notes_iv } = await encryptField(form.notes, dek);
        encryptedFields = { ...encryptedFields, notes_enc, notes_iv };
      }
    }

    const { error } = await (supabase as any).rpc("create_transaction", {
      p_user_id: user.id,
      p_business_id: activeBusiness.id,
      p_account_id: form.account_id || null,
      p_type: form.type,
      p_payment_method: form.payment_method,
      p_amount: amount,
      p_amount_enc: encryptedFields.amount_enc || null,
      p_amount_iv: encryptedFields.amount_iv || null,
      p_notes: form.notes || null,
      p_notes_enc: encryptedFields.notes_enc || null,
      p_notes_iv: encryptedFields.notes_iv || null,
      p_category_id: form.category_id || null,
      p_transaction_date: form.transaction_date,
      p_transfer_to_account_id: form.type === "transfer" ? (form.transfer_to_account_id || null) : null,
      p_payment_status: form.payment_status || "paid",
    });
    if (error) { toast.error(error.message); return; }

    logAudit(user.id, "TRANSACTION_CREATE", { type: form.type });
    toast.success(form.type === "transfer" ? "Transfer recorded" : "Transaction created");
    resetForm();
    setDialogOpen(false);
    fetchData();
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTx || !dek) return;
    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount <= 0) { toast.error("Enter a valid amount"); return; }

    const { ciphertext: amount_enc, iv: amount_iv } = await encryptField(amount.toString(), dek);
    let encFields: Record<string, string> = { amount_enc, amount_iv };
    if (form.notes) {
      const { ciphertext: notes_enc, iv: notes_iv } = await encryptField(form.notes, dek);
      encFields = { ...encFields, notes_enc, notes_iv };
    }

    const updatePayload: Record<string, any> = {
      type: form.type, amount, payment_method: form.payment_method,
      notes: form.notes || null, category_id: form.category_id || null,
      account_id: form.account_id || null,
      transaction_date: form.transaction_date,
      payment_status: form.payment_status,
      ...encFields,
    };
    if (form.type === "transfer") {
      updatePayload.transfer_to_account_id = form.transfer_to_account_id || null;
    }

    const { error } = await supabase.from("transactions").update(updatePayload).eq("id", editingTx.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Transaction updated");
    resetForm();
    setDialogOpen(false);
    fetchData();
  };

  const openEdit = (tx: any) => {
    setEditingTx(tx);
    setForm({
      type: tx.type,
      amount: tx.amount.toString(),
      account_id: tx.account_id || "",
      category_id: tx.category_id || "",
      payment_method: tx.payment_method || "cash",
      notes: tx.notes || "",
      transaction_date: format(new Date(tx.transaction_date), "yyyy-MM-dd"),
      transfer_to_account_id: tx.transfer_to_account_id || "",
      payment_status: tx.payment_status || "paid",
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    if (user) logAudit(user.id, "TRANSACTION_DELETE", { id });
    toast.success("Transaction deleted");
    fetchData();
  };

  const handleStatusToggle = async (tx: any) => {
    const newStatus = tx.payment_status === "paid" ? "pending" : "paid";
    const { error } = await supabase.from("transactions").update({ payment_status: newStatus }).eq("id", tx.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Status updated");
    fetchData();
  };

  const filtered = transactions
    .filter((t) =>
      (t.accounts?.name || "").toLowerCase().includes(search.toLowerCase()) ||
      (t.notes || "").toLowerCase().includes(search.toLowerCase())
    )
    .filter((t) => statusFilter === "all" || (t.payment_status || "paid") === statusFilter);

  const statusBadgeClass = (status: string) => {
    if (status === "paid") return "bg-chart-credit/15 text-chart-credit border border-chart-credit/30";
    if (status === "pending") return "bg-amber-400/15 text-amber-400 border border-amber-400/30";
    return "bg-info/15 text-info border border-info/30";
  };

  if (!activeBusiness) return <div className="p-8 text-center text-muted-foreground">Select a business first.</div>;

  return (
    <div className="space-y-6 animate-fade-in">
      {!isUnlocked && (
        <Alert variant="destructive">
          <Lock className="w-4 h-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>Vault is locked. Amounts cannot be decrypted.</span>
            <Button size="sm" variant="outline" onClick={() => navigate("/login")}>Log in again</Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Transactions</h1>
        <Button size="sm" onClick={() => { resetForm(); setDialogOpen(true); }}>
          <Plus className="w-4 h-4 mr-1" /> Add Transaction
        </Button>
      </div>

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) resetForm(); setDialogOpen(open); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingTx ? "Edit Transaction" : "New Transaction"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={editingTx ? handleUpdate : handleCreate} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="credit">Credit (In)</SelectItem>
                    <SelectItem value="debit">Debit (Out)</SelectItem>
                    <SelectItem value="transfer">Transfer (Between Accounts)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Amount (₹)</Label>
                <Input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{form.type === "transfer" ? "From Account" : "Account"}</Label>
              <Select value={form.account_id} onValueChange={(v) => setForm({ ...form, account_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name} ({a.type})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {form.type === "transfer" && (
              <div className="space-y-2">
                <Label>To Account</Label>
                <Select value={form.transfer_to_account_id} onValueChange={(v) => setForm({ ...form, transfer_to_account_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select destination account" /></SelectTrigger>
                  <SelectContent>
                    {accounts.filter((a) => a.id !== form.account_id).map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name} ({a.type})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

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
              <Label>Payment Status</Label>
              <Select value={form.payment_status} onValueChange={(v) => setForm({ ...form, payment_status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="paid">Paid ✓</SelectItem>
                  <SelectItem value="pending">Pending ⏳</SelectItem>
                  <SelectItem value="partial">Partial ◑</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={form.transaction_date} onChange={(e) => setForm({ ...form, transaction_date: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
            </div>
            <Button type="submit" className="w-full">
              {editingTx ? "Update Transaction" : "Create Transaction"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search transactions..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
      </div>

      {/* Status filter chips */}
      <div className="flex items-center gap-2 flex-wrap">
        {["all", "pending", "paid", "partial"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${
              statusFilter === s
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:border-primary/50"
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-muted-foreground p-8">No transactions found.</div>
      ) : (
        <div className="glass-card divide-y divide-border">
          {filtered.map((tx) => {
            const isTransfer = tx.type === "transfer";
            const fromName = tx.accounts?.name || "—";
            const toName = tx.transfer_account?.name || "—";
            const txStatus = tx.payment_status || "paid";
            return (
              <div key={tx.id} className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center ${
                    isTransfer ? "bg-amber-400/10" : tx.type === "credit" ? "bg-chart-credit/10" : "bg-chart-debit/10"
                  }`}>
                    {isTransfer
                      ? <Repeat2 className="w-4 h-4 text-amber-400" />
                      : tx.type === "credit"
                        ? <ArrowDownLeft className="w-4 h-4 text-chart-credit" />
                        : <ArrowUpRight className="w-4 h-4 text-chart-debit" />
                    }
                  </div>
                  <div className="min-w-0">
                    <p
                      className={`text-sm font-medium truncate ${!isTransfer && tx.account_id ? "cursor-pointer hover:text-primary transition-colors" : ""}`}
                      onClick={() => !isTransfer && tx.account_id && navigate(`/accounts/${tx.account_id}`)}
                    >
                      {isTransfer ? `${fromName} → ${toName}` : fromName}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                      <span>{format(new Date(tx.transaction_date), "dd MMM yyyy")}</span>
                      <span>•</span>
                      <span>{tx.payment_method?.toUpperCase()}</span>
                      {tx.categories?.name && (
                        <>
                          <span>•</span>
                          <span style={{ color: tx.categories.color || undefined }}>{tx.categories.name}</span>
                        </>
                      )}
                    </div>
                    {tx.notes && <p className="text-xs text-muted-foreground mt-0.5">{tx.notes}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                  <button
                    onClick={() => handleStatusToggle(tx)}
                    className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full transition-opacity hover:opacity-70 ${statusBadgeClass(txStatus)}`}
                    title="Click to toggle paid/pending"
                  >
                    {txStatus}
                  </button>
                  {tx._encrypted && <Lock className="w-3 h-3 text-muted-foreground/50" title="Encrypted" />}
                  <span className={`font-mono font-semibold text-sm ${
                    isTransfer ? "text-amber-400" : tx.type === "credit" ? "text-chart-credit" : "text-chart-debit"
                  }`}>
                    {isTransfer ? "" : tx.type === "credit" ? "+" : "-"}₹{Number(tx.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </span>
                  <button onClick={() => openEdit(tx)} className="text-muted-foreground hover:text-primary transition-colors">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(tx.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalCount > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={(page + 1) * PAGE_SIZE >= totalCount} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Transactions;
