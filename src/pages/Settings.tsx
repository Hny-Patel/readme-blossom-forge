import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useBusiness } from "@/hooks/useBusiness";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Building2, Plus, User, Trash2 } from "lucide-react";

const Settings = () => {
  const { user, signOut } = useAuth();
  const { businesses, refetch } = useBusiness();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: "", type: "other" });

  const handleCreateBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const { error } = await supabase.from("businesses").insert({ ...form, user_id: user.id });
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

  return (
    <div className="space-y-8 animate-fade-in max-w-2xl">
      <h1 className="text-2xl font-bold">Settings</h1>

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
    </div>
  );
};

export default Settings;
