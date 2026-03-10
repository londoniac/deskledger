-- DeskLedger V2 Schema Additions
-- Dividends, Directors' Loan Account, VAT Returns, Fixed Assets, Journal Entries

-- ─── Additional Profile Fields ───
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS vat_scheme TEXT DEFAULT 'standard'
  CHECK(vat_scheme IN ('standard', 'cash', 'flat_rate'));
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS vat_flat_rate NUMERIC(5,2) DEFAULT 0;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS vat_registration_date DATE;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS vat_quarter_start INTEGER DEFAULT 1
  CHECK(vat_quarter_start BETWEEN 1 AND 12);

-- ─── Dividends ───
-- Track dividend payments to shareholders (directors)
CREATE TABLE dividends (
  id            TEXT NOT NULL,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date          DATE NOT NULL,
  amount        NUMERIC(12,2) NOT NULL,
  shareholder   TEXT NOT NULL,                -- "Den Smith", "Lucy Smith"
  tax_year      TEXT NOT NULL,                -- "2025-26" format
  voucher_no    TEXT DEFAULT '',              -- dividend voucher reference
  notes         TEXT DEFAULT '',
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (id, user_id)
);

CREATE INDEX idx_div_user_date ON dividends(user_id, date DESC);
CREATE INDEX idx_div_user_taxyear ON dividends(user_id, tax_year);

-- ─── Directors' Loan Account ───
-- Ledger of money flowing between director and company
CREATE TABLE directors_loan (
  id            TEXT NOT NULL,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date          DATE NOT NULL,
  amount        NUMERIC(12,2) NOT NULL,       -- always positive
  direction     TEXT NOT NULL CHECK(direction IN ('to_director', 'to_company')),
  description   TEXT NOT NULL,
  category      TEXT DEFAULT '',              -- e.g. 'salary', 'expense_reimbursement', 'loan', 'dividend'
  transaction_id TEXT,                        -- optional link to a bank transaction
  notes         TEXT DEFAULT '',
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (id, user_id)
);

CREATE INDEX idx_dla_user_date ON directors_loan(user_id, date DESC);

-- ─── VAT Returns ───
-- Quarterly VAT return with 9-box data
CREATE TABLE vat_returns (
  id              TEXT NOT NULL,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_start    DATE NOT NULL,
  period_end      DATE NOT NULL,
  status          TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'submitted', 'filed')),

  -- 9-box VAT return
  box1_vat_due_sales        NUMERIC(12,2) DEFAULT 0,  -- VAT due on sales
  box2_vat_due_acquisitions NUMERIC(12,2) DEFAULT 0,  -- VAT due on EU/overseas acquisitions
  box3_total_vat_due        NUMERIC(12,2) DEFAULT 0,  -- Box 1 + Box 2
  box4_vat_reclaimed        NUMERIC(12,2) DEFAULT 0,  -- VAT reclaimed on purchases
  box5_net_vat              NUMERIC(12,2) DEFAULT 0,  -- Box 3 - Box 4 (pay or reclaim)
  box6_total_sales          NUMERIC(12,2) DEFAULT 0,  -- Total sales ex-VAT
  box7_total_purchases      NUMERIC(12,2) DEFAULT 0,  -- Total purchases ex-VAT
  box8_total_supplies       NUMERIC(12,2) DEFAULT 0,  -- Total supplies to EU/overseas
  box9_total_acquisitions   NUMERIC(12,2) DEFAULT 0,  -- Total acquisitions from EU/overseas

  submitted_at    TIMESTAMPTZ,
  notes           TEXT DEFAULT '',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (id, user_id)
);

CREATE INDEX idx_vat_user_period ON vat_returns(user_id, period_start DESC);

-- ─── Fixed Assets ───
-- Capital items tracked for depreciation / capital allowances
CREATE TABLE fixed_assets (
  id                  TEXT NOT NULL,
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,                -- "MacBook Pro", "Office Desk"
  description         TEXT DEFAULT '',
  cost                NUMERIC(12,2) NOT NULL,       -- purchase price
  date_acquired       DATE NOT NULL,
  date_disposed       DATE,                         -- NULL if still owned
  disposal_proceeds   NUMERIC(12,2) DEFAULT 0,
  category            TEXT NOT NULL CHECK(category IN (
    'computer_equipment', 'office_equipment', 'furniture',
    'vehicle', 'machinery', 'other'
  )),
  depreciation_method TEXT DEFAULT 'straight_line' CHECK(depreciation_method IN (
    'straight_line', 'reducing_balance', 'aia'       -- AIA = Annual Investment Allowance
  )),
  useful_life_years   INTEGER DEFAULT 3,
  annual_rate         NUMERIC(5,2) DEFAULT 33.33,   -- % per year (default 3-year straight line)
  transaction_id      TEXT,                          -- optional link to purchase transaction
  notes               TEXT DEFAULT '',
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (id, user_id)
);

CREATE INDEX idx_fa_user ON fixed_assets(user_id, date_acquired DESC);

-- ─── Journal Entries ───
-- Year-end adjustments (accruals, prepayments, corrections)
CREATE TABLE journal_entries (
  id            TEXT NOT NULL,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date          DATE NOT NULL,
  description   TEXT NOT NULL,
  debit_account TEXT NOT NULL,               -- e.g. 'office', 'travel', 'accruals'
  credit_account TEXT NOT NULL,              -- e.g. 'bank', 'creditors', 'prepayments'
  amount        NUMERIC(12,2) NOT NULL,
  type          TEXT DEFAULT 'adjustment' CHECK(type IN (
    'accrual', 'prepayment', 'depreciation', 'correction', 'adjustment'
  )),
  period        TEXT,                        -- "2025-26" or "2025-Q4"
  notes         TEXT DEFAULT '',
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (id, user_id)
);

CREATE INDEX idx_je_user_date ON journal_entries(user_id, date DESC);

-- ─── RLS Policies for New Tables ───

ALTER TABLE dividends ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own dividends"
  ON dividends FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Accountants read client dividends"
  ON dividends FOR SELECT USING (
    user_id IN (SELECT client_id FROM accountant_clients WHERE accountant_id = auth.uid())
  );

ALTER TABLE directors_loan ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own DLA"
  ON directors_loan FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Accountants read client DLA"
  ON directors_loan FOR SELECT USING (
    user_id IN (SELECT client_id FROM accountant_clients WHERE accountant_id = auth.uid())
  );

ALTER TABLE vat_returns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own VAT returns"
  ON vat_returns FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Accountants read client VAT returns"
  ON vat_returns FOR SELECT USING (
    user_id IN (SELECT client_id FROM accountant_clients WHERE accountant_id = auth.uid())
  );

ALTER TABLE fixed_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own fixed assets"
  ON fixed_assets FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Accountants read client fixed assets"
  ON fixed_assets FOR SELECT USING (
    user_id IN (SELECT client_id FROM accountant_clients WHERE accountant_id = auth.uid())
  );

ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own journal entries"
  ON journal_entries FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Accountants read client journal entries"
  ON journal_entries FOR SELECT USING (
    user_id IN (SELECT client_id FROM accountant_clients WHERE accountant_id = auth.uid())
  );
