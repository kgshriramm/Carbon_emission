-- Project Carbon PostgreSQL schema (MVP backend-first)
-- Focus: reproducible emissions calculations with factor versioning.

BEGIN;

-- ---------------------------------------------------------------------------
-- Core identity + organization
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name VARCHAR(150),
  role VARCHAR(40) NOT NULL DEFAULT 'exporter_admin',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS companies (
  id BIGSERIAL PRIMARY KEY,
  company_name VARCHAR(255) NOT NULL,
  country_code CHAR(2) NOT NULL,
  sector VARCHAR(120),
  registration_number VARCHAR(120),
  annual_production NUMERIC(20, 4),
  annual_production_unit VARCHAR(50),
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS company_users (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  membership_role VARCHAR(40) NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, user_id)
);

CREATE TABLE IF NOT EXISTS factories (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  factory_name VARCHAR(255) NOT NULL,
  country_code CHAR(2) NOT NULL,
  state_region VARCHAR(120),
  city VARCHAR(120),
  address_line TEXT,
  latitude NUMERIC(9, 6),
  longitude NUMERIC(9, 6),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  factory_id BIGINT REFERENCES factories(id) ON DELETE SET NULL,
  product_name VARCHAR(255) NOT NULL,
  cbam_category VARCHAR(120),
  hs_code VARCHAR(20),
  export_destination_country CHAR(2),
  default_production_unit VARCHAR(50),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Reporting + activity capture
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS reporting_periods (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  period_label VARCHAR(100) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  period_type VARCHAR(20) NOT NULL DEFAULT 'monthly',
  status VARCHAR(30) NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT reporting_period_dates_chk CHECK (period_end >= period_start),
  UNIQUE (company_id, period_start, period_end)
);

CREATE TABLE IF NOT EXISTS activity_data (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  factory_id BIGINT REFERENCES factories(id) ON DELETE SET NULL,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  reporting_period_id BIGINT NOT NULL REFERENCES reporting_periods(id) ON DELETE CASCADE,
  activity_type VARCHAR(50) NOT NULL,
  quantity NUMERIC(20, 6) NOT NULL,
  unit VARCHAR(50) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  source_note TEXT,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT activity_quantity_chk CHECK (quantity >= 0)
);

-- ---------------------------------------------------------------------------
-- Emission factors + calculations (versioned/reproducible)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS emission_factors (
  id BIGSERIAL PRIMARY KEY,
  factor_key VARCHAR(120) NOT NULL,
  activity_type VARCHAR(50) NOT NULL,
  geography_code VARCHAR(20) NOT NULL DEFAULT 'GLOBAL',
  unit VARCHAR(50) NOT NULL,
  factor_value NUMERIC(20, 10) NOT NULL,
  factor_unit VARCHAR(50) NOT NULL DEFAULT 'kg_co2e_per_unit',
  source VARCHAR(200) NOT NULL,
  source_reference TEXT,
  version VARCHAR(40) NOT NULL,
  valid_from DATE NOT NULL,
  valid_to DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT factor_value_chk CHECK (factor_value >= 0),
  CONSTRAINT factor_validity_chk CHECK (valid_to IS NULL OR valid_to >= valid_from),
  UNIQUE (factor_key, geography_code, version, valid_from)
);

CREATE TABLE IF NOT EXISTS emission_calculations (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  factory_id BIGINT REFERENCES factories(id) ON DELETE SET NULL,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  reporting_period_id BIGINT NOT NULL REFERENCES reporting_periods(id) ON DELETE CASCADE,
  activity_data_id BIGINT REFERENCES activity_data(id) ON DELETE SET NULL,
  emission_factor_id BIGINT NOT NULL REFERENCES emission_factors(id) ON DELETE RESTRICT,
  activity_type VARCHAR(50) NOT NULL,
  quantity NUMERIC(20, 6) NOT NULL,
  quantity_unit VARCHAR(50) NOT NULL,
  factor_value NUMERIC(20, 10) NOT NULL,
  factor_unit VARCHAR(50) NOT NULL,
  total_co2e_kg NUMERIC(20, 6) NOT NULL,
  calculation_method VARCHAR(120) NOT NULL DEFAULT 'activity_x_factor',
  formula TEXT NOT NULL DEFAULT 'CO2e = activity_data * emission_factor',
  calculation_version VARCHAR(40) NOT NULL DEFAULT 'v1',
  factor_snapshot JSONB NOT NULL DEFAULT '{}'::JSONB,
  input_snapshot JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT calc_quantity_chk CHECK (quantity >= 0),
  CONSTRAINT calc_total_chk CHECK (total_co2e_kg >= 0)
);

-- ---------------------------------------------------------------------------
-- Reports + verification
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS reports (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  reporting_period_id BIGINT NOT NULL REFERENCES reporting_periods(id) ON DELETE CASCADE,
  report_type VARCHAR(50) NOT NULL DEFAULT 'cbam_transitional',
  report_version INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  total_emissions_kg NUMERIC(20, 6) NOT NULL DEFAULT 0,
  emission_per_unit NUMERIC(20, 10),
  production_quantity NUMERIC(20, 6),
  production_unit VARCHAR(50),
  file_url TEXT,
  generated_at TIMESTAMPTZ,
  generated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ,
  submitted_reference VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, reporting_period_id, report_type, report_version)
);

