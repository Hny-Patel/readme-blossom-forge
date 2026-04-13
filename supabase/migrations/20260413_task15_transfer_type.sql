-- Task 15: Add transfer_to_account_id column + allow 'transfer' as type

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS transfer_to_account_id UUID REFERENCES public.accounts(id);

ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_type_check;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_type_check CHECK (type IN ('credit', 'debit', 'transfer'));
