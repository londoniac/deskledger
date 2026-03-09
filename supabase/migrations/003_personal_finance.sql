-- Personal Finance: Custom categories, category rules, debt accounts, budgets

-- ─── Custom Categories ───
-- Users can create their own categories beyond the defaults
CREATE TABLE custom_categories (
  id            TEXT NOT NULL,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label         TEXT NOT NULL,
  type          TEXT NOT NULL CHECK(type IN ('income', 'expense', 'bill', 'loan')),
  icon          TEXT DEFAULT '',
  sort_order    INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (id, user_id)
);

CREATE INDEX idx_cc_user ON custom_categories(user_id, type);

-- ─── Category Rules (Learning) ───
-- When a user categorises a transaction, save a rule to auto-apply next time
CREATE TABLE category_rules (
  id            SERIAL PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pattern       TEXT NOT NULL,          -- description substring to match (lowercase)
  category      TEXT NOT NULL,          -- category ID to assign
  type          TEXT NOT NULL CHECK(type IN ('income', 'expense')),
  priority      INTEGER DEFAULT 0,      -- higher = checked first
  match_count   INTEGER DEFAULT 1,      -- how many times this rule has matched
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, pattern, type)
);

CREATE INDEX idx_cr_user ON category_rules(user_id, type);

-- ─── Debt Accounts ───
-- Credit cards, loans, mortgage, store cards
CREATE TABLE debt_accounts (
  id              TEXT NOT NULL,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,                    -- "Barclaycard", "Audi Car Loan"
  type            TEXT NOT NULL CHECK(type IN ('credit_card', 'loan', 'mortgage', 'store_card', 'overdraft', 'other')),
  provider        TEXT DEFAULT '',                  -- "Halifax", "Barclays", "Next"
  balance         NUMERIC(12,2) NOT NULL DEFAULT 0, -- current outstanding balance
  credit_limit    NUMERIC(12,2),                    -- for credit cards
  interest_rate   NUMERIC(5,2) DEFAULT 0,           -- APR %
  min_payment     NUMERIC(12,2) DEFAULT 0,          -- minimum monthly payment
  monthly_payment NUMERIC(12,2) DEFAULT 0,          -- what user actually pays
  payment_day     INTEGER,                          -- day of month payment is due
  start_date      DATE,                             -- when loan started
  end_date        DATE,                             -- expected payoff date
  is_active       BOOLEAN DEFAULT TRUE,
  notes           TEXT DEFAULT '',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (id, user_id)
);

CREATE INDEX idx_da_user ON debt_accounts(user_id, is_active);

-- ─── Debt Payments Log ───
-- Track actual payments made to debt accounts
CREATE TABLE debt_payments (
  id              SERIAL PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  debt_account_id TEXT NOT NULL,
  amount          NUMERIC(12,2) NOT NULL,
  date            DATE NOT NULL,
  type            TEXT DEFAULT 'regular' CHECK(type IN ('regular', 'additional', 'interest', 'fee')),
  notes           TEXT DEFAULT '',
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_dp_user_debt ON debt_payments(user_id, debt_account_id, date DESC);

-- ─── Monthly Budgets ───
-- Budget targets per category per month
CREATE TABLE budgets (
  id          SERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category    TEXT NOT NULL,               -- category ID
  month       TEXT NOT NULL,               -- "2024-10" format
  amount      NUMERIC(12,2) NOT NULL,      -- budgeted amount
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, category, month)
);

CREATE INDEX idx_budget_user_month ON budgets(user_id, month);

-- ─── Income Sources ───
-- Track regular income sources (salary from different earners, dividends, etc.)
CREATE TABLE income_sources (
  id          TEXT NOT NULL,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  earner      TEXT NOT NULL,               -- "Den", "Lucy"
  source      TEXT NOT NULL,               -- "company1", "Dividends"
  amount      NUMERIC(12,2) NOT NULL,      -- expected monthly amount
  frequency   TEXT DEFAULT 'monthly' CHECK(frequency IN ('weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly', 'one_off')),
  is_active   BOOLEAN DEFAULT TRUE,
  notes       TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (id, user_id)
);

CREATE INDEX idx_is_user ON income_sources(user_id, is_active);

-- ─── RLS Policies ───
ALTER TABLE custom_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own categories" ON custom_categories FOR ALL USING (user_id = auth.uid());

ALTER TABLE category_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own rules" ON category_rules FOR ALL USING (user_id = auth.uid());

ALTER TABLE debt_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own debts" ON debt_accounts FOR ALL USING (user_id = auth.uid());

ALTER TABLE debt_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own debt payments" ON debt_payments FOR ALL USING (user_id = auth.uid());

ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own budgets" ON budgets FOR ALL USING (user_id = auth.uid());

ALTER TABLE income_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own income sources" ON income_sources FOR ALL USING (user_id = auth.uid());

-- ─── Add account_type to user_profiles if not exists ───
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS account_type TEXT DEFAULT 'business' CHECK(account_type IN ('business', 'personal'));
