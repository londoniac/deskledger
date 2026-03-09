-- Row-Level Security Policies
-- Every table is locked down: users can only access their own data

-- ─── User Profiles ───
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own profile"
  ON user_profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "Users update own profile"
  ON user_profiles FOR UPDATE
  USING (id = auth.uid());

-- ─── Transactions ───
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own transactions"
  ON transactions FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "Accountants read client transactions"
  ON transactions FOR SELECT
  USING (
    user_id IN (
      SELECT client_id FROM accountant_clients
      WHERE accountant_id = auth.uid()
    )
  );

-- ─── Invoices ───
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own invoices"
  ON invoices FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "Accountants read client invoices"
  ON invoices FOR SELECT
  USING (
    user_id IN (
      SELECT client_id FROM accountant_clients
      WHERE accountant_id = auth.uid()
    )
  );

-- ─── Personal Expenses ───
ALTER TABLE personal_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own expenses"
  ON personal_expenses FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "Accountants read client expenses"
  ON personal_expenses FOR SELECT
  USING (
    user_id IN (
      SELECT client_id FROM accountant_clients
      WHERE accountant_id = auth.uid()
    )
  );

-- ─── PayPal Transactions ───
ALTER TABLE paypal_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own paypal transactions"
  ON paypal_transactions FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "Accountants read client paypal transactions"
  ON paypal_transactions FOR SELECT
  USING (
    user_id IN (
      SELECT client_id FROM accountant_clients
      WHERE accountant_id = auth.uid()
    )
  );

-- ─── Accountant Clients ───
ALTER TABLE accountant_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Accountants manage own client list"
  ON accountant_clients FOR ALL
  USING (accountant_id = auth.uid());

CREATE POLICY "Clients see their accountant link"
  ON accountant_clients FOR SELECT
  USING (client_id = auth.uid());
