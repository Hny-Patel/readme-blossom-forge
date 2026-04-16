import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Razorpay calls this URL directly — no user JWT.
// We verify authenticity via X-Razorpay-Signature (HMAC-SHA256 of raw body).
// Always return 200 so Razorpay doesn't retry unnecessarily.

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const rawBody = await req.text();

  // ── 1. Verify webhook signature ───────────────────────────
  const webhookSig = req.headers.get("X-Razorpay-Signature");
  const webhookSecret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET");

  if (!webhookSig || !webhookSecret) {
    console.error("Missing webhook signature or secret");
    return new Response("ok", { status: 200 }); // return 200 to stop retries
  }

  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(webhookSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sigBytes = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(rawBody));
  const computedSig = Array.from(new Uint8Array(sigBytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (computedSig !== webhookSig) {
    console.error("Webhook signature mismatch");
    return new Response("ok", { status: 200 }); // still 200 — not a retry-worthy error
  }

  // ── 2. Parse event ────────────────────────────────────────
  let event: { event: string; payload: Record<string, unknown> };
  try {
    event = JSON.parse(rawBody);
  } catch {
    console.error("Invalid JSON in webhook body");
    return new Response("ok", { status: 200 });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // ── 3. Handle events ──────────────────────────────────────
  try {
    if (event.event === "payment.captured") {
      const payment = (event.payload as any).payment?.entity;
      if (!payment) { console.error("No payment entity in payload"); return new Response("ok"); }

      const notes = payment.notes ?? {};
      const userId = notes.user_id;
      const planId = notes.plan_id;
      const billingCycle = notes.billing_cycle;

      if (!userId || !planId || !billingCycle) {
        console.error("Missing notes on Razorpay payment:", notes);
        return new Response("ok", { status: 200 });
      }

      // Idempotent — process_razorpay_payment guards against double-processing
      const { error: rpcErr } = await admin.rpc("process_razorpay_payment", {
        p_user_id:            userId,
        p_plan_id:            planId,
        p_billing_cycle:      billingCycle,
        p_amount:             payment.amount / 100, // paise → rupees
        p_gateway_payment_id: payment.id,
        p_gateway_order_id:   payment.order_id,
        p_coupon_code:        notes.coupon_code || null,
      });

      if (rpcErr) console.error("process_razorpay_payment (webhook):", rpcErr);

    } else if (event.event === "payment.failed") {
      const payment = (event.payload as any).payment?.entity;
      if (payment?.order_id) {
        await admin
          .from("payments")
          .update({ status: "failed" })
          .eq("gateway_order_id", payment.order_id)
          .neq("status", "paid"); // don't downgrade a paid record
      }

    } else if (event.event === "refund.created") {
      const refund = (event.payload as any).refund?.entity;
      if (refund?.payment_id) {
        await admin
          .from("payments")
          .update({ status: "refunded" })
          .eq("gateway_payment_id", refund.payment_id);
      }
    }
  } catch (e) {
    // Log but still return 200 — we don't want Razorpay to spam retries
    console.error("Webhook handler error:", e);
  }

  return new Response("ok", { status: 200 });
});
