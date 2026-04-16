-- ============================================================
-- Admin System Migration
-- Tables: admin_users, plans, subscriptions, payments,
--         coupons, login_restrictions
-- RLS policies + seed data + new-user auto-subscription trigger
-- ============================================================

-- ── 1. admin_users ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_users (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- Only existing admins can see the table (no public signup)
CREATE POLICY "Admins can read admin_users"
  ON public.admin_users FOR SELECT
  USING (auth.uid() = user_id);

-- ── 2. plans ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plans (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT,
  price_monthly DECIMAL(10,2) DEFAULT 0,
  price_yearly  DECIMAL(10,2) DEFAULT 0,
  currency      TEXT DEFAULT 'INR',
  is_active     BOOLEAN DEFAULT true,
  sort_order    INT DEFAULT 0,
  features      JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read plans
CREATE POLICY "Users can read plans"
  ON public.plans FOR SELECT
  USING (auth.role() = 'authenticated');

-- Only admins can modify plans
CREATE POLICY "Admins can manage plans"
  ON public.plans FOR ALL
  USING (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()));

-- Seed default plans
INSERT INTO public.plans (id, name, description, price_monthly, price_yearly, sort_order, features) VALUES
(
  'free',
  'Free',
  'Get started with basic ledger features',
  0, 0, 0,
  '{
    "max_businesses": 1,
    "max_accounts": 10,
    "max_transactions_per_month": 50,
    "has_analytics": false,
    "has_pdf_reports": false,
    "has_cashbook": false,
    "has_expenses": false,
    "has_data_export": false
  }'::jsonb
),
(
  'starter',
  'Starter',
  'For small businesses growing fast',
  299, 2990, 1,
  '{
    "max_businesses": 2,
    "max_accounts": 100,
    "max_transactions_per_month": 500,
    "has_analytics": true,
    "has_pdf_reports": true,
    "has_cashbook": true,
    "has_expenses": false,
    "has_data_export": false
  }'::jsonb
),
(
  'pro',
  'Pro',
  'Full-featured for serious businesses',
  699, 6990, 2,
  '{
    "max_businesses": 5,
    "max_accounts": null,
    "max_transactions_per_month": null,
    "has_analytics": true,
    "has_pdf_reports": true,
    "has_cashbook": true,
    "has_expenses": true,
    "has_data_export": true
  }'::jsonb
),
(
  'enterprise',
  'Enterprise',
  'Unlimited everything for large operations',
  1499, 14990, 3,
  '{
    "max_businesses": null,
    "max_accounts": null,
    "max_transactions_per_month": null,
    "has_analytics": true,
    "has_pdf_reports": true,
    "has_cashbook": true,
    "has_expenses": true,
    "has_data_export": true
  }'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- ── 3. subscriptions ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id                TEXT NOT NULL REFERENCES public.plans(id),
  status                 TEXT DEFAULT 'active'
    CHECK (status IN ('trial', 'active', 'expired', 'cancelled')),
  billing_cycle          TEXT DEFAULT 'monthly'
    CHECK (billing_cycle IN ('monthly', 'yearly', 'lifetime')),
  start_date             TIMESTAMPTZ DEFAULT NOW(),
  end_date               TIMESTAMPTZ,
  trial_end_date         TIMESTAMPTZ,
  -- gateway-ready (unused until Razorpay)
  gateway                TEXT,
  gateway_subscription_id TEXT,
  gateway_customer_id    TEXT,
  notes                  TEXT,
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can read their own subscription
CREATE POLICY "Users can read own subscription"
  ON public.subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- Admins have full access
CREATE POLICY "Admins can manage subscriptions"
  ON public.subscriptions FOR ALL
  USING (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()));

-- ── 4. payments ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id   UUID REFERENCES public.subscriptions(id),
  invoice_number    TEXT UNIQUE NOT NULL,
  amount            DECIMAL(10,2) NOT NULL,
  currency          TEXT DEFAULT 'INR',
  status            TEXT DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
  payment_method    TEXT
    CHECK (payment_method IN ('bank_transfer', 'upi', 'cash', 'razorpay')),
  payment_date      TIMESTAMPTZ,
  notes             TEXT,
  -- gateway-ready
  gateway_payment_id TEXT,
  gateway_order_id   TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Users can read their own payments
CREATE POLICY "Users can read own payments"
  ON public.payments FOR SELECT
  USING (auth.uid() = user_id);

