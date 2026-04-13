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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, ArrowDownLeft, ArrowUpRight, Search, Trash2, Lock } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

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
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [form, setForm] = useState({
    type: "credit",
    amount: "",
    account_id: "",
    category_id: "",
    payment_method: "cash",
    notes: "",
    transaction_date: new Date().toISOString().split("T")[0],
  });

  const fetchData = useCallback(async () => {
    if (!activeBusiness) return;
    setLoading(true);
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const [txRes, accRes, catRes] = await Promise.all([
      supabase
        .from("transactions")
        .select("*, accounts(name), categories(name, color)", { count: "exact" })
        .eq("business_id", activeBusiness.id)
        .order("transaction_date", { ascending: false })
        .range(from, to),
      supabase.from("accounts").select("id, name, type").eq("business_id", activeBusiness.id).order("name"),
      supabase.from("categories").select("id, name, type, color").order("name"),
    ]);

    const rawTxs = txRes.data || [];

    // Decrypt encrypted rows; fall back to plaintext for old rows
    const decrypted = await Promise.all(
      rawTxs.map(async (tx) => {
        let amount = Number(tx.amount);
        let notes = tx.notes as string | null;
        let encrypted = false;

        if (tx.amount_enc && tx.amount_iv && dek) {
          try {
            amount = parseFloat(await decryptField(tx.amount_enc, tx.amount_iv, dek));
            encrypted = true;
          } catch {
            // DEK mismatch — leave as plaintext
          }
        }
        if (tx.notes_enc && tx.notes_iv && dek) {
          try {
            notes = await decryptField(tx.notes_enc, tx.notes_iv, dek);
          } catch {
            // leave as plaintext
          }
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

    const txPayload = {
      user_id: user.id,
      business_id: activeBusiness.id,
      type: form.type,
      amount,                          // kept for backward compat during migration period
      account_id: form.account_id || null,
      category_id: form.category_id || null,
      payment_method: form.payment_method,
      notes: form.notes || null,       // kept for backward compat
      transaction_date: form.transaction_date,
      ...encryptedFields,
    };

    const { data: tx, error } = await supabase.from("transactions").insert(txPayload).select().single();
    if (error) { toast.error(error.message); return; }

    // Double-entry journal
    const debitAccount = form.type === "debit" ? "5000" : "1000";
    const creditAccount = form.type === "debit" ? "1000" : "4000";
    await supabase.from("journal_entries").insert({
      user_id: user.id,
      transaction_id: tx.id,
      debit_account: debitAccount,
      credit_account: creditAccount,
      amount,
      description: form.notes || `${form.type} transaction`,
      entry_date: form.transaction_date,
    });

    toast.success("Transaction created");
    setForm({ type: "credit", amount: "", account_id: "", category_id: "", payment_method: "cash", notes: "", transaction_date: new Date().toISOString().split("T")[0] });
    setDialogOpen(false);
    fetchData();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Transaction deleted");
    fetchData();
  };

  const filtered = transactions.filter((t) =>
    (t.accounts?.name || "").toLowerCase().includes(search.toLowerCase()) ||
    (t.notes || "").toLowerCase().includes(search.toLowerCase())
  );

  if (!activeBusiness) return <div className="p-8 text-center text-muted-foreground">Select a business first.</div>;

  return (
    <div className="space-y-6 animate-fade-in">
      {!isUnlocked && (
        <Alert variant="destructive">
          <Lock className="w-4 h-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>Vault is locked. Amounts cannot be decrypted.</span>
            <Button size="sm" variant="outline" onClick={() => navigate("/login")}>
              Log in again
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Transactions</h1>
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
              <div className="space-y-2">
                <Label>Account</Label>
                <Select value={form.account_id} onValueChange={(v) => setForm({ ...form, account_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name} ({a.type})</SelectItem>)}
                  </SelectContent>
                </Select>
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

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search transactions..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-muted-foreground p-8">No transactions found.</div>
      ) : (
        <div className="glass-card divide-y divide-border">
          {filtered.map((tx) => (
            <div key={tx.id} className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${tx.type === "credit" ? "bg-chart-credit/10" : "bg-chart-debit/10"}`}>
                  {tx.type === "credit" ? <ArrowDownLeft className="w-4 h-4 text-chart-credit" /> : <ArrowUpRight className="w-4 h-4 text-chart-debit" />}
                </div>
                <div>
                  <p
                    className={`text-sm font-medium ${tx.account_id ? "cursor-pointer hover:text-primary transition-colors" : ""}`}
                    onClick={() => tx.account_id && navigate(`/accounts/${tx.account_id}`)}
                  >{tx.accounts?.name || "—"}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
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
              <div className="flex items-center gap-2">
                {tx._encrypted && (
                  <Lock className="w-3 h-3 text-muted-foreground/50" title="Encrypted" />
                )}
                <span className={`font-mono font-semibold ${tx.type === "credit" ? "text-chart-credit" : "text-chart-debit"}`}>
                  {tx.type === "credit" ? "+" : "-"}₹{Number(tx.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
                <button onClick={() => handleDelete(tx.id)} className="text-muted-foreground hover:text-destructive transition-colors ml-1">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
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
