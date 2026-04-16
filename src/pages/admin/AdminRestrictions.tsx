import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, ShieldCheck, ShieldBan } from "lucide-react";
import { format } from "date-fns";

interface Restriction {
  id: string;
  user_id: string;
  restriction_type: string;
  reason: string | null;
  created_by: string | null;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
  profiles?: { display_name: string | null };
}

const AdminRestrictions = () => {
  const { user: adminUser } = useAuth();
  const [restrictions, setRestrictions] = useState<Restriction[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [form, setForm] = useState({
    user_id: "", restriction_type: "blocked", reason: "", expires_at: "",
  });

  const fetchRestrictions = useCallback(async () => {
    const { data } = await (supabase
      .from("login_restrictions" as any)
      .select("*, profiles(display_name)")
      .order("created_at", { ascending: false }) as any);
    setRestrictions(data || []);
    setLoading(false);
  }, []);

  const fetchUsers = useCallback(async () => {
    const { data } = await (supabase.from("profiles" as any).select("user_id, display_name").order("display_name") as any);
    setUsers(data || []);
  }, []);

  useEffect(() => { fetchRestrictions(); fetchUsers(); }, [fetchRestrictions, fetchUsers]);

  const handleCreate = async () => {
    if (!form.user_id) { toast.error("Select a user"); return; }
    const { error } = await (supabase.from("login_restrictions" as any).insert({
      user_id: form.user_id,
      restriction_type: form.restriction_type,
      reason: form.reason || null,
      created_by: adminUser?.id,
      expires_at: form.expires_at || null,
      is_active: true,
    }) as any);
    if (error) { toast.error(error.message); return; }
    toast.success("Restriction created");
    setDialogOpen(false);
    setForm({ user_id: "", restriction_type: "blocked", reason: "", expires_at: "" });
    fetchRestrictions();
  };

  const toggleActive = async (r: Restriction) => {
    await (supabase.from("login_restrictions" as any)
      .update({ is_active: !r.is_active })
      .eq("id", r.id) as any);
    toast.success(r.is_active ? "Restriction lifted" : "Restriction re-applied");
    fetchRestrictions();
  };

  const activeCount = restrictions.filter((r) => r.is_active).length;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Login Restrictions</h1>
          <p className="text-sm text-muted-foreground mt-1">{activeCount} active restriction{activeCount !== 1 ? "s" : ""}</p>
        </div>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-1" /> Add Restriction
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 glass-card animate-pulse bg-muted/30" />)}</div>
      ) : restrictions.length === 0 ? (
        <div className="glass-card p-12 text-center text-muted-foreground text-sm">No restrictions. All users have full access.</div>
      ) : (
        <div className="glass-card overflow-hidden">
          <div className="grid grid-cols-[1fr_80px_1fr_100px_80px_40px] gap-2 px-4 py-2 bg-muted/40 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b border-border">
            <span>User</span><span>Type</span><span>Reason</span><span>Expires</span><span>Status</span><span></span>
          </div>
          <div className="divide-y divide-border">
            {restrictions.map((r) => (
              <div key={r.id} className={`grid grid-cols-[1fr_80px_1fr_100px_80px_40px] gap-2 px-4 py-3 items-center text-sm ${!r.is_active ? "opacity-50" : ""}`}>
                <span className="truncate text-sm">{r.profiles?.display_name || r.user_id.slice(0, 12) + "..."}</span>
                <span className={`text-xs font-semibold capitalize ${r.restriction_type === "blocked" ? "text-chart-debit" : "text-amber-400"}`}>
                  {r.restriction_type}
                </span>
                <span className="text-xs text-muted-foreground truncate">{r.reason || "—"}</span>
                <span className="text-xs text-muted-foreground">
                  {r.expires_at ? format(new Date(r.expires_at), "dd MMM yy") : "Permanent"}
                </span>
                <span className={`text-xs font-semibold ${r.is_active ? "text-chart-debit" : "text-chart-credit"}`}>
                  {r.is_active ? "Active" : "Lifted"}
                </span>
                <button onClick={() => toggleActive(r)} className="p-1 hover:text-primary transition-colors" title={r.is_active ? "Lift restriction" : "Re-apply"}>
                  {r.is_active ? <ShieldCheck className="w-3.5 h-3.5 text-chart-credit" /> : <ShieldBan className="w-3.5 h-3.5 text-muted-foreground" />}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Login Restriction</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">User</Label>
              <Select value={form.user_id || "__none__"} onValueChange={(v) => setForm({ ...form, user_id: v === "__none__" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Select user" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Select user —</SelectItem>
                  {users.map((u: any) => (
                    <SelectItem key={u.user_id} value={u.user_id}>{u.display_name || u.user_id.slice(0,12)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Restriction Type</Label>
              <Select value={form.restriction_type} onValueChange={(v) => setForm({ ...form, restriction_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="blocked">Blocked (cannot log in)</SelectItem>
                  <SelectItem value="suspended">Suspended (read-only)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Reason (optional)</Label>
              <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Payment overdue, abuse, etc." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Expires At (leave blank = permanent)</Label>
              <Input type="date" value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} />
            </div>
            <div className="flex gap-2 pt-1">
              <Button className="flex-1 bg-chart-debit hover:bg-chart-debit/80" onClick={handleCreate}>Apply Restriction</Button>
              <Button variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminRestrictions;
