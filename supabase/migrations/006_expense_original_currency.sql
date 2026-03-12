-- Add optional original currency amount for expenses paid in foreign currency
ALTER TABLE personal_expenses ADD COLUMN IF NOT EXISTS original_amount NUMERIC(12,2);
ALTER TABLE personal_expenses ADD COLUMN IF NOT EXISTS original_currency TEXT DEFAULT NULL;
