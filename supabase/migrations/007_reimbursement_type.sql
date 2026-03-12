-- Add 'reimbursement' to allowed transaction types
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_type_check CHECK(type IN ('income','expense','transfer','reimbursement'));
