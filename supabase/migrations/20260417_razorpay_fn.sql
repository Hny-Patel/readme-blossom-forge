-- ============================================================
-- Razorpay payment processing function
-- Called by razorpay-verify and razorpay-webhook Edge Functions
-- SECURITY DEFINER so it bypasses RLS (service role pattern)
-- ============================================================

CREATE OR REPLACE FUNCTION public.process_razorpay_payment(
  p_user_id            UUID,
  p_plan_id            TEXT,
  p_billing_cycle      TEXT,
  p_amount             DECIMAL(10,2),
  p_gateway_payment_id TEXT,
  p_gateway_order_id   TEXT,
  p_coupon_code        TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subscription_id UUID;
  v_invoice_number  TEXT;
  v_end_date        TIMESTAMPTZ;
  v_payment_id      UUID;
BEGIN
  -- ── Idempotency guard ─────────────────────────────────────
  -- If this order was already processed (e.g. webhook fires after verify)
  -- return the existing result without creating a duplicate payment.
  SELECT id INTO v_payment_id
  FROM public.payments
  WHERE gateway_order_id = p_gateway_order_id
    AND status = 'paid';

  IF v_payment_id IS NOT NULL THEN
    SELECT subscription_id INTO v_subscription_id
    FROM public.payments WHERE id = v_payment_id;
    RETURN jsonb_build_object(
      'success',         true,
      'idempotent',      true,
      'payment_id',      v_payment_id,
      'subscription_id', v_subscription_id
    );
  END IF;

  -- ── Calculate subscription end date ───────────────────────
  v_end_date := CASE p_billing_cycle
    WHEN 'yearly'   THEN NOW() + INTERVAL '1 year'
    WHEN 'monthly'  THEN NOW() + INTERVAL '1 month'
    ELSE                 NOW() + INTERVAL '1 month'
  END;

  -- ── Upsert subscription ───────────────────────────────────
  -- Find the user's most recent subscription row and update it.
  -- This keeps the single-row assumption in useSubscription hook intact.
  SELECT id INTO v_subscription_id
  FROM public.subscriptions
  WHERE user_id = p_user_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_subscription_id IS NOT NULL THEN
    UPDATE public.subscriptions SET
      plan_id                 = p_plan_id,
      status                  = 'active',
      billing_cycle           = p_billing_cycle,
      start_date              = NOW(),
      end_date                = v_end_date,
      gateway                 = 'razorpay',
      gateway_subscription_id = p_gateway_order_id,
      updated_at              = NOW()
    WHERE id = v_subscription_id;
  ELSE
    INSERT INTO public.subscriptions
      (user_id, plan_id, status, billing_cycle,
       start_date, end_date, gateway, gateway_subscription_id)
    VALUES
      (p_user_id, p_plan_id, 'active', p_billing_cycle,
       NOW(), v_end_date, 'razorpay', p_gateway_order_id)
    RETURNING id INTO v_subscription_id;
  END IF;

  -- ── Create payment record ─────────────────────────────────
  v_invoice_number := public.next_invoice_number();

  INSERT INTO public.payments
    (user_id, subscription_id, invoice_number, amount, currency,
     status, payment_method, payment_date,
     gateway_payment_id, gateway_order_id)
  VALUES
    (p_user_id, v_subscription_id, v_invoice_number, p_amount, 'INR',
     'paid', 'razorpay', NOW(),
     p_gateway_payment_id, p_gateway_order_id)
  RETURNING id INTO v_payment_id;

  -- ── Increment coupon used_count ───────────────────────────
  IF p_coupon_code IS NOT NULL AND p_coupon_code <> '' THEN
    UPDATE public.coupons
    SET used_count = used_count + 1
    WHERE code = UPPER(TRIM(p_coupon_code));
  END IF;

  RETURN jsonb_build_object(
    'success',         true,
    'idempotent',      false,
    'subscription_id', v_subscription_id,
    'payment_id',      v_payment_id,
    'invoice_number',  v_invoice_number,
    'end_date',        v_end_date,
    'plan_id',         p_plan_id
  );
END;
$$;

-- Allow Edge Functions (service role) to call this function
GRANT EXECUTE ON FUNCTION public.process_razorpay_payment TO service_role;
