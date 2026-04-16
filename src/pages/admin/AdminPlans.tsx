import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Pencil, Check, X } from "lucide-react";

interface Plan {
  id: string;
  name: string;
  description: string | null;
  price_monthly: number;
  price_yearly: number;
  currency: string;
  is_active: boolean;
  sort_order: number;
  features: Record<string, any>;
}

const FEATURE_LABELS: Record<string, string> = {
  max_businesses: "Max Businesses",
  max_accounts: "Max Accounts",
  max_transactions_per_month: "Max Transactions/Month",
  has_analytics: "Analytics",
  has_pdf_reports: "PDF Reports",
  has_cashbook: "Cashbook",
  has_expenses: "Expenses",
  has_data_export: "Data Export",
};

const AdminPlans = () => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchPlans = async () => {
    const { data } = await (supabase.from("plans" as any).select("*").order("sort_order") as any);
    setPlans(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchPlans(); }, []);

  const startEdit = (p: Plan) => setEditing(JSON.parse(JSON.stringify(p)));

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    const { error } = await (supabase.from("plans" as any).update({
      name: editing.name,
      description: editing.description,
      price_monthly: editing.price_monthly,
      price_yearly: editing.price_yearly,
      is_active: editing.is_active,
      features: editing.features,
    }).eq("id", editing.id) as any);
    if (error) { toast.error(error.message); }
    else { toast.success("Plan updated"); fetchPlans(); setEditing(null); }
    setSaving(false);
  };

  const setFeature = (key: string, value: any) => {
    if (!editing) return;
    setEditing({ ...editing, features: { ...editing.features, [key]: value } });
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Plans & Pricing</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage subscription plans and feature gates</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[1,2,3,4].map((i) => <div key={i} className="glass-card h-64 animate-pulse bg-muted/30 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {plans.map((p) => {
            const isEditingThis = editing?.id === p.id;
            const display = isEditingThis ? editing! : p;

            return (
              <div key={p.id} className={`glass-card p-5 space-y-4 ${!p.is_active ? "opacity-60" : ""}`}>
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div>
                    {isEditingThis ? (
                      <Input value={display.name} onChange={(e) => setEditing({ ...editing!, name: e.target.value })} className="h-7 text-base font-bold w-32" />
                    ) : (
                      <h2 className="text-lg font-bold capitalize">{p.name}</h2>
                    )}
                    <span className={`text-xs px-1.5 py-0.5 rounded ${p.is_active ? "bg-chart-credit/10 text-chart-credit" : "bg-muted text-muted-foreground"}`}>
                      {p.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  {isEditingThis ? (
                    <div className="flex gap-1">
                      <Button size="sm" className="h-7 px-2" onClick={handleSave} disabled={saving}><Check className="w-3.5 h-3.5" /></Button>
                      <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => setEditing(null)}><X className="w-3.5 h-3.5" /></Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => startEdit(p)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>

                {/* Pricing */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Monthly (₹)</p>
                    {isEditingThis ? (
                      <Input type="number" value={display.price_monthly} onChange={(e) => setEditing({ ...editing!, price_monthly: parseFloat(e.target.value) || 0 })} className="h-8" />
                    ) : (
                      <p className="font-mono font-bold text-lg">₹{p.price_monthly.toLocaleString("en-IN")}</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Yearly (₹)</p>
                    {isEditingThis ? (
                      <Input type="number" value={display.price_yearly} onChange={(e) => setEditing({ ...editing!, price_yearly: parseFloat(e.target.value) || 0 })} className="h-8" />
                    ) : (
                      <p className="font-mono font-bold text-lg">₹{p.price_yearly.toLocaleString("en-IN")}</p>
                    )}
                  </div>
                </div>

                {/* Features */}
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Features</p>
                  {Object.entries(FEATURE_LABELS).map(([key, label]) => {
                    const val = display.features[key];
                    const isBoolean = typeof val === "boolean" || val === null ? false : typeof (p.features[key]) === "boolean";
                    const isBool = typeof p.features[key] === "boolean";

                    return (
                      <div key={key} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{label}</span>
                        {isEditingThis ? (
                          isBool ? (
                            <button
                              type="button"
                              onClick={() => setFeature(key, !display.features[key])}
                              className={`text-xs px-2 py-0.5 rounded font-medium ${display.features[key] ? "bg-chart-credit/10 text-chart-credit" : "bg-muted text-muted-foreground"}`}
                            >
                              {display.features[key] ? "On" : "Off"}
                            </button>
                          ) : (
                            <Input
                              type="number"
                              placeholder="∞"
                              value={display.features[key] ?? ""}
                              onChange={(e) => setFeature(key, e.target.value === "" ? null : parseInt(e.target.value))}
                              className="h-6 w-20 text-xs text-right"
                            />
                          )
                        ) : (
                          <span className={`font-medium ${
                            typeof val === "boolean"
                              ? val ? "text-chart-credit" : "text-muted-foreground"
                              : "font-mono"
                          }`}>
                            {typeof val === "boolean" ? (val ? "✓" : "✗") : val === null ? "∞" : val}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Toggle active */}
                {isEditingThis && (
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      id={`active-${p.id}`}
                      checked={display.is_active}
                      onChange={(e) => setEditing({ ...editing!, is_active: e.target.checked })}
                      className="rounded"
                    />
                    <label htmlFor={`active-${p.id}`} className="text-sm cursor-pointer">Active (visible to users)</label>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AdminPlans;
