-- Task 28: Expenses and expense_items tables

CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expense_number TEXT NOT NULL,
  expense_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  category_id UUID REFERENCES public.categories(id),
  amount_enc TEXT,
  amount_iv TEXT,
  amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  notes_enc TEXT,
  notes_iv TEXT,
  notes TEXT,
  line_items_enc TEXT,
  line_items_iv TEXT,
  payment_method TEXT DEFAULT 'cash'
    CHECK (payment_method IN ('cash','bank','upi')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own expenses"
  ON public.expenses FOR ALL USING (auth.uid() = user_id);

-- Reusable item catalog per user
CREATE TABLE IF NOT EXISTS public.expense_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price DECIMAL(15,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.expense_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own expense items"
  ON public.expense_items FOR ALL USING (auth.uid() = user_id);
