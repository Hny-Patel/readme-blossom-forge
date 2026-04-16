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
    const {
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      plan_id,
      billing_cycle,
      amount_rupees,
      coupon_code,
    } = await req.json() as {
      razorpay_payment_id: string;
      razorpay_order_id: string;
      razorpay_signature: string;
      plan_id: string;
      billing_cycle: string;
      amount_rupees: number;
      coupon_code?: string;
    };

    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return err(400, "Missing Razorpay payment fields");
    }

    // ── 3. Verify HMAC-SHA256 signature ───────────────────────
    // Razorpay signs: order_id + "|" + payment_id
    const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET")!;
    const encoder = new TextEncoder();

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      encoder.encode(keySecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const payload = `${razorpay_order_id}|${razorpay_payment_id}`;
    const sigBytes = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(payload));
    const computedSig = Array.from(new Uint8Array(sigBytes))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    if (computedSig !== razorpay_signature) {
      console.error("Signature mismatch", { computedSig, razorpay_signature });
      return err(400, "Payment signature verification failed");
    }

    // ── 4. Process payment atomically in DB ───────────────────
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: result, error: rpcErr } = await admin.rpc("process_razorpay_payment", {
      p_user_id:            user.id,
      p_plan_id:            plan_id,
      p_billing_cycle:      billing_cycle,
      p_amount:             amount_rupees,
      p_gateway_payment_id: razorpay_payment_id,
      p_gateway_order_id:   razorpay_order_id,
      p_coupon_code:        coupon_code ?? null,
    });

    if (rpcErr) {
      console.error("process_razorpay_payment error:", rpcErr);
      return err(500, "Failed to update subscription. Please contact support.");
    }

    return ok({ success: true, ...result });

  } catch (e) {
    console.error("razorpay-verify:", e);
    return err(500, "Internal server error");
  }
});

const ok = (data: unknown) =>
  new Response(JSON.stringify(data), { headers: { ...CORS, "Content-Type": "application/json" } });

const err = (status: number, message: string) =>
  new Response(JSON.stringify({ error: message }), { status, headers: { ...CORS, "Content-Type": "application/json" } });
