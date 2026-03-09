-- DeskLedger Schema v1
-- Multi-tenant UK accounting SaaS

-- ─── User Profiles ───
CREATE TABLE user_profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  company_name    TEXT,
  company_reg     TEXT,
  tax_ref         TEXT,
  year_start      DATE,
  year_end        DATE,
  seed_money      NUMERIC(12,2) DEFAULT 0,
  tax_rate        NUMERIC(4,1) DEFAULT 19,
  vat_registered  BOOLEAN DEFAULT FALSE,
  vat_number      TEXT,

  -- Subscription
  stripe_customer_id    TEXT,
  subscription_status   TEXT DEFAULT 'trial'
    CHECK(subscription_status IN ('trial','active','past_due','cancelled')),
  subscription_plan     TEXT DEFAULT 'starter',
  addons                JSONB DEFAULT '[]',
  trial_ends_at         TIMESTAMPTZ,

  -- Encrypted service credentials
  paypal_client_id_enc  TEXT,
  paypal_secret_enc     TEXT,
  paypal_sandbox        BOOLEAN DEFAULT FALSE,

  -- Account type
  role            TEXT DEFAULT 'user' CHECK(role IN ('user','accountant','admin')),
  referred_by     UUID REFERENCES user_profiles(id),

  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ─── Transactions ───
CREATE TABLE transactions (
  id                      TEXT NOT NULL,
  user_id                 UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date                    DATE NOT NULL,
  description             TEXT NOT NULL,
  amount                  NUMERIC(12,2) NOT NULL,
  type                    TEXT NOT NULL CHECK(type IN ('income','expense')),
  category                TEXT NOT NULL DEFAULT '',
  source                  TEXT NOT NULL DEFAULT 'manual',
  vat_rate                NUMERIC(5,2) DEFAULT 0,
  vat_amount              NUMERIC(12,2) DEFAULT 0,
  reconciled              BOOLEAN DEFAULT FALSE,
  excluded                BOOLEAN DEFAULT FALSE,
  exclude_reason          TEXT,
  notes                   TEXT DEFAULT '',
  invoice_id              TEXT,
  linked_transaction_id   TEXT,
  monzo_id                TEXT,
  local_currency          TEXT,
  local_amount            NUMERIC(12,2),
  paypal_transaction_id   TEXT,
  created_at              TIMESTAMPTZ DEFAULT now(),
  updated_at              TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (id, user_id)
);

CREATE INDEX idx_txn_user_date ON transactions(user_id, date DESC);
CREATE INDEX idx_txn_user_type ON transactions(user_id, type);
CREATE INDEX idx_txn_user_source ON transactions(user_id, source);
CREATE INDEX idx_txn_user_invoice ON transactions(user_id, invoice_id);

-- ─── Invoices ───
CREATE TABLE invoices (
  id                TEXT NOT NULL,
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name         TEXT NOT NULL,
  file_path         TEXT,
  file_size         INTEGER DEFAULT 0,
  upload_date       DATE NOT NULL,
  invoice_date      DATE,
  supplier          TEXT NOT NULL,
  description       TEXT DEFAULT '',
  original_currency TEXT DEFAULT 'GBP',
  original_amount   NUMERIC(12,2) DEFAULT 0,
  amount_gbp        NUMERIC(12,2) DEFAULT 0,
  category          TEXT DEFAULT 'subscriptions',
  transaction_id    TEXT,
  notes             TEXT DEFAULT '',
  created_at        TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (id, user_id)
);

CREATE INDEX idx_inv_user_date ON invoices(user_id, invoice_date DESC);

-- ─── Personal Expenses ───
CREATE TABLE personal_expenses (
  id            TEXT NOT NULL,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date          DATE NOT NULL,
  description   TEXT NOT NULL,
  amount        NUMERIC(12,2) NOT NULL,
  category      TEXT DEFAULT 'office',
  supplier      TEXT DEFAULT '',
  receipt_path  TEXT,
  receipt_name  TEXT DEFAULT '',
  status        TEXT DEFAULT 'pending' CHECK(status IN ('pending','invoiced','reimbursed')),
  invoice_ref   TEXT DEFAULT '',
  notes         TEXT DEFAULT '',
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (id, user_id)
);

CREATE INDEX idx_pe_user_date ON personal_expenses(user_id, date DESC);
CREATE INDEX idx_pe_user_status ON personal_expenses(user_id, status);

-- ─── PayPal Transactions ───
CREATE TABLE paypal_transactions (
  id                  TEXT NOT NULL,
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  paypal_id           TEXT,
  date                DATE NOT NULL,
  description         TEXT NOT NULL,
  amount              NUMERIC(12,2) NOT NULL,
  currency            TEXT DEFAULT 'GBP',
  gbp_amount          NUMERIC(12,2) DEFAULT 0,
  type                TEXT NOT NULL CHECK(type IN ('transfer_in','author_payout','fee','refund','other')),
  author_name         TEXT DEFAULT '',
  status              TEXT DEFAULT 'unmatched' CHECK(status IN ('unmatched','matched','reconciled')),
  matched_bank_txn_id TEXT,
  event_code          TEXT DEFAULT '',
  fee_amount          NUMERIC(12,2) DEFAULT 0,
  notes               TEXT DEFAULT '',
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (id, user_id)
);

CREATE INDEX idx_pp_user_date ON paypal_transactions(user_id, date DESC);
CREATE INDEX idx_pp_user_type ON paypal_transactions(user_id, type);

-- ─── Accountant-Client Relationships ───
CREATE TABLE accountant_clients (
  accountant_id   UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  client_id       UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  access_level    TEXT DEFAULT 'readonly' CHECK(access_level IN ('readonly','export')),
  created_at      TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (accountant_id, client_id)
);

-- ─── Auto-create profile on signup ───
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_profiles (id, email, trial_ends_at)
  VALUES (NEW.id, NEW.email, now() + interval '14 days');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
