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
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { format } from "date-fns";
import { Plus, Search, Pencil, Trash2, ArrowLeft, ChevronDown, X } from "lucide-react";

/* ─── types ──────────────────────────────────────────────────────────── */
interface ExpenseItem { id: string; name: string; price: number; }
interface LineItem { itemId: string; name: string; price: number; qty: number; }
interface Expense {
  id: string; expense_number: string; expense_date: string;
  category_id: string | null; amount: number; notes: string | null;
  line_items: LineItem[]; payment_method: string;
  categories?: { name: string; color: string };
}

const EMPTY_FORM = {
  expense_number: "",
  expense_date: new Date().toISOString().split("T")[0],
  category_id: "",
  payment_method: "cash",
  notes: "",
};

/* ─── component ──────────────────────────────────────────────────────── */
const Expenses = () => {
  const { user } = useAuth();
  const { activeBusiness } = useBusiness();
  const { dek } = useCrypto();
  const { featureLocked, isOverLimit } = useSubscription();

  // Data
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [expenseItems, setExpenseItems] = useState<ExpenseItem[]>([]);
  const [loading, setLoading] = useState(true);

  // UI state
  const [activeTab, setActiveTab] = useState<"expenses" | "sales" | "purchase">("expenses");
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [selected, setSelected] = useState<Expense | null>(null);

  const [upgradeOpen, setUpgradeOpen] = useState(false);

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [panel, setPanel] = useState<"form" | "items">("form");

  // Item selector panel
  const [itemSearch, setItemSearch] = useState("");
  const [newItemName, setNewItemName] = useState("");
  const [newItemPrice, setNewItemPrice] = useState("");
  const [addingItem, setAddingItem] = useState(false);
  const [editingItem, setEditingItem] = useState<ExpenseItem | null>(null);
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);

  // Category inline add
  const [catSearch, setCatSearch] = useState("");
  const [catDropOpen, setCatDropOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [addingCat, setAddingCat] = useState(false);

  /* ── fetch ── */
  const fetchExpenses = useCallback(async () => {
    if (!activeBusiness || !dek) return;
    const { data } = await supabase
      .from("expenses" as any)
      .select("*, categories(name, color)")
      .eq("business_id", activeBusiness.id)
      .order("expense_date", { ascending: sortOrder === "asc" });

    const decrypted = await Promise.all((data || []).map(async (exp: any) => {
      let amount = Number(exp.amount);
      if (exp.amount_enc && exp.amount_iv && dek) {
        try { amount = parseFloat(await decryptField(exp.amount_enc, exp.amount_iv, dek)); } catch { /* fallback */ }
      }
      let notes = exp.notes as string | null;
      if (exp.notes_enc && exp.notes_iv && dek) {
        try { notes = await decryptField(exp.notes_enc, exp.notes_iv, dek); } catch { /* fallback */ }
      }
      let line_items: LineItem[] = [];
      if (exp.line_items_enc && exp.line_items_iv && dek) {
        try {
          const json = await decryptField(exp.line_items_enc, exp.line_items_iv, dek);
          line_items = JSON.parse(json);
        } catch { /* fallback */ }
      }
      return { ...exp, amount, notes, line_items, categories: exp.categories };
    }));

    setExpenses(decrypted);
    setLoading(false);
  }, [activeBusiness, dek, sortOrder]);

  const fetchCategories = useCallback(async () => {
    const { data } = await supabase.from("categories").select("id, name, color, type").order("name");
    setCategories(data || []);
  }, []);

  const fetchExpenseItems = useCallback(async () => {
    if (!user) return;
    const { data } = await (supabase.from("expense_items" as any).select("*").eq("user_id", user.id).order("name"));
    setExpenseItems((data || []) as unknown as ExpenseItem[]);
  }, [user]);

  useEffect(() => {
    if (activeBusiness && dek) {
      setLoading(true);
      Promise.all([fetchExpenses(), fetchCategories(), fetchExpenseItems()]);
    } else {
      setLoading(false);
    }
  }, [activeBusiness, dek, sortOrder]);

  /* ── derive next expense number ── */
  const getNextExpenseNumber = async () => {
    if (!user) return "SELF-1";
    const { count } = await (supabase.from("expenses" as any).select("id", { count: "exact", head: true }).eq("user_id", user.id));
    return `SELF-${(count || 0) + 1}`;
  };

  /* ── open create dialog ── */
  const openCreate = async () => {
    const num = await getNextExpenseNumber();
    setForm({ ...EMPTY_FORM, expense_number: num });
    setLineItems([]);
    setEditingExpense(null);
    setPanel("form");
    setDialogOpen(true);
  };

  /* ── open edit dialog ── */
  const openEdit = (exp: Expense) => {
    setForm({
      expense_number: exp.expense_number,
      expense_date: exp.expense_date.split("T")[0],
      category_id: exp.category_id || "",
      payment_method: exp.payment_method,
      notes: exp.notes || "",
    });
    setLineItems(exp.line_items || []);
    setEditingExpense(exp);
    setPanel("form");
    setDialogOpen(true);
  };

  /* ── save expense ── */
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !activeBusiness || !dek) return;
    if (!editingExpense && isOverLimit("transactions_this_month")) {
      setUpgradeOpen(true);
      return;
    }
    if (lineItems.length === 0) { toast.error("Add at least one item"); return; }

    const totalAmount = lineItems.reduce((s, i) => s + i.price * i.qty, 0);
    const lineItemsJson = JSON.stringify(lineItems);

    const { ciphertext: amount_enc, iv: amount_iv } = await encryptField(totalAmount.toString(), dek);
    const { ciphertext: li_enc, iv: li_iv } = await encryptField(lineItemsJson, dek);
    let notesEnc: Record<string, string> = {};
    if (form.notes) {
      const { ciphertext: notes_enc, iv: notes_iv } = await encryptField(form.notes, dek);
      notesEnc = { notes_enc, notes_iv };
    }

    const categoryName = categories.find((c) => c.id === form.category_id)?.name || "Expense";

    const payload = {
      business_id: activeBusiness.id,
      user_id: user.id,
      expense_number: form.expense_number,
      expense_date: form.expense_date,
      category_id: form.category_id || null,
      amount: totalAmount,
      amount_enc,
      amount_iv,
      ...notesEnc,
      notes: form.notes || null,
      line_items_enc: li_enc,
      line_items_iv: li_iv,
      payment_method: form.payment_method,
      updated_at: new Date().toISOString(),
    };

    if (editingExpense) {
      const { error } = await (supabase.from("expenses" as any).update(payload).eq("id", editingExpense.id));
      if (error) { toast.error(error.message); return; }
      toast.success("Expense updated");
    } else {
      const { data: insertedExp, error } = await (supabase.from("expenses" as any).insert(payload).select().single());
      if (error) { toast.error(error.message); return; }

      // Mirror to transactions table so it shows in Cashbook
      const { ciphertext: tx_amount_enc, iv: tx_amount_iv } = await encryptField(totalAmount.toString(), dek);
      let txNotesEnc: Record<string, string> = {};
      const txNotes = `Expense: ${categoryName} #${form.expense_number}`;
      const { ciphertext: tn_enc, iv: tn_iv } = await encryptField(txNotes, dek);
      txNotesEnc = { notes_enc: tn_enc, notes_iv: tn_iv };

      await (supabase.from("transactions") as any).insert({
        business_id: activeBusiness.id,
        user_id: user.id,
        type: "debit",
        amount: totalAmount,
        amount_enc: tx_amount_enc,
        amount_iv: tx_amount_iv,
        notes: txNotes,
        ...txNotesEnc,
        payment_method: form.payment_method,
        transaction_date: form.expense_date,
        category_id: form.category_id || null,
      });

      toast.success("Expense saved");
      if (insertedExp) setSelected({ ...insertedExp as any, amount: totalAmount, notes: form.notes || null, line_items: lineItems, categories: categories.find((c) => c.id === form.category_id) });
    }

    setDialogOpen(false);
    fetchExpenses();
  };

  /* ── delete expense ── */
  const handleDelete = async (exp: Expense) => {
    if (!confirm(`Delete expense ${exp.expense_number}?`)) return;
    await (supabase.from("expenses" as any).delete().eq("id", exp.id));
    toast.success("Expense deleted");
    if (selected?.id === exp.id) setSelected(null);
    fetchExpenses();
  };

  /* ── expense item CRUD ── */
  const saveNewItem = async () => {
    if (!user || !newItemName.trim()) return;
    await (supabase.from("expense_items" as any).insert({ user_id: user.id, name: newItemName.trim(), price: parseFloat(newItemPrice) || 0 }));
    setNewItemName(""); setNewItemPrice(""); setAddingItem(false);
    fetchExpenseItems();
  };

  const saveEditItem = async () => {
    if (!editingItem) return;
    await (supabase.from("expense_items" as any).update({ name: editingItem.name, price: editingItem.price }).eq("id", editingItem.id));
    setEditingItem(null);
    fetchExpenseItems();
  };

  const deleteItem = async (id: string) => {
    await (supabase.from("expense_items" as any).delete().eq("id", id));
    setLineItems((prev) => prev.filter((li) => li.itemId !== id));
    fetchExpenseItems();
  };

  const toggleLineItem = (item: ExpenseItem) => {
    setLineItems((prev) => {
      const exists = prev.find((li) => li.itemId === item.id);
      if (exists) return prev.filter((li) => li.itemId !== item.id);
      return [...prev, { itemId: item.id, name: item.name, price: item.price, qty: 1 }];
    });
  };

  const changeQty = (itemId: string, delta: number) => {
    setLineItems((prev) => prev.map((li) => {
      if (li.itemId !== itemId) return li;
      const next = li.qty + delta;
      return next <= 0 ? { ...li, qty: 1 } : { ...li, qty: next };
    }));
  };

  /* ── add category inline ── */
  const saveNewCategory = async () => {
    if (!user || !newCatName.trim()) return;
    const { data } = await supabase.from("categories").insert({ user_id: user.id, name: newCatName.trim(), type: "expense", color: "#8B5CF6" }).select().single();
    if (data) {
      await fetchCategories();
      setForm((f) => ({ ...f, category_id: data.id }));
    }
    setNewCatName(""); setAddingCat(false);
  };

  /* ── derived ── */
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const filtered = expenses.filter((e) => {
    const name = e.expense_number.toLowerCase();
    const cat = e.categories?.name?.toLowerCase() || "";
    const matchSearch = !search || name.includes(search.toLowerCase()) || cat.includes(search.toLowerCase());
    const matchCat = !filterCategory || e.category_id === filterCategory;
    return matchSearch && matchCat;
  });

  const selectedCat = categories.find((c) => c.id === form.category_id);
  const filteredCats = categories.filter((c) => c.name.toLowerCase().includes(catSearch.toLowerCase()));
  const filteredItems = expenseItems.filter((i) => i.name.toLowerCase().includes(itemSearch.toLowerCase()));
  const displayItems = showSelectedOnly ? filteredItems.filter((i) => lineItems.some((li) => li.itemId === i.id)) : filteredItems;
  const lineTotal = lineItems.reduce((s, i) => s + i.price * i.qty, 0);

  if (featureLocked("has_expenses")) {
    return <UpgradePrompt open reason="use Expenses" limitType="feature" onClose={() => history.back()} />;
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <UpgradePrompt open={upgradeOpen} onClose={() => setUpgradeOpen(false)} reason="add more expenses this month" limitType="transactions" />
      {/* Summary bar */}
      <div className="glass-card p-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-3">Transactions Summary</p>
        <div className="flex gap-4 flex-wrap">
          <div className="text-center px-4 py-2 rounded-lg bg-muted/40">
            <p className="text-xs text-muted-foreground">Sales</p>
            <p className="font-mono font-bold text-muted-foreground">₹0</p>
          </div>
          <div className="text-center px-4 py-2 rounded-lg bg-chart-debit/10 border border-chart-debit/20">
            <p className="text-xs text-chart-debit">Expenses</p>
            <p className="font-mono font-bold text-chart-debit">₹{totalExpenses.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
          </div>
          <div className="text-center px-4 py-2 rounded-lg bg-muted/40">
            <p className="text-xs text-muted-foreground">Purchases</p>
            <p className="font-mono font-bold text-muted-foreground">₹0</p>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-muted/30 p-1 rounded-lg w-fit">
        {(["expenses", "sales", "purchase"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${activeTab === tab ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            {tab === "expenses" ? `Expenses (${expenses.length})` : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {activeTab !== "expenses" ? (
        <div className="glass-card p-12 text-center text-muted-foreground">
          <p className="text-lg font-medium mb-1">{activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</p>
          <p className="text-sm">Coming soon</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">
          {/* Left panel — expense list */}
          <div className="glass-card flex flex-col">
            {/* Toolbar */}
            <div className="p-3 border-b border-border space-y-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                <Input placeholder="Search for Expense Items..." className="pl-8 h-8 text-sm" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <Select value={filterCategory || "__all__"} onValueChange={(v) => setFilterCategory(v === "__all__" ? "" : v)}>
                  <SelectTrigger className="flex-1 h-8 text-xs"><SelectValue placeholder="Select Filter" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Categories</SelectItem>
                    {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as "desc" | "asc")}>
                  <SelectTrigger className="flex-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="desc">Latest First</SelectItem>
                    <SelectItem value="asc">Oldest First</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-auto divide-y divide-border">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 m-3 rounded-lg" />)
              ) : filtered.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">No expenses found.</div>
              ) : (
                filtered.map((exp) => (
                  <button
                    key={exp.id}
                    onClick={() => setSelected(exp)}
                    className={`w-full text-left px-4 py-3 hover:bg-muted/30 transition-colors ${selected?.id === exp.id ? "bg-muted/40" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 min-w-0">
                        <div className="w-3 h-3 rounded-sm mt-1 flex-shrink-0" style={{ background: exp.categories?.color || "#8B5CF6" }} />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{exp.categories?.name || "Uncategorized"}</p>
                          <p className="text-xs text-muted-foreground">Expense #{exp.expense_number}</p>
                          <p className="text-xs text-muted-foreground">{format(new Date(exp.expense_date), "dd MMM yyyy")}</p>
                        </div>
                      </div>
                      <p className="text-sm font-mono font-bold text-chart-debit flex-shrink-0">
                        ₹{exp.amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>

            {/* Add button */}
            <div className="p-3 border-t border-border">
              <Button className="w-full" size="sm" onClick={openCreate}>
                <Plus className="w-4 h-4 mr-1" /> Add Expense
              </Button>
            </div>
          </div>

          {/* Right panel — detail */}
          <div className="glass-card flex flex-col">
            {!selected ? (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3 p-12">
                <div className="text-5xl">🧾</div>
                <p className="font-medium">No Expense Selected</p>
                <p className="text-sm text-center">Select an expense from the list or create a new one.</p>
              </div>
            ) : (
              <div className="p-6 space-y-5">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Category: {selected.categories?.name || "Uncategorized"}</p>
                    <h2 className="text-xl font-bold mt-0.5">
                      {selected.categories?.name || "Expense"} #{selected.expense_number}
                    </h2>
                    <p className="text-sm text-muted-foreground mt-0.5">{format(new Date(selected.expense_date), "dd MMM yyyy")}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEdit(selected)}>
                      <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
                    </Button>
                    <Button variant="outline" size="sm" className="text-chart-debit border-chart-debit/30 hover:bg-chart-debit/10" onClick={() => handleDelete(selected)}>
                      <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
                    </Button>
                  </div>
                </div>

                {/* Items */}
                {selected.line_items?.length > 0 && (
                  <div className="border border-border rounded-lg overflow-hidden">
                    <div className="grid grid-cols-[1fr_60px_100px] gap-2 px-4 py-2 bg-muted/40 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      <span>Item</span><span className="text-center">Qty</span><span className="text-right">Amount</span>
                    </div>
                    {selected.line_items.map((li, i) => (
                      <div key={i} className="grid grid-cols-[1fr_60px_100px] gap-2 px-4 py-2.5 border-t border-border items-center">
                        <span className="text-sm">{li.name}</span>
                        <span className="text-sm text-center text-muted-foreground">{li.qty}</span>
                        <span className="text-sm font-mono text-right">₹{(li.price * li.qty).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                      </div>
                    ))}
                    <div className="grid grid-cols-[1fr_60px_100px] gap-2 px-4 py-2.5 border-t border-border bg-muted/20">
                      <span className="text-sm font-semibold col-span-2">Total</span>
                      <span className="text-sm font-mono font-bold text-chart-debit text-right">
                        ₹{selected.amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                )}

                {selected.notes && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Notes</p>
                    <p className="text-sm">{selected.notes}</p>
                  </div>
                )}

                <div className="flex gap-4 text-sm text-muted-foreground">
                  <span>Payment: <span className="text-foreground font-medium uppercase">{selected.payment_method}</span></span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingExpense ? "Edit Expense" : "Create Expense"}</DialogTitle>
          </DialogHeader>

          {panel === "items" ? (
            /* ── Item selector panel ── */
            <div className="space-y-4">
              <button onClick={() => setPanel("form")} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                <ArrowLeft className="w-4 h-4" /> Back to expense
              </button>
              <div>
                <h3 className="font-semibold mb-1">Select Expense Items</h3>
                <p className="text-xs text-muted-foreground bg-info/10 border border-info/20 rounded px-3 py-2">
                  Expense items would not affect your inventory.
                </p>
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                <Input placeholder="Search for an expense item" className="pl-8" value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} />
              </div>

              {addingItem ? (
                <div className="border border-border rounded-lg p-3 space-y-2">
                  <Input placeholder="Expense Item Name" value={newItemName} onChange={(e) => setNewItemName(e.target.value)} autoFocus />
                  <Input type="number" placeholder="Price" value={newItemPrice} onChange={(e) => setNewItemPrice(e.target.value)} />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={saveNewItem} className="flex-1">Save</Button>
                    <Button size="sm" variant="outline" onClick={() => { setAddingItem(false); setNewItemName(""); setNewItemPrice(""); }}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setAddingItem(true)} className="flex items-center gap-2 text-sm text-primary hover:underline">
                  <Plus className="w-3.5 h-3.5" /> Add new expense item
                </button>
              )}

              <div className="space-y-1 max-h-52 overflow-y-auto">
                {displayItems.map((item) => {
                  const inList = lineItems.find((li) => li.itemId === item.id);
                  return editingItem?.id === item.id ? (
                    <div key={item.id} className="border border-primary/30 rounded-lg p-2 space-y-1">
                      <Input value={editingItem.name} onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })} className="h-8 text-sm" />
                      <Input type="number" value={editingItem.price} onChange={(e) => setEditingItem({ ...editingItem, price: parseFloat(e.target.value) || 0 })} className="h-8 text-sm" />
                      <div className="flex gap-1">
                        <Button size="sm" className="h-7 text-xs flex-1" onClick={saveEditItem}>Save</Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingItem(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <div
                      key={item.id}
                      onClick={() => toggleLineItem(item)}
                      className={`flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${inList ? "bg-chart-credit/10 border border-chart-credit/20" : "hover:bg-muted/30"}`}
                    >
                      <div>
                        <p className="text-sm font-medium">{item.name}</p>
                        <p className="text-xs text-muted-foreground">PRICE: ₹{Number(item.price).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
                      </div>
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        {inList && (
                          <div className="flex items-center gap-1.5 bg-muted rounded-md px-1 py-0.5">
                            <button onClick={() => changeQty(item.id, -1)} className="w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-foreground font-bold">−</button>
                            <span className="text-sm font-mono w-5 text-center">{inList.qty}</span>
                            <button onClick={() => changeQty(item.id, 1)} className="w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-foreground font-bold">+</button>
                          </div>
                        )}
                        <button onClick={() => setEditingItem(item)} className="p-1 text-muted-foreground hover:text-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={() => deleteItem(item.id)} className="p-1 text-muted-foreground hover:text-chart-debit"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={showSelectedOnly} onChange={(e) => setShowSelectedOnly(e.target.checked)} className="rounded" />
                Show selected items only
              </label>

              {/* Bottom bar */}
              <div className="border-t border-border pt-3 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {lineItems.length} item{lineItems.length !== 1 ? "s" : ""} · ₹{lineTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
                <Button onClick={() => setPanel("form")}>Continue →</Button>
              </div>
            </div>
          ) : (
            /* ── Main form panel ── */
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Expense Number</Label>
                  <Input value={form.expense_number} onChange={(e) => setForm({ ...form, expense_number: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label>Expense Date</Label>
                  <Input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} required />
                </div>
              </div>

              {/* Category section */}
              <div className="space-y-2">
                <Label>Expense Category</Label>
                <div className="border border-border rounded-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setCatDropOpen((v) => !v)}
                    className="w-full flex items-center justify-between px-3 py-2.5 text-sm hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      {selectedCat ? (
                        <>
                          <div className="w-3 h-3 rounded-sm" style={{ background: selectedCat.color }} />
                          <span>{selectedCat.name}</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">Select a category</span>
                      )}
                    </div>
                    <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${catDropOpen ? "rotate-180" : ""}`} />
                  </button>
                  {catDropOpen && (
                    <div className="border-t border-border p-2 space-y-1.5">
                      <Input
                        placeholder="Search for Category"
                        value={catSearch}
                        onChange={(e) => setCatSearch(e.target.value)}
                        className="h-7 text-sm"
                        autoFocus
                      />
                      {addingCat ? (
                        <div className="flex gap-2">
                          <Input placeholder="Category name" value={newCatName} onChange={(e) => setNewCatName(e.target.value)} className="h-7 text-sm flex-1" autoFocus />
                          <Button type="button" size="sm" className="h-7 text-xs" onClick={saveNewCategory}>Save</Button>
                          <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setAddingCat(false); setNewCatName(""); }}>
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      ) : (
                        <button type="button" onClick={() => setAddingCat(true)} className="flex items-center gap-1.5 text-xs text-primary hover:underline px-1">
                          <Plus className="w-3 h-3" /> Add New Category
                        </button>
                      )}
                      <div className="max-h-32 overflow-y-auto space-y-0.5">
                        {filteredCats.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => { setForm((f) => ({ ...f, category_id: c.id })); setCatDropOpen(false); setCatSearch(""); }}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-muted/30 text-left transition-colors ${form.category_id === c.id ? "bg-muted/40" : ""}`}
                          >
                            <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: c.color }} />
                            {c.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Line items */}
              <div className="space-y-2">
                <Label>Expense Item Details</Label>
                {lineItems.length > 0 ? (
                  <div className="border border-border rounded-lg overflow-hidden">
                    {lineItems.map((li) => (
                      <div key={li.itemId} className="flex items-center justify-between px-3 py-2 border-b border-border last:border-0 text-sm">
                        <span className="flex-1 truncate">{li.name}</span>
                        <span className="text-muted-foreground mx-3">{li.qty} × ₹{li.price.toLocaleString("en-IN")}</span>
                        <span className="font-mono font-semibold">₹{(li.price * li.qty).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                      </div>
                    ))}
                    <div className="px-3 py-2 bg-muted/30 flex items-center justify-between">
                      <button type="button" onClick={() => setPanel("items")} className="text-xs text-primary hover:underline flex items-center gap-1">
                        <Pencil className="w-3 h-3" /> Edit List
                      </button>
                      <span className="text-sm font-mono font-bold">₹{lineTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPanel("items")}
                    className="w-full border border-dashed border-border rounded-lg py-4 text-sm text-muted-foreground hover:bg-muted/20 transition-colors flex items-center justify-center gap-2"
                  >
                    <Plus className="w-4 h-4" /> Add Items
                  </button>
                )}
                {lineItems.length > 0 && (
                  <button type="button" onClick={() => setPanel("items")} className="text-xs text-primary hover:underline flex items-center gap-1">
                    <Plus className="w-3 h-3" /> Add More Items
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Payment Method</Label>
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
                  <Label>Amount Paid</Label>
                  <Input
                    type="number"
                    value={lineTotal || ""}
                    readOnly
                    className="bg-muted/30 text-muted-foreground"
                    placeholder="Auto-calculated"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Notes <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Any additional notes" />
              </div>

              <Button type="submit" className="w-full" disabled={lineItems.length === 0}>
                {editingExpense ? "Update Expense" : "Save Expense"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Expenses;
