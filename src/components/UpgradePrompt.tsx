import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSubscription } from "@/hooks/useSubscription";
import RazorpayCheckout from "@/components/RazorpayCheckout";
import { Zap, Lock, ChevronDown, CheckCircle2 } from "lucide-react";

interface UpgradePromptProps {
  open: boolean;
  onClose: () => void;
  /** What the user was trying to do, e.g. "add more businesses" */
  reason: string;
  /** The feature gate that was hit, for contextual messaging */
  limitType?: "businesses" | "accounts" | "transactions" | "feature";
}

const PLAN_ORDER = ["free", "starter", "pro", "enterprise"];

const PLAN_PRICES: Record<string, { monthly: number; yearly: number; name: string }> = {
  starter:    { monthly: 299,  yearly: 2990,  name: "Starter" },
  pro:        { monthly: 699,  yearly: 6990,  name: "Pro" },
  enterprise: { monthly: 1499, yearly: 14990, name: "Enterprise" },
};

const PLAN_HIGHLIGHTS: Record<string, string[]> = {
  starter:    ["2 businesses", "100 accounts", "500 tx/month", "Analytics & Reports", "Cashbook"],
  pro:        ["5 businesses", "Unlimited accounts", "Unlimited transactions", "All features", "Data export"],
  enterprise: ["Unlimited businesses", "Unlimited everything", "Priority support"],
};

const UpgradePrompt = ({ open, onClose, reason, limitType }: UpgradePromptProps) => {
  const { plan, refetch } = useSubscription();
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  const [couponOpen, setCouponOpen] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [paid, setPaid] = useState(false);

  const nextPlanId = plan
    ? PLAN_ORDER[PLAN_ORDER.indexOf(plan.id) + 1]
    : "starter";

  const nextPlan = nextPlanId ? PLAN_PRICES[nextPlanId] : null;
  const amount = nextPlan
    ? (billing === "yearly" ? nextPlan.yearly : nextPlan.monthly)
    : 0;
  const yearlyDiscount = nextPlan
    ? Math.round(((nextPlan.monthly * 12 - nextPlan.yearly) / (nextPlan.monthly * 12)) * 100)
    : 0;

  const handleSuccess = () => {
    setPaid(true);
    refetch();
    setTimeout(() => {
      setPaid(false);
      onClose();
    }, 2500);
  };

  const handleClose = () => {
    setPaid(false);
    setCouponCode("");
    setCouponOpen(false);
    onClose();
  };

  // ── Success state ─────────────────────────────────────────
  if (paid) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-sm text-center">
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="w-14 h-14 rounded-full bg-chart-credit/10 flex items-center justify-center">
              <CheckCircle2 className="w-7 h-7 text-chart-credit" />
            </div>
            <h3 className="text-lg font-semibold">Plan Upgraded!</h3>
            <p className="text-sm text-muted-foreground">
              You're now on the <span className="font-semibold text-foreground">{nextPlan?.name}</span> plan.
              Enjoy your new features.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center">
              <Lock className="w-4 h-4 text-amber-500" />
            </div>
            Plan Limit Reached
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          <p className="text-sm text-muted-foreground">
            Your <span className="font-semibold text-foreground">{plan?.name ?? "Free"}</span> plan
            doesn't allow you to {reason}.
          </p>

          {limitType === "transactions" && (
            <div className="bg-muted/40 rounded-lg p-3 text-xs text-muted-foreground">
              You've used all your transactions for this month. Limit resets on the 1st.
            </div>
          )}

          {nextPlan && (
            <div className="border border-amber-500/20 bg-amber-500/5 rounded-lg p-4 space-y-3">
              {/* Plan header */}
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500 shrink-0" />
                <span className="text-sm font-semibold">Upgrade to {nextPlan.name}</span>
              </div>

              {/* Highlights */}
              <ul className="space-y-1">
                {PLAN_HIGHLIGHTS[nextPlanId]?.map((f) => (
                  <li key={f} className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-amber-500 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>

              {/* Billing toggle */}
              <div className="flex items-center gap-1 bg-background/60 rounded-lg p-0.5 w-full">
                {(["monthly", "yearly"] as const).map((cycle) => (
                  <button
                    key={cycle}
                    onClick={() => setBilling(cycle)}
                    className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-colors ${
                      billing === cycle
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {cycle === "monthly" ? "Monthly" : (
                      <span className="flex items-center justify-center gap-1">
                        Yearly
                        <span className="bg-chart-credit/15 text-chart-credit text-[10px] px-1 rounded">
                          -{yearlyDiscount}%
                        </span>
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Price */}
              <div className="text-center">
                <span className="text-2xl font-bold">₹{amount.toLocaleString("en-IN")}</span>
                <span className="text-xs text-muted-foreground ml-1">
                  {billing === "yearly" ? "/year" : "/month"}
                </span>
                {billing === "yearly" && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    ₹{Math.round(nextPlan.yearly / 12).toLocaleString("en-IN")}/mo · save ₹{(nextPlan.monthly * 12 - nextPlan.yearly).toLocaleString("en-IN")}
                  </p>
                )}
              </div>

              {/* Coupon */}
              <div>
                <button
                  onClick={() => setCouponOpen((p) => !p)}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                >
                  <ChevronDown className={`w-3 h-3 transition-transform ${couponOpen ? "rotate-180" : ""}`} />
                  Have a coupon code?
                </button>
                {couponOpen && (
                  <Input
                    className="mt-2 h-8 text-xs uppercase placeholder:normal-case"
                    placeholder="Enter coupon code"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                  />
                )}
              </div>

              {/* Pay button */}
              <RazorpayCheckout
                planId={nextPlanId}
                planName={nextPlan.name}
                billingCycle={billing}
                finalAmountRupees={amount}
                couponCode={couponCode || undefined}
                onSuccess={handleSuccess}
                onDismiss={() => {}}
              />
            </div>
          )}

          <Button variant="outline" className="w-full" onClick={handleClose}>
            Maybe Later
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default UpgradePrompt;
