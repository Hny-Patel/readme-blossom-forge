import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { useCrypto } from "@/hooks/useCrypto";
import { supabase } from "@/integrations/supabase/client";
import { decryptField, encryptField } from "@/lib/crypto";
import { deriveKEK, unwrapDEK, wrapDEK, fromBase64, toBase64 } from "@/lib/crypto";
import { logAudit } from "@/lib/audit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Building2, Plus, User, Trash2, Lock, Download } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";

const pwSchema = z.object({
  currentPassword: z.string().min(1, "Required"),
  newPassword: z.string().min(8, "Min 8 characters"),
  confirmPassword: z.string(),
}).refine((d) => d.newPassword === d.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});
type PwForm = z.infer<typeof pwSchema>;

const Settings = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { businesses, refetch } = useBusiness();
  const { lockVault, dek } = useCrypto();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: "", type: "other" });
  const [pwLoading, setPwLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

  const { register, handleSubmit, formState: { errors }, reset } = useForm<PwForm>({
    resolver: zodResolver(pwSchema),
  });

  const handleCreateBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const payload: Record<string, any> = { ...form, user_id: user.id };
    if (dek) {
      const { ciphertext: name_enc, iv: name_iv } = await encryptField(form.name, dek);
      payload.name_enc = name_enc;
      payload.name_iv = name_iv;
    }
    const { error } = await supabase.from("businesses").insert(payload as any);
    if (error) { toast.error(error.message); return; }
    toast.success("Business created");
    setDialogOpen(false);
    setForm({ name: "", type: "other" });
    refetch();
  };

  const handleDeleteBusiness = async (id: string) => {
    if (businesses.length <= 1) { toast.error("Cannot delete your only business"); return; }
    const { error } = await supabase.from("businesses").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Business deleted");
    refetch();
  };

  // --- Change Master Password ---
  const handleChangePassword = async (data: PwForm) => {
    if (!user?.email) return;
    setPwLoading(true);
    try {
      // 1. Re-authenticate
      const { error: authErr } = await supabase.auth.signInWithPassword({
        email: user.email, password: data.currentPassword,
      });
      if (authErr) { toast.error("Current password is incorrect"); setPwLoading(false); return; }

      // 2. Fetch key row
      const { data: keyRow } = await supabase.from("user_keys").select("*").eq("user_id", user.id).single();
      if (!keyRow) { toast.error("Vault key not found"); setPwLoading(false); return; }

      // 3. Unwrap DEK with old password
      const oldSalt = fromBase64(keyRow.pbkdf2_salt);
      const oldIv = fromBase64(keyRow.dek_iv);
      const oldWrapped = fromBase64(keyRow.encrypted_dek);
      const oldKek = await deriveKEK(data.currentPassword, oldSalt);
      const existingDek = await unwrapDEK(
        oldWrapped.buffer.slice(oldWrapped.byteOffset, oldWrapped.byteOffset + oldWrapped.byteLength) as ArrayBuffer,
        oldKek, oldIv
      );

      // 4. Re-wrap DEK with new password
      const newSalt = crypto.getRandomValues(new Uint8Array(16));
      const newIv = crypto.getRandomValues(new Uint8Array(12));
      const newKek = await deriveKEK(data.newPassword, newSalt);
      const newWrapped = await wrapDEK(existingDek, newKek, newIv);

      // 5. Update user_keys
      await supabase.from("user_keys").update({
        encrypted_dek: toBase64(newWrapped),
        dek_iv: toBase64(newIv),
        pbkdf2_salt: toBase64(newSalt),
      }).eq("user_id", user.id);

      // 6. Update Supabase Auth password
      await supabase.auth.updateUser({ password: data.newPassword });

      toast.success("Password changed. Please log in again.");
      logAudit(user.id, "PASSWORD_CHANGE");
      reset();
      lockVault();
      await signOut();
      navigate("/login");
    } catch (err) {
      toast.error("Password change failed. Please try again.");
    }
    setPwLoading(false);
  };

  // --- Export All Data ---
  const handleExportData = async () => {
    if (!user) return;
    setExportLoading(true);
    try {
      const [bizRes, accRes, txRes, catRes] = await Promise.all([
        supabase.from("businesses").select("*"),
        supabase.from("accounts").select("*"),
        supabase.from("transactions").select("*").order("transaction_date", { ascending: false }),
        supabase.from("categories").select("*"),
      ]);

      // Decrypt everything
      const decryptRow = async (row: any, fields: string[]) => {
        const out = { ...row };
        for (const f of fields) {
          if (row[`${f}_enc`] && row[`${f}_iv`] && dek) {
            try { out[f] = await decryptField(row[`${f}_enc`], row[`${f}_iv`], dek); } catch { /* keep plaintext */ }
          }
        }
        return out;
      };

      const businesses = await Promise.all((bizRes.data || []).map(r => decryptRow(r, ["name", "gstin", "address"])));
      const accounts = await Promise.all((accRes.data || []).map(r => decryptRow(r, ["name", "phone", "email", "notes"])));
      const transactions = await Promise.all((txRes.data || []).map(r => decryptRow(r, ["amount", "notes"])));
      const categories = catRes.data || [];

      const payload = {
        exportDate: format(new Date(), "yyyy-MM-dd'T'HH:mm:ss"),
        businesses,
        accounts,
        transactions,
        categories,
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `vaultledger-backup-${format(new Date(), "yyyy-MM-dd")}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      logAudit(user.id, "DATA_EXPORT");
      toast.success("Export downloaded");
    } catch {
      toast.error("Export failed");
    }
    setExportLoading(false);
  };

  return (
    <div className="space-y-8 animate-fade-in max-w-2xl">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Account */}
      <section className="glass-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <User className="w-5 h-5 text-primary" />
          <h2 className="font-semibold">Account</h2>
        </div>
        <div className="space-y-2">
          <Label className="text-muted-foreground">Email</Label>
          <p className="text-sm">{user?.email}</p>
        </div>
        <Button variant="destructive" size="sm" onClick={signOut}>Sign Out</Button>
      </section>

      {/* Businesses */}
      <section className="glass-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-primary" />
            <h2 className="font-semibold">Businesses</h2>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline"><Plus className="w-4 h-4 mr-1" /> Add</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New Business</DialogTitle></DialogHeader>
              <form onSubmit={handleCreateBusiness} className="space-y-4">
                <div className="space-y-2">
                  <Label>Business Name</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="retail">Retail</SelectItem>
                      <SelectItem value="wholesale">Wholesale</SelectItem>
                      <SelectItem value="service">Service</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="w-full">Create Business</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
        <div className="space-y-2">
          {businesses.map((b) => (
            <div key={b.id} className="flex items-center justify-between p-3 rounded-md bg-muted/30">
              <div>
                <p className="text-sm font-medium">{b.name}</p>
                <p className="text-xs text-muted-foreground capitalize">{b.type || "other"}</p>
              </div>
              <button onClick={() => handleDeleteBusiness(b.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Change Master Password */}
      <section className="glass-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Lock className="w-5 h-5 text-primary" />
          <h2 className="font-semibold">Change Master Password</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Changing your password re-wraps your vault key. You will be signed out and must log in again.
        </p>
        <form onSubmit={handleSubmit(handleChangePassword)} className="space-y-3">
          <div className="space-y-2">
            <Label>Current Password</Label>
            <Input type="password" {...register("currentPassword")} />
            {errors.currentPassword && <p className="text-xs text-destructive">{errors.currentPassword.message}</p>}
          </div>
          <div className="space-y-2">
            <Label>New Password</Label>
            <Input type="password" {...register("newPassword")} />
            {errors.newPassword && <p className="text-xs text-destructive">{errors.newPassword.message}</p>}
          </div>
          <div className="space-y-2">
            <Label>Confirm New Password</Label>
            <Input type="password" {...register("confirmPassword")} />
            {errors.confirmPassword && <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>}
          </div>
          <Button type="submit" variant="outline" disabled={pwLoading}>
            {pwLoading ? "Updating..." : "Change Password"}
          </Button>
        </form>
      </section>

      {/* Export Data */}
      <section className="glass-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Download className="w-5 h-5 text-primary" />
          <h2 className="font-semibold">Export All Data</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Downloads all your businesses, accounts, transactions, and categories as a JSON backup file. All encrypted fields are decrypted in the export.
        </p>
        <Button variant="outline" onClick={handleExportData} disabled={exportLoading}>
          <Download className="w-4 h-4 mr-2" />
          {exportLoading ? "Exporting..." : "Export All My Data"}
        </Button>
      </section>
    </div>
  );
};

export default Settings;
