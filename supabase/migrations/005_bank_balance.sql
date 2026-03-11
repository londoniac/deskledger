-- Add bank balance tracking to user_profiles
-- Automatically updated from Monzo CSV imports (Balance column)
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS bank_balance NUMERIC(12,2);
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS bank_balance_date DATE;
