-- Task 26: Add opening_balance columns to accounts table
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS opening_balance DECIMAL(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opening_balance_type TEXT DEFAULT 'none'
    CHECK (opening_balance_type IN ('none','you_gave','you_got'));

-- opening_balance_type:
--   'none'     = no opening balance (default)
--   'you_gave' = business gave money to this party (they owe you back)
--   'you_got'  = business got money from this party (you owe them)
