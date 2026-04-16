import { useState, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface RazorpayCheckoutProps {
  planId: string;
  planName: string;
  billingCycle: "monthly" | "yearly";
  finalAmountRupees: number;
  couponCode?: string;
  onSuccess: () => void;
  onDismiss?: () => void;
}

// Extend Window type for Razorpay global
declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open(): void };
  }
}

// Dynamically load Razorpay checkout.js (idempotent)
function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) { resolve(true); return; }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

const RazorpayCheckout = ({
  planId,
  planName,
  billingCycle,
  finalAmountRupees,
  couponCode,
  onSuccess,
  onDismiss,
}: RazorpayCheckoutProps) => {
  const { user, session } = useAuth();
  const [loading, setLoading] = useState(false);

  const handlePay = useCallback(async () => {
    if (!user || !session) { toast.error("Please log in first"); return; }

    setLoading(true);
    try {
      // ── 1. Load Razorpay script ───────────────────────────
      const loaded = await loadRazorpayScript();
      if (!loaded) {
        toast.error("Failed to load payment gateway. Check your internet connection.");
        return;
      }

      // ── 2. Create order via Edge Function ─────────────────
      const res = await fetch(`${SUPABASE_URL}/functions/v1/razorpay-create-order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
          "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
        },
        body: JSON.stringify({ plan_id: planId, billing_cycle: billingCycle, coupon_code: couponCode }),
      });

      const order = await res.json();
      if (!res.ok || order.error) {
        toast.error(order.error ?? "Could not initiate payment. Please try again.");
        return;
      }

      // ── 3. Fetch user profile for prefill ─────────────────
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", user.id)
        .single() as any;

      // ── 4. Open Razorpay modal ────────────────────────────
      const rzp = new window.Razorpay({
        key: order.key_id,
        amount: order.amount,      // in paise
        currency: order.currency,
        order_id: order.order_id,
        name: "VaultLedger",
        description: `${planName} — ${billingCycle === "yearly" ? "Yearly" : "Monthly"}`,
        image: "/logo.png",        // optional: your logo in /public
        prefill: {
          name: profile?.display_name ?? "",
          email: user.email ?? "",
        },
        theme: { color: "#6366f1" },
        modal: {
          ondismiss: () => {
            setLoading(false);
            onDismiss?.();
          },
        },
        handler: async (response: {
          razorpay_payment_id: string;
          razorpay_order_id: string;
          razorpay_signature: string;
        }) => {
          // ── 5. Verify payment server-side ─────────────────
          try {
            const verifyRes = await fetch(`${SUPABASE_URL}/functions/v1/razorpay-verify`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${session.access_token}`,
                "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
              },
              body: JSON.stringify({
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_order_id:   response.razorpay_order_id,
                razorpay_signature:  response.razorpay_signature,
                plan_id:             planId,
                billing_cycle:       billingCycle,
                amount_rupees:       finalAmountRupees,
                coupon_code:         couponCode,
              }),
            });

            const result = await verifyRes.json();
            if (!verifyRes.ok || result.error) {
              toast.error("Payment received but verification failed. Contact support with your payment ID: " + response.razorpay_payment_id);
            } else {
              toast.success(`Upgraded to ${planName}! Your plan is now active.`);
              onSuccess();
            }
          } catch {
            toast.error("Verification error. Contact support with payment ID: " + response.razorpay_payment_id);
          } finally {
            setLoading(false);
          }
        },
      });

      rzp.open();

    } catch (e) {
      console.error("RazorpayCheckout error:", e);
      toast.error("Something went wrong. Please try again.");
      setLoading(false);
    }
  }, [user, session, planId, billingCycle, finalAmountRupees, couponCode, planName, onSuccess, onDismiss]);

  return (
    <Button onClick={handlePay} disabled={loading} className="w-full">
      {loading ? (
        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing…</>
      ) : (
        <>Pay ₹{finalAmountRupees.toLocaleString("en-IN")} & Upgrade</>
      )}
    </Button>
  );
};

export default RazorpayCheckout;
