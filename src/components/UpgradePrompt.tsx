import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useSubscription } from "@/hooks/useSubscription";
import { Zap, Lock } from "lucide-react";

interface UpgradePromptProps {
  open: boolean;
  onClose: () => void;
  /** What the user was trying to do, e.g. "add more businesses" */
  reason: string;
  /** The feature gate that was hit, for contextual messaging */
  limitType?: "businesses" | "accounts" | "transactions" | "feature";
}

const PLAN_ORDER = ["free", "starter", "pro", "enterprise"];

const UpgradePrompt = ({ open, onClose, reason, limitType }: UpgradePromptProps) => {
  const { plan } = useSubscription();

  const nextPlan = plan
    ? PLAN_ORDER[PLAN_ORDER.indexOf(plan.id) + 1]
    : "starter";

  const planLabels: Record<string, string> = {
    starter: "Starter — ₹299/mo",
    pro: "Pro — ₹699/mo",
    enterprise: "Enterprise — ₹1,499/mo",
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
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

          <div className="border border-amber-500/20 bg-amber-500/5 rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500" />
              <span className="text-sm font-semibold">
                Upgrade to {nextPlan ? planLabels[nextPlan] ?? nextPlan : "a higher plan"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Contact your administrator to upgrade your account.
            </p>
          </div>

          <Button variant="outline" className="w-full" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default UpgradePrompt;
