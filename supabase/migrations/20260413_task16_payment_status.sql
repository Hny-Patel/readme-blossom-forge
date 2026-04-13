-- Task 16: Add payment_status column (default 'paid' so existing rows are unaffected)

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS payment_status VARCHAR DEFAULT 'paid'
  CHECK (payment_status IN ('paid', 'pending', 'partial'));
