import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Copy } from "lucide-react";
import { format } from "date-fns";

interface Coupon {
  id: string;
  code: string;
  description: string | null;
  discount_type: string;
  discount_value: number;
  max_uses: number | null;
  used_count: number;
  applicable_plans: string[] | null;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

const EMPTY_FORM = {
  code: "",
  description: "",
  discount_type: "percentage",
  discount_value: "",
  max_uses: "",
  expires_at: "",
  is_active: true,
};

const AdminCoupons = () => {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const fetchCoupons = useCallback(async () => {
    const { data } = await (supabase.from("coupons" as any).select("*").order("created_at", { ascending: false }) as any);
    setCoupons(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchCoupons(); }, [fetchCoupons]);

  const openCreate = () => {
    setForm({ ...EMPTY_FORM });
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (c: Coupon) => {
    setForm({
      code: c.code,
      description: c.description || "",
      discount_type: c.discount_type,
      discount_value: String(c.discount_value),
      max_uses: c.max_uses ? String(c.max_uses) : "",
      expires_at: c.expires_at ? c.expires_at.split("T")[0] : "",
      is_active: c.is_active,
    });
    setEditing(c);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.code.trim() || !form.discount_value) { toast.error("Code and discount value are required"); return; }
    const payload: any = {
      code: form.code.toUpperCase().trim(),
      description: form.description || null,
      discount_type: form.discount_type,
      discount_value: parseFloat(form.discount_value),
      max_uses: form.max_uses ? parseInt(form.max_uses) : null,
      expires_at: form.expires_at || null,
      is_active: form.is_active,
    };

    if (editing) {
      const { error } = await (supabase.from("coupons" as any).update(payload).eq("id", editing.id) as any);
      if (error) { toast.error(error.message); return; }
      toast.success("Coupon updated");
    } else {
      const { error } = await (supabase.from("coupons" as any).insert(payload) as any);
      if (error) { toast.error(error.message); return; }
      toast.success("Coupon created");
    }
    setDialogOpen(false);
    fetchCoupons();
  };

  const handleDelete = async (c: Coupon) => {
    if (!confirm(`Delete coupon ${c.code}?`)) return;
    await (supabase.from("coupons" as any).delete().eq("id", c.id) as any);
    toast.success("Coupon deleted");
    fetchCoupons();
  };

  const toggleActive = async (c: Coupon) => {
    await (supabase.from("coupons" as any).update({ is_active: !c.is_active }).eq("id", c.id) as any);
    fetchCoupons();
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("Code copied!");
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Coupons</h1>
          <p className="text-sm text-muted-foreground mt-1">{coupons.length} coupons</p>
        </div>
        <Button size="sm" onClick={openCreate}><Plus className="w-4 h-4 mr-1" /> New Coupon</Button>
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 glass-card animate-pulse bg-muted/30" />)}</div>
      ) : coupons.length === 0 ? (
        <div className="glass-card p-12 text-center text-muted-foreground text-sm">No coupons yet. Create one to get started.</div>
      ) : (
        <div className="space-y-2">
          {coupons.map((c) => (
            <div key={c.id} className={`glass-card p-4 flex items-center gap-4 ${!c.is_active ? "opacity-60" : ""}`}>
              {/* Code + copy */}
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-mono font-bold text-primary text-sm bg-primary/10 px-2 py-0.5 rounded">{c.code}</span>
                <button onClick={() => copyCode(c.code)} className="text-muted-foreground hover:text-foreground transition-colors">
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Discount */}
              <div className="text-sm font-semibold text-chart-credit flex-shrink-0">
                {c.discount_type === "percentage" ? `${c.discount_value}% OFF` : `₹${c.discount_value} OFF`}
              </div>

              {/* Usage */}
              <div className="text-xs text-muted-foreground flex-shrink-0">
                {c.used_count} / {c.max_uses ?? "∞"} uses
              </div>

              {/* Expiry */}
              <div className="text-xs text-muted-foreground flex-shrink-0">
                {c.expires_at ? `Expires ${format(new Date(c.expires_at), "dd MMM yy")}` : "No expiry"}
              </div>

              {/* Description */}
              {c.description && (
                <div className="text-xs text-muted-foreground truncate flex-1">{c.description}</div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-1 ml-auto flex-shrink-0">
                <button
                  onClick={() => toggleActive(c)}
                  className={`text-xs px-2 py-0.5 rounded font-medium transition-colors ${c.is_active ? "bg-chart-credit/10 text-chart-credit hover:bg-chart-credit/20" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
                >
                  {c.is_active ? "Active" : "Inactive"}
                </button>
                <button onClick={() => openEdit(c)} className="p-1.5 hover:text-primary transition-colors">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => handleDelete(c)} className="p-1.5 hover:text-chart-debit transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editing ? "Edit Coupon" : "New Coupon"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Coupon Code</Label>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="SUMMER20" className="font-mono uppercase" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Description (optional)</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Summer sale discount" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Discount Type</Label>
                <Select value={form.discount_type} onValueChange={(v) => setForm({ ...form, discount_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage (%)</SelectItem>
                    <SelectItem value="fixed">Fixed (₹)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Discount Value</Label>
                <Input type="number" value={form.discount_value} onChange={(e) => setForm({ ...form, discount_value: e.target.value })} placeholder={form.discount_type === "percentage" ? "20" : "100"} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Max Uses (blank = unlimited)</Label>
                <Input type="number" value={form.max_uses} onChange={(e) => setForm({ ...form, max_uses: e.target.value })} placeholder="∞" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Expires At</Label>
                <Input type="date" value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="coupon-active" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="rounded" />
              <label htmlFor="coupon-active" className="text-sm cursor-pointer">Active</label>
            </div>
            <div className="flex gap-2 pt-1">
              <Button className="flex-1" onClick={handleSave}>{editing ? "Update" : "Create"}</Button>
              <Button variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminCoupons;