CREATE TABLE IF NOT EXISTS report_calculations (
  id BIGSERIAL PRIMARY KEY,
  report_id BIGINT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  emission_calculation_id BIGINT NOT NULL REFERENCES emission_calculations(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (report_id, emission_calculation_id)
);

CREATE TABLE IF NOT EXISTS verifications (
  id BIGSERIAL PRIMARY KEY,
  report_id BIGINT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  verifier_org_name VARCHAR(255),
  verifier_contact_email VARCHAR(255),
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  verification_notes TEXT,
  evidence_files JSONB NOT NULL DEFAULT '[]'::JSONB,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT REFERENCES companies(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  entity_type VARCHAR(60) NOT NULL,
  entity_id BIGINT,
  action VARCHAR(60) NOT NULL,
  before_data JSONB,
  after_data JSONB,
  ip_address VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_company_users_user_id ON company_users(user_id);
CREATE INDEX IF NOT EXISTS idx_factories_company_id ON factories(company_id);
CREATE INDEX IF NOT EXISTS idx_products_company_id ON products(company_id);
CREATE INDEX IF NOT EXISTS idx_products_factory_id ON products(factory_id);

CREATE INDEX IF NOT EXISTS idx_reporting_periods_company_id ON reporting_periods(company_id);
CREATE INDEX IF NOT EXISTS idx_reporting_periods_date ON reporting_periods(period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_activity_company_period ON activity_data(company_id, reporting_period_id);
CREATE INDEX IF NOT EXISTS idx_activity_product ON activity_data(product_id);
CREATE INDEX IF NOT EXISTS idx_activity_type ON activity_data(activity_type);

CREATE INDEX IF NOT EXISTS idx_factors_lookup
  ON emission_factors(activity_type, geography_code, valid_from, valid_to, is_active);
CREATE INDEX IF NOT EXISTS idx_factors_key_version ON emission_factors(factor_key, version);

CREATE INDEX IF NOT EXISTS idx_calculations_company_period
  ON emission_calculations(company_id, reporting_period_id);
CREATE INDEX IF NOT EXISTS idx_calculations_product ON emission_calculations(product_id);
CREATE INDEX IF NOT EXISTS idx_calculations_factor_id ON emission_calculations(emission_factor_id);

CREATE INDEX IF NOT EXISTS idx_reports_company_period ON reports(company_id, reporting_period_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);

CREATE INDEX IF NOT EXISTS idx_verifications_report_id ON verifications(report_id);
CREATE INDEX IF NOT EXISTS idx_verifications_status ON verifications(status);

CREATE INDEX IF NOT EXISTS idx_audit_company_id ON audit_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_logs(created_at);

COMMIT;

-- ---------------------------------------------------------------------------
-- Auth/session + subscription model (provider-agnostic SaaS billing)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS plans (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR(60) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  price_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  price_currency CHAR(3) NOT NULL DEFAULT 'USD',
  billing_interval VARCHAR(20) NOT NULL DEFAULT 'monthly',
  features_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  plan_id BIGINT NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  external_provider VARCHAR(40),
  external_subscription_id VARCHAR(200),
  trial_ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT subscription_period_chk CHECK (current_period_end >= current_period_start)
);

CREATE TABLE IF NOT EXISTS entitlements (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  entitlement_key VARCHAR(120) NOT NULL,
  limit_value NUMERIC(20, 4),
  used_value NUMERIC(20, 4) NOT NULL DEFAULT 0,
  period_key VARCHAR(30),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, entitlement_key, period_key)
);

CREATE TABLE IF NOT EXISTS usage_events (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  event_type VARCHAR(120) NOT NULL,
  quantity NUMERIC(20, 4) NOT NULL DEFAULT 1,
  period_key VARCHAR(30),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS billing_events (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT REFERENCES companies(id) ON DELETE CASCADE,
  subscription_id BIGINT REFERENCES subscriptions(id) ON DELETE SET NULL,
  provider VARCHAR(40),
  provider_event_id VARCHAR(200),
  event_type VARCHAR(120) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  status VARCHAR(30) NOT NULL DEFAULT 'received',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  UNIQUE (provider, provider_event_id)
);

CREATE TABLE IF NOT EXISTS magic_login_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_company_id ON subscriptions(company_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_entitlements_company_key ON entitlements(company_id, entitlement_key);
CREATE INDEX IF NOT EXISTS idx_usage_events_company_period ON usage_events(company_id, period_key);
CREATE INDEX IF NOT EXISTS idx_billing_events_subscription_id ON billing_events(subscription_id);
CREATE INDEX IF NOT EXISTS idx_magic_login_tokens_user_id ON magic_login_tokens(user_id);
