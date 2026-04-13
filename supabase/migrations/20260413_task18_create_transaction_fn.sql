-- Task 18 Part A: Atomic transaction + journal entry as a single Postgres function

CREATE OR REPLACE FUNCTION public.create_transaction(
  p_user_id UUID,
  p_business_id UUID,
  p_account_id UUID,
  p_type TEXT,
  p_payment_method TEXT,
  p_amount DECIMAL,
  p_amount_enc TEXT,
  p_amount_iv TEXT,
  p_notes TEXT,
  p_notes_enc TEXT,
  p_notes_iv TEXT,
  p_category_id UUID,
  p_transaction_date TIMESTAMPTZ,
  p_transfer_to_account_id UUID DEFAULT NULL,
  p_payment_status TEXT DEFAULT 'paid'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx_id UUID;
  v_debit_acc TEXT;
  v_credit_acc TEXT;
BEGIN
  INSERT INTO public.transactions (
    user_id, business_id, account_id, type, payment_method,
    amount, amount_enc, amount_iv, notes, notes_enc, notes_iv,
    category_id, transaction_date, transfer_to_account_id, payment_status
  ) VALUES (
    p_user_id, p_business_id, p_account_id, p_type, p_payment_method,
    p_amount, p_amount_enc, p_amount_iv, p_notes, p_notes_enc, p_notes_iv,
    p_category_id, p_transaction_date, p_transfer_to_account_id, p_payment_status
  ) RETURNING id INTO v_tx_id;

  -- Determine journal accounts based on transaction type
  IF p_type = 'credit' THEN
    v_debit_acc := '1000'; v_credit_acc := '4000';
  ELSIF p_type = 'debit' THEN
    v_debit_acc := '5000'; v_credit_acc := '1000';
  ELSE
    v_debit_acc := 'transfer_out'; v_credit_acc := 'transfer_in';
  END IF;

  INSERT INTO public.journal_entries (
    user_id, transaction_id, debit_account, credit_account,
    amount, description, entry_date
  ) VALUES (
    p_user_id, v_tx_id, v_debit_acc, v_credit_acc,
    p_amount, p_type || ' transaction', p_transaction_date
  );

  RETURN v_tx_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_transaction TO authenticated;
