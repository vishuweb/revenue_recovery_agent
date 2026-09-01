export const POSTGRES_SCHEMA = `
-- AI Revenue Recovery Platform — PostgreSQL / Supabase Database Schema
-- All monetary amounts stored in paise (1 INR = 100 paise)

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  company TEXT,
  plan TEXT NOT NULL DEFAULT 'starter',
  mrr BIGINT NOT NULL DEFAULT 0,
  lifetime_value BIGINT NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'card',
  card_last4 TEXT,
  card_expiry TEXT,
  risk_score DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  total_payments INTEGER NOT NULL DEFAULT 0,
  successful_payments INTEGER NOT NULL DEFAULT 0,
  failed_payments INTEGER NOT NULL DEFAULT 0,
  discount_affinity DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  avg_order_value BIGINT NOT NULL DEFAULT 0,
  intervention_count INTEGER NOT NULL DEFAULT 0,
  last_intervention_at TIMESTAMPTZ,
  opted_out INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL,
  plan_name TEXT NOT NULL,
  amount BIGINT NOT NULL,
  interval TEXT NOT NULL DEFAULT 'monthly',
  status TEXT NOT NULL DEFAULT 'active',
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  failure_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  subscription_id TEXT REFERENCES subscriptions(id),
  amount BIGINT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'unpaid',
  due_date TIMESTAMPTZ NOT NULL,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  subscription_id TEXT REFERENCES subscriptions(id),
  invoice_id TEXT REFERENCES invoices(id),
  amount BIGINT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'pending',
  method TEXT,
  failure_reason TEXT,
  failure_source TEXT,
  provider_payment_id TEXT,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS recovery_cases (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  payment_id TEXT NOT NULL REFERENCES payments(id),
  subscription_id TEXT REFERENCES subscriptions(id),
  invoice_id TEXT REFERENCES invoices(id),
  event_id TEXT,
  intervention_cost BIGINT NOT NULL DEFAULT 0,
  amount_at_risk BIGINT NOT NULL,
  expected_recovery BIGINT NOT NULL DEFAULT 0,
  net_expected_value BIGINT NOT NULL DEFAULT 0,
  candidate_actions TEXT,
  failure_reason TEXT NOT NULL,
  failure_category TEXT NOT NULL DEFAULT 'unknown',
  recovery_probability DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  priority_score DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  recommended_action TEXT,
  ai_reasoning TEXT,
  attribution_type TEXT NOT NULL DEFAULT 'unknown',
  status TEXT NOT NULL DEFAULT 'open',
  current_step INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  attempts_made INTEGER NOT NULL DEFAULT 0,
  recovered_amount BIGINT NOT NULL DEFAULT 0,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS recovery_actions (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES recovery_cases(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  scheduled_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  result TEXT,
  result_details TEXT,
  requires_approval INTEGER NOT NULL DEFAULT 0,
  approved_by TEXT,
  ai_reasoning TEXT,
  discount_percent DOUBLE PRECISION,
  incentive_value BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  description TEXT NOT NULL,
  details TEXT,
  actor TEXT NOT NULL DEFAULT 'system',
  amount BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  customer_id TEXT REFERENCES customers(id) ON DELETE CASCADE,
  payment_id TEXT REFERENCES payments(id),
  source TEXT NOT NULL DEFAULT 'system',
  amount BIGINT NOT NULL DEFAULT 0,
  metadata TEXT,
  idempotency_key TEXT,
  processed INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dataset_runs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  filename TEXT,
  dataset_type TEXT NOT NULL DEFAULT 'mixed',
  total_records INTEGER NOT NULL DEFAULT 0,
  unique_customers INTEGER NOT NULL DEFAULT 0,
  total_volume BIGINT NOT NULL DEFAULT 0,
  revenue_at_risk BIGINT NOT NULL DEFAULT 0,
  recovered_amount BIGINT NOT NULL DEFAULT 0,
  intervention_cost BIGINT NOT NULL DEFAULT 0,
  net_recovered BIGINT NOT NULL DEFAULT 0,
  recovery_rate DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  interventions_count INTEGER NOT NULL DEFAULT 0,
  escalations_count INTEGER NOT NULL DEFAULT 0,
  stopped_count INTEGER NOT NULL DEFAULT 0,
  run_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_attempted ON payments(attempted_at);
CREATE INDEX IF NOT EXISTS idx_subscriptions_customer ON subscriptions(customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_recovery_cases_customer ON recovery_cases(customer_id);
CREATE INDEX IF NOT EXISTS idx_recovery_cases_status ON recovery_cases(status);
CREATE INDEX IF NOT EXISTS idx_recovery_cases_opened ON recovery_cases(opened_at);
CREATE INDEX IF NOT EXISTS idx_recovery_actions_case ON recovery_actions(case_id);
CREATE INDEX IF NOT EXISTS idx_recovery_actions_status ON recovery_actions(status);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_event ON audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_processed ON events(processed);
CREATE INDEX IF NOT EXISTS idx_events_customer ON events(customer_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_idempotency ON events(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_recovery_cases_payment ON recovery_cases(payment_id);
CREATE INDEX IF NOT EXISTS idx_recovery_cases_attribution ON recovery_cases(attribution_type);
CREATE INDEX IF NOT EXISTS idx_dataset_runs_created ON dataset_runs(created_at DESC);
`;
