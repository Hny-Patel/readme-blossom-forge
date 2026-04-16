import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    // ── 1. Authenticate caller ────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return err(401, "Missing Authorization header");

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authErr } = await supabaseUser.auth.getUser();
    if (authErr || !user) return err(401, "Unauthorized");

    // ── 2. Parse body ─────────────────────────────────────────
    const { plan_id, billing_cycle, coupon_code } = await req.json() as {
      plan_id: string;
      billing_cycle: "monthly" | "yearly";
      coupon_code?: string;
    };

    if (!plan_id || !billing_cycle) return err(400, "plan_id and billing_cycle are required");
    if (!["monthly", "yearly"].includes(billing_cycle)) return err(400, "Invalid billing_cycle");

    // ── 3. Fetch plan ─────────────────────────────────────────
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: plan, error: planErr } = await admin
      .from("plans")
      .select("id, name, price_monthly, price_yearly")
      .eq("id", plan_id)
      .eq("is_active", true)
      .single();

    if (planErr || !plan) return err(400, "Plan not found or inactive");
    if (plan.id === "free") return err(400, "Cannot purchase free plan");

    let baseAmount = billing_cycle === "yearly"
      ? Number(plan.price_yearly)
      : Number(plan.price_monthly);

    // ── 4. Validate coupon ────────────────────────────────────
    let discountAmount = 0;
    const code = coupon_code?.toUpperCase().trim();

    if (code) {
      const { data: coupon } = await admin
        .from("coupons")
        .select("id, discount_type, discount_value, max_uses, used_count, applicable_plans, expires_at, is_active")
        .eq("code", code)
        .single();

      if (!coupon || !coupon.is_active) return err(400, "Invalid or inactive coupon");
      if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) return err(400, "Coupon has expired");
      if (coupon.max_uses !== null && coupon.used_count >= coupon.max_uses) return err(400, "Coupon usage limit reached");
      if (coupon.applicable_plans?.length && !coupon.applicable_plans.includes(plan_id)) {
        return err(400, `Coupon is not valid for the ${plan_id} plan`);
      }

      discountAmount = coupon.discount_type === "percentage"
        ? (baseAmount * coupon.discount_value) / 100
        : coupon.discount_value;
      discountAmount = Math.min(discountAmount, baseAmount);
    }

    const finalAmount = baseAmount - discountAmount;
    const amountPaise = Math.round(finalAmount * 100);

    if (amountPaise < 100) return err(400, "Amount after discount is below minimum (₹1)");

    // ── 5. Create Razorpay order ──────────────────────────────
    const keyId = Deno.env.get("RAZORPAY_KEY_ID")!;
    const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET")!;
    const auth = btoa(`${keyId}:${keySecret}`);
    const receipt = `vl_${user.id.slice(0, 8)}_${Date.now()}`.slice(0, 40);

    const rzpRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${auth}`,
      },
      body: JSON.stringify({
        amount: amountPaise,
        currency: "INR",
        receipt,
        notes: { user_id: user.id, plan_id, billing_cycle, coupon_code: code ?? "" },
      }),
    });

    if (!rzpRes.ok) {
      const e = await rzpRes.json();
      console.error("Razorpay order error:", e);
      return err(502, "Failed to create payment order. Please try again.");
    }

    const order = await rzpRes.json();

    return ok({
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: keyId,
      plan_id,
      plan_name: plan.name,
      billing_cycle,
      base_amount: baseAmount,
      discount_amount: discountAmount,
      final_amount: finalAmount,
    });

  } catch (e) {
    console.error("razorpay-create-order:", e);
    return err(500, "Internal server error");
  }
});

const ok = (data: unknown) =>
  new Response(JSON.stringify(data), { headers: { ...CORS, "Content-Type": "application/json" } });

const err = (status: number, message: string) =>
  new Response(JSON.stringify({ error: message }), { status, headers: { ...CORS, "Content-Type": "application/json" } });
