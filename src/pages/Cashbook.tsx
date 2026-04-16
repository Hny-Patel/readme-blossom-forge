import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { useCrypto } from "@/hooks/useCrypto";
import { useSubscription } from "@/hooks/useSubscription";
import UpgradePrompt from "@/components/UpgradePrompt";
import { encryptField, decryptField } from "@/lib/crypto";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import { format, isToday, parseISO } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface CashEntry {
  id: string;
  type: "credit" | "debit";
  amount: number;
  notes: string | null;
  payment_method: string | null;
  transaction_date: string;
  account_name: string | null;
}

const fmt = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

const Cashbook = () => {
  const { user } = useAuth();
  const { activeBusiness } = useBusiness();
  const { dek } = useCrypto();
  const { featureLocked } = useSubscription();

  const [loading, setLoading] = useState(true);
  const [totalBalance, setTotalBalance] = useState(0);
  const [todayBalance, setTodayBalance] = useState(0);
  const [grouped, setGrouped] = useState<Record<string, CashEntry[]>>({});
  const [accounts, setAccounts] = useState<any[]>([]);
  const [dateFilter, setDateFilter] = useState(format(new Date(), "yyyy-MM-dd"));
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [quickAddOpen, setQuickAddOpen] = useState<"in" | "out" | null>(null);
  const [form, setForm] = useState({
    amount: "", payment_method: "cash", account_id: "",
    notes: "", transaction_date: format(new Date(), "yyyy-MM-dd"),
  });

  // Fetch total balance across ALL transactions (no date filter)
  const fetchTotalBalance = useCallback(async () => {
    if (!activeBusiness) return;
    const { data } = await supabase
      .from("transactions")
      .select("type, amount, amount_enc, amount_iv")
      .eq("business_id", activeBusiness.id);

    let total = 0;
    let today = 0;
    const todayStr = format(new Date(), "yyyy-MM-dd");

    await Promise.all((data || []).map(async (tx: any) => {
      let amt = Number(tx.amount);
      if (dek && tx.amount_enc && tx.amount_iv) {
        try { amt = parseFloat(await decryptField(tx.amount_enc, tx.amount_iv, dek)); } catch { /* fallback */ }
      }
      const sign = tx.type === "credit" ? 1 : -1;
      total += sign * amt;
      return { ...tx, amt, sign };
    })).then((rows) => {
      rows.forEach((tx: any) => {
        // re-evaluate today balance
        const txDate = format(new Date(tx.transaction_date ?? ""), "yyyy-MM-dd");
        if (txDate === todayStr) today += tx.sign * tx.amt;
      });
    });

    // simpler: two-pass
    let t = 0;
    let td = 0;
    for (const tx of data || []) {
      let amt = Number(tx.amount);
      if (dek && (tx as any).amount_enc && (tx as any).amount_iv) {
        try { amt = parseFloat(await decryptField((tx as any).amount_enc, (tx as any).amount_iv, dek)); } catch { /* fallback */ }
      }
      const sign = tx.type === "credit" ? 1 : -1;
      t += sign * amt;
      const txDate = (tx as any).transaction_date
        ? format(new Date((tx as any).transaction_date), "yyyy-MM-dd")
        : "";
      if (txDate === todayStr) td += sign * amt;
    }
    setTotalBalance(t);
    setTodayBalance(td);
  }, [activeBusiness, dek]);

  const fetchFiltered = useCallback(async () => {
    if (!activeBusiness) return;
    setLoading(true);

    let query = supabase
      .from("transactions")
      .select("*, accounts!account_id(name)")
      .eq("business_id", activeBusiness.id)
      .order("transaction_date", { ascending: false });

    if (paymentFilter !== "all") {
      query = query.eq("payment_method", paymentFilter);
    }

    // For single-day filter: use gte start-of-day and lte end-of-day
    if (dateFilter) {
      query = supabase
        .from("transactions")
        .select("*, accounts!account_id(name)")
        .eq("business_id", activeBusiness.id)
        .gte("transaction_date", `${dateFilter}T00:00:00`)
        .lte("transaction_date", `${dateFilter}T23:59:59`)
        .order("transaction_date", { ascending: false });
      if (paymentFilter !== "all") query = query.eq("payment_method", paymentFilter);
    } else {
      // Last 30 days
      const thirtyAgo = new Date();
      thirtyAgo.setDate(thirtyAgo.getDate() - 29);
      query = supabase
        .from("transactions")
        .select("*, accounts!account_id(name)")
        .eq("business_id", activeBusiness.id)
        .gte("transaction_date", thirtyAgo.toISOString())
        .order("transaction_date", { ascending: false });
      if (paymentFilter !== "all") query = query.eq("payment_method", paymentFilter);
    }

    const { data, error } = await query;
    if (error) { console.error("Cashbook fetch error:", error); toast.error(error.message); }

    const decrypted: CashEntry[] = await Promise.all((data || []).map(async (tx: any) => {
      let amount = Number(tx.amount);
      if (dek && tx.amount_enc && tx.amount_iv) {
        try { amount = parseFloat(await decryptField(tx.amount_enc, tx.amount_iv, dek)); } catch { /* fallback */ }
      }
      let notes = tx.notes as string | null;
      if (dek && tx.notes_enc && tx.notes_iv) {
        try { notes = await decryptField(tx.notes_enc, tx.notes_iv, dek); } catch { /* fallback */ }
      }
      return {
        id: tx.id,
        type: tx.type,
        amount,
        notes,
        payment_method: tx.payment_method,
        transaction_date: tx.transaction_date,
        account_name: tx.accounts?.name || null,
      };
    }));

    // Group by date label
    const grp: Record<string, CashEntry[]> = {};
    decrypted.forEach((entry) => {
      const dateLabel = format(new Date(entry.transaction_date), "dd MMM yyyy");
      if (!grp[dateLabel]) grp[dateLabel] = [];
      grp[dateLabel].push(entry);
    });
    setGrouped(grp);
    setLoading(false);
  }, [activeBusiness, dek, dateFilter, paymentFilter]);

  const fetchAccounts = useCallback(async () => {
    if (!activeBusiness) return;
    const { data } = await supabase.from("accounts").select("id, name, name_enc, name_iv").eq("business_id", activeBusiness.id).order("name");
    const decrypted = await Promise.all((data || []).map(async (a: any) => {
      let name = a.name;
      if (dek && a.name_enc && a.name_iv) {
        try { name = await decryptField(a.name_enc, a.name_iv, dek); } catch { /* fallback */ }
      }
      return { id: a.id, name };
    }));
    setAccounts(decrypted);
  }, [activeBusiness, dek]);

  useEffect(() => {
    fetchTotalBalance();
    fetchFiltered();
    fetchAccounts();
  }, [fetchTotalBalance, fetchFiltered, fetchAccounts]);

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !activeBusiness || !quickAddOpen) return;
    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount <= 0) { toast.error("Enter a valid amount"); return; }

    const txType = quickAddOpen === "in" ? "credit" : "debit";
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
      account_id: form.account_id || null,
      type: txType,
      payment_method: form.payment_method,
      amount,
      ...encFields,
      notes: form.notes || null,
      transaction_date: new Date(`${form.transaction_date}T${format(new Date(), "HH:mm:ss")}`).toISOString(),
    });
    if (error) { toast.error(error.message); return; }

    toast.success(quickAddOpen === "in" ? "Cash In recorded" : "Cash Out recorded");
    setForm({ amount: "", payment_method: "cash", account_id: "", notes: "", transaction_date: format(new Date(), "yyyy-MM-dd") });
    setQuickAddOpen(null);
    fetchTotalBalance();
    fetchFiltered();
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    const bizName = activeBusiness?.name || "VaultLedger";
    doc.setFontSize(16);
    doc.text(`${bizName} — Cashbook Report`, 14, 15);
    doc.setFontSize(10);
    doc.text(`Generated: ${format(new Date(), "dd MMM yyyy, HH:mm")}`, 14, 22);
    if (dateFilter) doc.text(`Date: ${dateFilter}`, 14, 28);

    const allEntries = Object.values(grouped).flat();
    let totalIn = 0, totalOut = 0;

    autoTable(doc, {
      head: [["Date", "Time", "Party", "Payment", "Type", "IN", "OUT"]],
      body: allEntries.map((e) => {
        const amt = e.amount;
        if (e.type === "credit") totalIn += amt;
        else totalOut += amt;
        return [
          format(new Date(e.transaction_date), "dd MMM yyyy"),
          format(new Date(e.transaction_date), "HH:mm"),
          e.account_name || "—",
          e.payment_method?.toUpperCase() || "—",
          e.type.toUpperCase(),
          e.type === "credit" ? `Rs ${amt.toFixed(2)}` : "—",
          e.type === "debit" ? `Rs ${amt.toFixed(2)}` : "—",
        ];
      }),
      startY: 35,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [41, 128, 185] },
    });

    const finalY = (doc as any).lastAutoTable.finalY || 40;
    doc.text(`Total IN:  Rs ${totalIn.toFixed(2)}`, 14, finalY + 10);
    doc.text(`Total OUT: Rs ${totalOut.toFixed(2)}`, 14, finalY + 16);
    doc.text(`Net:       Rs ${(totalIn - totalOut).toFixed(2)}`, 14, finalY + 22);
    doc.save(`cashbook-${dateFilter || "all"}-${Date.now()}.pdf`);
  };

  if (!activeBusiness) {
    return <div className="p-8 text-center text-muted-foreground">Select a business first.</div>;
  }

  const dateGroups = Object.entries(grouped);

  if (featureLocked("has_cashbook")) {
    return <UpgradePrompt open reason="use Cashbook" limitType="feature" onClose={() => history.back()} />;
  }

  return (
    <div className="space-y-4 animate-fade-in pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Cashbook</h1>
        <Button variant="outline" size="sm" onClick={exportPDF}>
          <FileText className="w-4 h-4 mr-1" /> View Report
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="glass-card p-4 text-center">
          <p className="text-xs text-muted-foreground mb-1">Total Balance</p>
          <p className={`text-xl font-bold font-mono ${totalBalance >= 0 ? "text-chart-credit" : "text-chart-debit"}`}>
            {fmt(Math.abs(totalBalance))}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{totalBalance >= 0 ? "surplus" : "deficit"}</p>
        </div>
        <div className="glass-card p-4 text-center">
          <p className="text-xs text-muted-foreground mb-1">Today's Balance</p>
          <p className={`text-xl font-bold font-mono ${todayBalance >= 0 ? "text-chart-credit" : "text-chart-debit"}`}>
            {fmt(Math.abs(todayBalance))}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{format(new Date(), "dd MMM yyyy")}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Input
          type="date"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          className="w-auto"
        />
        <Select value={paymentFilter} onValueChange={setPaymentFilter}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Modes</SelectItem>
            <SelectItem value="cash">Cash</SelectItem>
            <SelectItem value="bank">Bank</SelectItem>
            <SelectItem value="upi">UPI</SelectItem>
          </SelectContent>
        </Select>
        {dateFilter && (
          <Button variant="ghost" size="sm" onClick={() => setDateFilter("")} className="text-muted-foreground">
            Clear date
          </Button>
        )}
      </div>

      {/* Transaction groups */}
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
      ) : dateGroups.length === 0 ? (
        <div className="glass-card p-8 text-center text-muted-foreground">No transactions found.</div>
      ) : (
        <div className="space-y-4">
          {dateGroups.map(([dateLabel, entries]) => {
            const dayIn = entries.filter(e => e.type === "credit").reduce((s, e) => s + e.amount, 0);
            const dayOut = entries.filter(e => e.type === "debit").reduce((s, e) => s + e.amount, 0);
            const isCurrentDay = isToday(parseISO(entries[0].transaction_date.split("T")[0]));
            return (
              <div key={dateLabel} className="glass-card overflow-hidden">
                {/* Date header */}
                <div className="flex items-center justify-between px-4 py-2.5 bg-muted/40 border-b border-border">
                  <span className="text-sm font-semibold">
                    {dateLabel}
                    {isCurrentDay && <span className="ml-2 text-xs text-primary font-normal">(TODAY)</span>}
                    <span className="ml-2 text-xs text-muted-foreground font-normal">{entries.length} {entries.length === 1 ? "entry" : "entries"}</span>
                  </span>
                  <div className="flex gap-3 text-xs">
                    {dayOut > 0 && <span className="text-chart-debit font-mono">OUT {fmt(dayOut)}</span>}
                    {dayIn > 0 && <span className="text-chart-credit font-mono">IN {fmt(dayIn)}</span>}
                  </div>
                </div>

                {/* Column headers */}
                <div className="grid grid-cols-[60px_1fr_90px_90px] gap-1 px-4 py-1.5 border-b border-border/50">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase">TIME</span>
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase">PARTY / NOTES</span>
                  <span className="text-[10px] font-semibold text-chart-debit uppercase text-right">OUT</span>
                  <span className="text-[10px] font-semibold text-chart-credit uppercase text-right">IN</span>
                </div>

                {/* Entries */}
                <div className="divide-y divide-border/40">
                  {entries.map((entry) => (
                    <div key={entry.id} className="grid grid-cols-[60px_1fr_90px_90px] gap-1 px-4 py-2.5 items-center hover:bg-muted/20 transition-colors">
                      <div>
                        <p className="text-xs text-muted-foreground">{format(new Date(entry.transaction_date), "HH:mm")}</p>
                        {entry.payment_method && (
                          <span className="text-[9px] bg-muted text-muted-foreground px-1 py-0.5 rounded mt-0.5 inline-block uppercase">
                            {entry.payment_method}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        {entry.account_name && <p className="text-sm font-medium truncate">{entry.account_name}</p>}
                        {entry.notes && <p className="text-xs text-muted-foreground truncate">{entry.notes}</p>}
                        {!entry.account_name && !entry.notes && <p className="text-xs text-muted-foreground">—</p>}
                      </div>
                      <div className="text-right">
                        {entry.type === "debit"
                          ? <span className="font-mono font-semibold text-sm text-chart-debit">{fmt(entry.amount)}</span>
                          : <span className="text-muted-foreground text-sm">—</span>
                        }
                      </div>
                      <div className="text-right">
                        {entry.type === "credit"
                          ? <span className="font-mono font-semibold text-sm text-chart-credit">{fmt(entry.amount)}</span>
                          : <span className="text-muted-foreground text-sm">—</span>
                        }
                      </div>
                    </div>
                  ))}
                </div>

                {/* Day summary */}
                <div className="flex justify-end gap-4 px-4 py-2 bg-muted/20 border-t border-border/50 text-xs font-semibold">
                  <span className="text-chart-debit">Total OUT: {fmt(dayOut)}</span>
                  <span className="text-chart-credit">Total IN: {fmt(dayIn)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Sticky bottom buttons */}
      <div className="fixed bottom-0 left-0 right-0 lg:left-64 z-30 bg-background/95 backdrop-blur border-t border-border p-3">
        <div className="grid grid-cols-2 gap-3 max-w-3xl mx-auto">
          <button
            onClick={() => { setForm(f => ({ ...f, transaction_date: format(new Date(), "yyyy-MM-dd") })); setQuickAddOpen("out"); }}
            className="flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm"
            style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", color: "#EF4444" }}
          >
            OUT ₹
          </button>
          <button
            onClick={() => { setForm(f => ({ ...f, transaction_date: format(new Date(), "yyyy-MM-dd") })); setQuickAddOpen("in"); }}
            className="flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm"
            style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.3)", color: "#10B981" }}
          >
            IN ₹
          </button>
        </div>
      </div>

      {/* Quick-add dialog */}
      <Dialog open={quickAddOpen !== null} onOpenChange={(open) => { if (!open) setQuickAddOpen(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{quickAddOpen === "in" ? "Record Cash In" : "Record Cash Out"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleQuickAdd} className="space-y-4">
            <div className="space-y-2">
              <Label>Amount (₹)</Label>
              <Input
                type="number" step="0.01" min="0" placeholder="0.00"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className="text-2xl font-bold h-14 text-center font-mono"
                required autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Payment Mode</Label>
                <Select value={form.payment_method} onValueChange={(v) => setForm({ ...form, payment_method: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="bank">Bank</SelectItem>
                    <SelectItem value="upi">UPI</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={form.transaction_date} onChange={(e) => setForm({ ...form, transaction_date: e.target.value })} required />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Party <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Select value={form.account_id || "__none__"} onValueChange={(v) => setForm({ ...form, account_id: v === "__none__" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— No party —</SelectItem>
                  {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notes <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
            </div>
            <Button
              type="submit"
              className={`w-full font-semibold ${quickAddOpen === "in" ? "bg-chart-credit hover:bg-chart-credit/90" : "bg-chart-debit hover:bg-chart-debit/90"} text-white`}
            >
              {quickAddOpen === "in" ? "Add Cash In" : "Add Cash Out"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Cashbook;
