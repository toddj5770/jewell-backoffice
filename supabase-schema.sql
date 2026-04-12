-- ============================================================
-- JEWELL REAL ESTATE BACK OFFICE — SUPABASE SCHEMA
-- Run this entire file in Supabase → SQL Editor → New Query
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- PROFILES — links auth.users to role + agent record
-- ============================================================
CREATE TABLE profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'agent' CHECK (role IN ('broker', 'admin', 'agent')),
  agent_id    UUID,  -- NULL for broker/admin, set for agents
  first_name  TEXT,
  last_name   TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SETTINGS — org-level config (one row)
-- ============================================================
CREATE TABLE settings (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_name            TEXT DEFAULT 'Jewell Real Estate',
  logo_base64         TEXT,
  offices             TEXT[] DEFAULT ARRAY['Athens', 'Etowah', 'Madisonville'],
  lead_sources        TEXT[] DEFAULT ARRAY['AGL', 'AGL-Open House', 'CGL-Database', 'CGL-OpCity', 'CGL-Phone In', 'CGL-Realtor.com'],
  transaction_types   TEXT[] DEFAULT ARRAY['selling', 'listing', 'dual', 'rental', 'referral'],
  property_types      TEXT[] DEFAULT ARRAY['Residential', 'Condo', 'Commercial', 'Land', 'Multi-family'],
  mortgage_companies  TEXT[] DEFAULT ARRAY['Cash', 'Wells Fargo', 'Rocket Mortgage', 'Pennymac', 'Local Bank'],
  expense_categories  TEXT[] DEFAULT ARRAY['Signs & Riders','Photography','Staging','Marketing','Advertising','Lockbox','Office Supplies','Courier / Delivery','Other'],
  payment_methods     TEXT[] DEFAULT ARRAY['ACH','Check','Cash','Credit Card','Deducted from Commission','Other'],
  trust_deposit_types TEXT[] DEFAULT ARRAY['Earnest Money','Option Fee','Down Payment','Other Deposit'],
  fee_frequencies     TEXT[] DEFAULT ARRAY['monthly','quarterly','annual','one-time'],
  license_types       JSONB  DEFAULT '[{"value":"salesperson","label":"Salesperson"},{"value":"broker_associate","label":"Associate Broker"},{"value":"broker","label":"Broker"}]',
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default settings row
INSERT INTO settings (id) VALUES (uuid_generate_v4());

-- ============================================================
-- COMMISSION PLANS
-- ============================================================
CREATE TABLE plans (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            TEXT NOT NULL,
  type            TEXT NOT NULL CHECK (type IN ('flat', 'cap')),
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  -- Flat plan
  agent_pct       NUMERIC(5,2),
  -- Cap plan
  cap_amount      NUMERIC(10,2),
  rollover_type   TEXT DEFAULT 'start_date' CHECK (rollover_type IN ('start_date','custom_date','calendar_year','none','monthly','rolling_rollover')),
  rollover_date   DATE,
  cap_on_fees     BOOLEAN DEFAULT FALSE,
  -- Cap levels stored as JSONB array: [{from, to, pct}]
  cap_levels      JSONB DEFAULT '[]',
  -- Fees stored as JSONB array: [{name, dir, basis, amt, payer}]
  fees            JSONB DEFAULT '[]',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Seed plans
INSERT INTO plans (name, type, status, cap_amount, rollover_type, cap_levels, fees) VALUES
  ('Cap Plan — Standard', 'cap', 'active', 10000, 'start_date',
   '[{"from":0,"to":10000,"pct":90},{"from":10000,"to":null,"pct":100}]',
   '[{"name":"Admin Fee","dir":"debit","basis":"flat","amt":195,"payer":"client"}]');

INSERT INTO plans (name, type, status, agent_pct, fees) VALUES
  ('Flat Split — 80%', 'flat', 'active', 80,
   '[{"name":"Admin Fee","dir":"debit","basis":"flat","amt":195,"payer":"client"}]');

-- ============================================================
-- AGENTS
-- ============================================================
CREATE TABLE agents (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  first_name            TEXT NOT NULL,
  last_name             TEXT NOT NULL,
  email                 TEXT UNIQUE NOT NULL,
  phone_mobile          TEXT,
  phone_office          TEXT,
  office                TEXT,
  status                TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  archived_reason       TEXT,
  archived_at           TIMESTAMPTZ,
  start_date            DATE,
  plan_id               UUID REFERENCES plans(id),
  plan_assigned_date    DATE,
  -- License
  license_number        TEXT,
  license_type          TEXT,
  license_state         TEXT DEFAULT 'TN',
  license_issue_date    DATE,
  license_expiration    DATE,
  license_status        TEXT DEFAULT 'active',
  eando_expiration      DATE,
  eando_carrier         TEXT,
  eando_policy          TEXT,
  -- Compliance
  mls_id                TEXT,
  nar_id                TEXT,
  w9_on_file            BOOLEAN DEFAULT FALSE,
  w9_date               DATE,
  onboard_status        TEXT DEFAULT 'not_started' CHECK (onboard_status IN ('not_started','in_progress','complete')),
  -- Auth link
  user_id               UUID REFERENCES auth.users(id),
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ONBOARDING TEMPLATES & ASSIGNMENTS
-- ============================================================
CREATE TABLE onboard_templates (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  description TEXT,
  status      TEXT DEFAULT 'active' CHECK (status IN ('active','archived')),
  items       JSONB DEFAULT '[]',  -- [{id, title, category, required, notes}]
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE onboard_assignments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id        UUID REFERENCES agents(id) ON DELETE CASCADE,
  template_id     UUID REFERENCES onboard_templates(id),
  assigned_at     DATE DEFAULT CURRENT_DATE,
  completed_items TEXT[] DEFAULT ARRAY[]::TEXT[],
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TRANSACTIONS
-- ============================================================
CREATE TABLE transactions (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type                      TEXT NOT NULL DEFAULT 'selling',
  status                    TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','pending','closed','cancelled')),
  property_type             TEXT,
  street_address            TEXT NOT NULL,
  city                      TEXT NOT NULL,
  state                     TEXT DEFAULT 'TN',
  zip                       TEXT,
  country                   TEXT DEFAULT 'United States',
  sale_price                NUMERIC(12,2),
  selling_commission_pct    NUMERIC(5,3),
  selling_commission_flat   NUMERIC(10,2),
  lead_source               TEXT,
  mortgage_company          TEXT DEFAULT 'Cash',
  mls_number                TEXT,
  contract_acceptance_date  DATE,
  estimated_close_date      DATE,
  close_date                DATE,
  cancelled_reason          TEXT,
  -- Co-broke / referral (informational only)
  co_broke_company          TEXT,
  co_broke_agent            TEXT,
  outside_referral_company  TEXT,
  outside_referral_agent    TEXT,
  -- Parties stored as JSONB
  buyers                    JSONB DEFAULT '[]',  -- [{name, email, phone}]
  sellers                   JSONB DEFAULT '[]',
  -- Locked commission values (stamped at close, immutable)
  locked_at                 TIMESTAMPTZ,
  -- Deductions withheld at disbursement
  deductions_withheld       NUMERIC(10,2) DEFAULT 0,
  deductions_detail         JSONB DEFAULT '[]',  -- [{desc, amount}]
  -- Admin fee payer override
  admin_fee_payer           TEXT DEFAULT 'client' CHECK (admin_fee_payer IN ('client','agent','broker')),
  created_at                TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TRANSACTION AGENTS — multi-agent splits per deal
-- ============================================================
CREATE TABLE transaction_agents (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id  UUID REFERENCES transactions(id) ON DELETE CASCADE,
  agent_id        UUID REFERENCES agents(id),
  role            TEXT DEFAULT 'primary' CHECK (role IN ('primary','secondary')),
  -- Split of the gross commission
  split_type      TEXT DEFAULT 'percent' CHECK (split_type IN ('percent','dollar')),
  split_value     NUMERIC(10,2) NOT NULL DEFAULT 100,
  -- Volume credit percentage (for cap tracking)
  volume_pct      NUMERIC(5,2) NOT NULL DEFAULT 100,
  -- Plan override (defaults to agent's current plan)
  plan_id         UUID REFERENCES plans(id),
  -- Locked values stamped at close
  locked_gross            NUMERIC(10,2),
  locked_agent_pct        NUMERIC(5,2),
  locked_agent_gross      NUMERIC(10,2),
  locked_agent_net        NUMERIC(10,2),
  locked_broker_net       NUMERIC(10,2),
  locked_admin_fee        NUMERIC(10,2),
  locked_admin_fee_payer  TEXT,
  sort_order      INT DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- DISBURSEMENTS
-- ============================================================
CREATE TABLE disbursements (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id  UUID REFERENCES transactions(id),
  -- NULL = combined view; agent_id set = individual agent disbursement
  agent_id        UUID REFERENCES agents(id),
  paid            BOOLEAN DEFAULT FALSE,
  paid_date       DATE,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TRUST / EARNEST MONEY
-- ============================================================
CREATE TABLE trust_entries (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id  UUID REFERENCES transactions(id),
  type            TEXT,
  amount          NUMERIC(10,2),
  received_date   DATE,
  released_date   DATE,
  status          TEXT DEFAULT 'held' CHECK (status IN ('held','released','forfeited')),
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- BILLING — fee schedules, charges, expenses
-- ============================================================
CREATE TABLE billing_fees (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  description TEXT,
  frequency   TEXT,
  amount      NUMERIC(10,2),
  applies_to  TEXT DEFAULT 'all',
  status      TEXT DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE billing_fee_overrides (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fee_id    UUID REFERENCES billing_fees(id) ON DELETE CASCADE,
  agent_id  UUID REFERENCES agents(id) ON DELETE CASCADE,
  amount    NUMERIC(10,2),
  reason    TEXT
);

CREATE TABLE billing_charges (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id                UUID REFERENCES agents(id),
  fee_id                  UUID REFERENCES billing_fees(id),
  charge_type             TEXT DEFAULT 'charge' CHECK (charge_type IN ('charge','expense')),
  amount                  NUMERIC(10,2),
  period                  TEXT,  -- 'YYYY-MM'
  status                  TEXT DEFAULT 'unpaid' CHECK (status IN ('unpaid','paid')),
  due_date                DATE,
  paid_date               DATE,
  payment_method          TEXT,
  notes                   TEXT,
  -- Expense fields
  expense_category        TEXT,
  description             TEXT,
  expense_date            DATE,
  deduct_from_commission  BOOLEAN DEFAULT FALSE,
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings             ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans                ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents               ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_agents   ENABLE ROW LEVEL SECURITY;
ALTER TABLE disbursements        ENABLE ROW LEVEL SECURITY;
ALTER TABLE trust_entries        ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_fees         ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_fee_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_charges      ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboard_templates    ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboard_assignments  ENABLE ROW LEVEL SECURITY;

-- Helper function: get current user's role
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function: get current user's agent_id
CREATE OR REPLACE FUNCTION get_my_agent_id()
RETURNS UUID AS $$
  SELECT agent_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- PROFILES: users can read their own profile
CREATE POLICY "profiles_select_own" ON profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "profiles_select_admin" ON profiles FOR SELECT USING (get_my_role() IN ('broker','admin'));
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE USING (id = auth.uid());
CREATE POLICY "profiles_admin_all" ON profiles FOR ALL USING (get_my_role() IN ('broker','admin'));

-- SETTINGS: broker/admin read+write, agents read-only
CREATE POLICY "settings_read_all" ON settings FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "settings_write_admin" ON settings FOR ALL USING (get_my_role() IN ('broker','admin'));

-- PLANS: broker/admin all, agents read
CREATE POLICY "plans_read_all" ON plans FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "plans_write_admin" ON plans FOR ALL USING (get_my_role() IN ('broker','admin'));

-- AGENTS: broker/admin see all; agents see only themselves
CREATE POLICY "agents_admin_all" ON agents FOR ALL USING (get_my_role() IN ('broker','admin'));
CREATE POLICY "agents_self" ON agents FOR SELECT USING (id = get_my_agent_id());

-- TRANSACTIONS: broker/admin see all; agents see only their own
CREATE POLICY "txn_admin_all" ON transactions FOR ALL USING (get_my_role() IN ('broker','admin'));
CREATE POLICY "txn_agent_own" ON transactions FOR SELECT USING (
  id IN (SELECT transaction_id FROM transaction_agents WHERE agent_id = get_my_agent_id())
);

-- TRANSACTION_AGENTS: broker/admin all; agents see own rows
CREATE POLICY "txn_agents_admin_all" ON transaction_agents FOR ALL USING (get_my_role() IN ('broker','admin'));
CREATE POLICY "txn_agents_self" ON transaction_agents FOR SELECT USING (agent_id = get_my_agent_id());

-- DISBURSEMENTS: broker/admin all; agents see only their own
CREATE POLICY "disb_admin_all" ON disbursements FOR ALL USING (get_my_role() IN ('broker','admin'));
CREATE POLICY "disb_agent_own" ON disbursements FOR SELECT USING (agent_id = get_my_agent_id());

-- TRUST: broker/admin all
CREATE POLICY "trust_admin_all" ON trust_entries FOR ALL USING (get_my_role() IN ('broker','admin'));

-- BILLING: broker/admin all; agents see own charges
CREATE POLICY "billing_fees_read_all" ON billing_fees FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "billing_fees_admin" ON billing_fees FOR ALL USING (get_my_role() IN ('broker','admin'));
CREATE POLICY "billing_overrides_admin" ON billing_fee_overrides FOR ALL USING (get_my_role() IN ('broker','admin'));
CREATE POLICY "billing_charges_admin" ON billing_charges FOR ALL USING (get_my_role() IN ('broker','admin'));
CREATE POLICY "billing_charges_agent" ON billing_charges FOR SELECT USING (agent_id = get_my_agent_id());

-- ONBOARDING: broker/admin all; agents see own assignment
CREATE POLICY "onboard_templates_read" ON onboard_templates FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "onboard_templates_admin" ON onboard_templates FOR ALL USING (get_my_role() IN ('broker','admin'));
CREATE POLICY "onboard_assign_admin" ON onboard_assignments FOR ALL USING (get_my_role() IN ('broker','admin'));
CREATE POLICY "onboard_assign_agent" ON onboard_assignments FOR SELECT USING (agent_id = get_my_agent_id());

-- ============================================================
-- INDEXES for performance
-- ============================================================
CREATE INDEX idx_transaction_agents_txn ON transaction_agents(transaction_id);
CREATE INDEX idx_transaction_agents_agent ON transaction_agents(agent_id);
CREATE INDEX idx_disbursements_txn ON disbursements(transaction_id);
CREATE INDEX idx_disbursements_agent ON disbursements(agent_id);
CREATE INDEX idx_billing_charges_agent ON billing_charges(agent_id);
CREATE INDEX idx_agents_user ON agents(user_id);
CREATE INDEX idx_profiles_agent ON profiles(agent_id);
