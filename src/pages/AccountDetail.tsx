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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Phone, Mail } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import WhatsAppReminder from "@/components/WhatsAppReminder";

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
  const [netBalance, setNetBalance] = useState(0);
  const [runningBalances, setRunningBalances] = useState<Record<string, number>>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [presetType, setPresetType] = useState<"credit" | "debit">("credit");
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [form, setForm] = useState({
    type: "credit", amount: "", category_id: "", payment_method: "cash",
    notes: "", transaction_date: new Date().toISOString().split("T")[0],
  });

  const openDialog = (type: "credit" | "debit") => {
    setPresetType(type);
    setForm((f) => ({ ...f, type, amount: "", notes: "" }));
    setDialogOpen(true);
  };

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

  const fetchAllForStats = async (acct?: any) => {
    if (!id) return;
    const { data } = await supabase
      .from("transactions")
      .select("id, amount, amount_enc, amount_iv, type, transaction_date")
      .eq("account_id", id)
      .order("transaction_date", { ascending: true });

    // Compute opening balance starting point
    const accountData = acct ?? account;
    const obAmount = Number(accountData?.opening_balance) || 0;
    const obType = accountData?.opening_balance_type || "none";
    let runningBal = obType === "you_got" ? obAmount : obType === "you_gave" ? -obAmount : 0;

    const balMap: Record<string, number> = {};
    let netBal = runningBal;

    await Promise.all((data || []).map(async (tx) => {
      let amount = Number(tx.amount);
      if (tx.amount_enc && tx.amount_iv && dek) {
        try { amount = parseFloat(await decryptField(tx.amount_enc, tx.amount_iv, dek)); } catch { /* fallback */ }
      }
      return { ...tx, amount };
    })).then((decrypted) => {
      decrypted.forEach((tx) => {
        netBal += tx.type === "credit" ? tx.amount : -tx.amount;
        balMap[tx.id] = netBal;
      });
    });

    setNetBalance(netBal);
    setRunningBalances(balMap);
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      const catRes = await supabase.from("categories").select("id, name, type, color").order("name");
      setCategories(catRes.data || []);
      // Fetch account first so opening_balance is available for stats
      const { data: acctData } = await supabase.from("accounts").select("*").eq("id", id!).single();
      let resolvedAcct = acctData;
      if (acctData) {
        let name = acctData.name;
        if (acctData.name_enc && acctData.name_iv && dek) {
          try { name = await decryptField(acctData.name_enc, acctData.name_iv, dek); } catch { /* fallback */ }
        }
        let phone = acctData.phone;
        if (acctData.phone_enc && acctData.phone_iv && dek) {
          try { phone = await decryptField(acctData.phone_enc, acctData.phone_iv, dek); } catch { /* fallback */ }
        }
        let email = acctData.email;
        if (acctData.email_enc && acctData.email_iv && dek) {
          try { email = await decryptField(acctData.email_enc, acctData.email_iv, dek); } catch { /* fallback */ }
        }
        resolvedAcct = { ...acctData, name, phone, email };
        setAccount(resolvedAcct);
      } else {
        navigate("/accounts");
        return;
      }
      await Promise.all([fetchTransactions(), fetchAllForStats(resolvedAcct)]);
      setLoading(false);
    };
    init();
  }, [id, dek]);

  useEffect(() => { fetchTransactions(); }, [page]);

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

    const { error } = await (supabase.from("transactions") as any).insert({
      user_id: user.id,
      business_id: activeBusiness.id,
      account_id: id,
      type: form.type,
      payment_method: form.payment_method,
      amount,
      ...encFields,
      notes: form.notes || null,
      category_id: form.category_id || null,
      transaction_date: form.transaction_date,
    });
    if (error) { toast.error(error.message); return; }

    toast.success(form.type === "credit" ? "Payment received" : "Payment given");
    setForm({ type: "credit", amount: "", category_id: "", payment_method: "cash", notes: "", transaction_date: new Date().toISOString().split("T")[0] });
    setDialogOpen(false);
    setPage(0);
    await Promise.all([fetchTransactions(), fetchAllForStats()]);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!account) return null;

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const isCustomer = account.type === "customer";
  const netLabel = netBalance > 0
    ? (isCustomer ? "You'll Get" : "You'll Get Back")
    : netBalance < 0
    ? (isCustomer ? "You'll Give" : "You Owe")
    : "Settled";

  return (
    <div className="space-y-4 animate-fade-in pb-24">
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
          {/* NET BALANCE */}
          <div className="text-right">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">NET BALANCE</p>
            <p className={`text-xl font-bold font-mono mt-0.5 ${netBalance >= 0 ? "text-chart-credit" : "text-chart-debit"}`}>
              {netLabel}: ₹{Math.abs(netBalance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>
        {(account.email || account.phone) && (
          <div className="flex gap-4 mt-3 text-sm text-muted-foreground">
            {account.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{account.phone}</span>}
            {account.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{account.email}</span>}
          </div>
        )}
        {/* Send Reminder — only when phone exists and balance is non-zero */}
        {netBalance !== 0 && (
          <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            {account.phone ? (
              <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "13px", color: "hsl(var(--muted-foreground))", fontWeight: 500 }}>
                  Send Reminder
                </span>
                <WhatsAppReminder
                  customerName={account.name}
                  customerPhone={account.phone}
                  pendingAmount={Math.abs(netBalance)}
                  businessName={activeBusiness?.name || "Our Business"}
                  accountType={account.type as "customer" | "supplier"}
                />
              </div>
            ) : (
              <p style={{ fontSize: "12px", color: "hsl(var(--muted-foreground))", opacity: 0.6 }}>
                Add a phone number to this account to send payment reminders.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Transaction list — YOU GAVE / YOU GOT layout */}
      <div className="glass-card overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[1fr_96px_96px] gap-1 px-4 py-2.5 bg-muted/40 border-b border-border">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">ENTRIES</span>
          <span className="text-xs font-semibold text-chart-debit uppercase tracking-wide text-right">YOU GAVE</span>
          <span className="text-xs font-semibold text-chart-credit uppercase tracking-wide text-right">YOU GOT</span>
        </div>

        {transactions.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">No transactions yet.</div>
        ) : (
          <div className="divide-y divide-border">
            {transactions.map((tx) => {
              const runBal = runningBalances[tx.id];
              return (
                <div key={tx.id} className="grid grid-cols-[1fr_96px_96px] gap-1 px-4 py-3 hover:bg-muted/20 transition-colors items-start">
                  {/* Left: date + details */}
                  <div>
                    <p className="text-xs font-medium">{format(new Date(tx.transaction_date), "dd MMM yyyy")}</p>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                      <span>{tx.payment_method?.toUpperCase()}</span>
                      {tx.categories?.name && (
                        <><span>·</span><span style={{ color: tx.categories.color || undefined }}>{tx.categories.name}</span></>
                      )}
                    </div>
                    {tx.notes && <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[180px]">{tx.notes}</p>}
                    {runBal !== undefined && (
                      <p className="text-[10px] text-muted-foreground/60 mt-1">
                        Balance: {runBal >= 0 ? "+" : "-"}₹{Math.abs(runBal).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </p>
                    )}
                  </div>
                  {/* YOU GAVE column (debit) */}
                  <div className="text-right pt-0.5">
                    {tx.type === "debit" ? (
                      <span className="font-mono font-semibold text-sm text-chart-debit">
                        ₹{Number(tx.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </div>
                  {/* YOU GOT column (credit) */}
                  <div className="text-right pt-0.5">
                    {tx.type === "credit" ? (
                      <span className="font-mono font-semibold text-sm text-chart-credit">
                        ₹{Number(tx.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

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

      {/* Bottom action buttons — sticky */}
      <div className="fixed bottom-0 left-0 right-0 lg:left-64 z-30 bg-background/95 backdrop-blur border-t border-border p-3">
        <div className="grid grid-cols-2 gap-3 max-w-3xl mx-auto">
          <button
            onClick={() => openDialog("debit")}
            className="flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm"
            style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", color: "#EF4444" }}
          >
            You Gave ₹
          </button>
          <button
            onClick={() => openDialog("credit")}
            className="flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm"
            style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.3)", color: "#10B981" }}
          >
            You Got ₹
          </button>
        </div>
      </div>

      {/* Add Transaction Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{presetType === "credit" ? "You Got — Record Payment" : "You Gave — Record Payment"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="credit">You Got (Credit)</SelectItem>
                    <SelectItem value="debit">You Gave (Debit)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Amount (₹)</Label>
                <Input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required autoFocus />
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
            <Button type="submit" className={`w-full ${form.type === "credit" ? "bg-chart-credit hover:bg-chart-credit/90" : "bg-chart-debit hover:bg-chart-debit/90"} text-white`}>
              {form.type === "credit" ? "Save — You Got" : "Save — You Gave"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AccountDetail;
