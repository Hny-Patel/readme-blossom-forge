import { useEffect, useState } from "react";
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
import { Plus, Users, Phone, Mail, Trash2, Search } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

interface Account {
  id: string;
  type: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
}

const Accounts = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeBusiness } = useBusiness();
  const { dek } = useCrypto();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: "", type: "customer", phone: "", email: "", notes: "" });

  const fetchAccounts = async () => {
    if (!activeBusiness) return;
    setLoading(true);
    const { data } = await supabase
      .from("accounts")
      .select("*")
      .eq("business_id", activeBusiness.id)
      .order("name");

    const decrypted: Account[] = await Promise.all(
      (data || []).map(async (row) => {
        let name = row.name;
        let phone = row.phone;
        let email = row.email;
        let notes = row.notes;

        if (dek) {
          if (row.name_enc && row.name_iv) {
            try { name = await decryptField(row.name_enc, row.name_iv, dek); } catch { /* fallback */ }
          }
          if (row.phone_enc && row.phone_iv) {
            try { phone = await decryptField(row.phone_enc, row.phone_iv, dek); } catch { /* fallback */ }
          }
          if (row.email_enc && row.email_iv) {
            try { email = await decryptField(row.email_enc, row.email_iv, dek); } catch { /* fallback */ }
          }
          if (row.notes_enc && row.notes_iv) {
            try { notes = await decryptField(row.notes_enc, row.notes_iv, dek); } catch { /* fallback */ }
          }
        }

        return { id: row.id, type: row.type, name, phone, email, notes };
      })
    );

    setAccounts(decrypted);
    setLoading(false);
  };

  useEffect(() => { fetchAccounts(); }, [activeBusiness, dek]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !activeBusiness) return;

    const payload: Record<string, string | null> = {
      user_id: user.id,
      business_id: activeBusiness.id,
      type: form.type,
      name: form.name,
      phone: form.phone || null,
      email: form.email || null,
      notes: form.notes || null,
    };

    if (dek) {
      const { ciphertext: name_enc, iv: name_iv } = await encryptField(form.name, dek);
      payload.name_enc = name_enc;
      payload.name_iv = name_iv;

      if (form.phone) {
        const { ciphertext: phone_enc, iv: phone_iv } = await encryptField(form.phone, dek);
        payload.phone_enc = phone_enc;
        payload.phone_iv = phone_iv;
      }
      if (form.email) {
        const { ciphertext: email_enc, iv: email_iv } = await encryptField(form.email, dek);
        payload.email_enc = email_enc;
        payload.email_iv = email_iv;
      }
      if (form.notes) {
        const { ciphertext: notes_enc, iv: notes_iv } = await encryptField(form.notes, dek);
        payload.notes_enc = notes_enc;
        payload.notes_iv = notes_iv;
      }
    }

    const { error } = await supabase.from("accounts").insert(payload as any);
    if (error) { toast.error(error.message); return; }
    toast.success("Account created");
    setForm({ name: "", type: "customer", phone: "", email: "", notes: "" });
    setDialogOpen(false);
    fetchAccounts();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("accounts").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Account deleted");
    fetchAccounts();
  };

  // Search works on decrypted names (already resolved in state)
  const filtered = accounts.filter((a) =>
    a.name.toLowerCase().includes(search.toLowerCase())
  );

  if (!activeBusiness) {
    return <div className="p-8 text-center text-muted-foreground">Select a business first.</div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Accounts</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-4 h-4 mr-1" /> Add Account</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Account</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="customer">Customer</SelectItem>
                    <SelectItem value="supplier">Supplier</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
              </div>
              <Button type="submit" className="w-full">Create Account</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search accounts..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-muted-foreground p-8">No accounts found.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((account) => (
            <div
              key={account.id}
              className="glass-card p-4 space-y-3 animate-slide-up cursor-pointer hover:border-primary/40 transition-colors"
              onClick={() => navigate(`/accounts/${account.id}`)}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <Users className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{account.name}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${account.type === "customer" ? "bg-chart-credit/10 text-chart-credit" : "bg-info/10 text-info"}`}>
                      {account.type}
                    </span>
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(account.id); }}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              {(account.phone || account.email) && (
                <div className="space-y-1 text-xs text-muted-foreground">
                  {account.phone && <div className="flex items-center gap-1"><Phone className="w-3 h-3" />{account.phone}</div>}
                  {account.email && <div className="flex items-center gap-1"><Mail className="w-3 h-3" />{account.email}</div>}
                </div>
              )}
              {account.notes && <p className="text-xs text-muted-foreground">{account.notes}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Accounts;