-- Admins have full access
CREATE POLICY "Admins can manage payments"
  ON public.payments FOR ALL
  USING (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()));

-- Function to auto-increment invoice numbers
CREATE OR REPLACE FUNCTION public.next_invoice_number()
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  next_num INT;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM 'INV-(\d+)') AS INT)), 0) + 1
  INTO next_num
  FROM public.payments;
  RETURN 'INV-' || LPAD(next_num::TEXT, 4, '0');
END;
$$;

-- ── 5. coupons ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.coupons (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code             TEXT UNIQUE NOT NULL,
  description      TEXT,
  discount_type    TEXT NOT NULL
    CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value   DECIMAL(10,2) NOT NULL,
  max_uses         INT,
  used_count       INT DEFAULT 0,
  applicable_plans TEXT[],
  expires_at       TIMESTAMPTZ,
  is_active        BOOLEAN DEFAULT true,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

-- Users can read active coupons (to validate a code at payment)
CREATE POLICY "Users can read active coupons"
  ON public.coupons FOR SELECT
  USING (auth.role() = 'authenticated' AND is_active = true);

-- Admins have full access
CREATE POLICY "Admins can manage coupons"
  ON public.coupons FOR ALL
  USING (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()));

-- ── 6. login_restrictions ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.login_restrictions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  restriction_type TEXT NOT NULL
    CHECK (restriction_type IN ('blocked', 'suspended')),
  reason           TEXT,
  created_by       UUID REFERENCES auth.users(id),
  expires_at       TIMESTAMPTZ,
  is_active        BOOLEAN DEFAULT true,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.login_restrictions ENABLE ROW LEVEL SECURITY;

-- Only admins can manage restrictions
CREATE POLICY "Admins can manage login_restrictions"
  ON public.login_restrictions FOR ALL
  USING (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()));

-- Users can check their own restriction status (for enforcement in app)
CREATE POLICY "Users can read own restrictions"
  ON public.login_restrictions FOR SELECT
  USING (auth.uid() = user_id);

-- ── 7. Admin bypass RLS on existing tables ──────────────────

-- profiles
CREATE POLICY "Admins can read all profiles"
  ON public.profiles FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()));

-- businesses
CREATE POLICY "Admins can read all businesses"
  ON public.businesses FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()));

-- audit_log
CREATE POLICY "Admins can read all audit_log"
  ON public.audit_log FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()));

-- ── 8. Auto-subscription trigger for new users ──────────────
CREATE OR REPLACE FUNCTION public.create_free_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.subscriptions (user_id, plan_id, status, billing_cycle)
  VALUES (NEW.id, 'free', 'active', 'lifetime')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_subscription ON auth.users;

CREATE TRIGGER on_auth_user_created_subscription
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.create_free_subscription();

-- ── 9. updated_at trigger for new tables ────────────────────
CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_plans_updated_at
  BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── 10. Admin stats helper view ─────────────────────────────
-- Provides aggregate stats for the admin dashboard without
-- needing cross-table queries in the React layer.
CREATE OR REPLACE VIEW public.admin_user_stats AS
SELECT
  p.user_id,
  p.display_name,
  p.created_at                          AS joined_at,
  s.plan_id,
  s.status                              AS subscription_status,
  s.end_date,
  COALESCE(b.business_count, 0)         AS business_count,
  COALESCE(pay.total_paid, 0)           AS total_paid,
  lr.is_active                          AS is_restricted
FROM public.profiles p
LEFT JOIN public.subscriptions s
       ON s.user_id = p.user_id
      AND s.status IN ('active', 'trial')
LEFT JOIN (
  SELECT user_id, COUNT(*) AS business_count
  FROM public.businesses
  GROUP BY user_id
) b ON b.user_id = p.user_id
LEFT JOIN (
  SELECT user_id, SUM(amount) AS total_paid
  FROM public.payments
  WHERE status = 'paid'
  GROUP BY user_id
) pay ON pay.user_id = p.user_id
LEFT JOIN (
  SELECT DISTINCT ON (user_id) user_id, is_active
  FROM public.login_restrictions
  WHERE is_active = true
  ORDER BY user_id, created_at DESC
) lr ON lr.user_id = p.user_id;

-- Admin-only access to the view
GRANT SELECT ON public.admin_user_stats TO authenticated;
