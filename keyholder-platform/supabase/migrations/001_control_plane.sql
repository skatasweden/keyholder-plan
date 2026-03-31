-- =============================================
-- KEYHOLDER Control Plane Schema
-- =============================================

-- Customers (KEYHOLDER users)
CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid UNIQUE NOT NULL,
  email text UNIQUE NOT NULL,
  company_name text,
  org_number text,
  plan text NOT NULL DEFAULT 'starter',
  created_at timestamptz DEFAULT now()
);

-- Customer Supabase projects
CREATE TABLE customer_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  supabase_project_ref text NOT NULL,
  supabase_url text NOT NULL,
  supabase_anon_key text NOT NULL,
  supabase_service_key_encrypted text NOT NULL,
  region text DEFAULT 'eu-central-1',
  status text NOT NULL DEFAULT 'provisioning'
    CHECK (status IN ('provisioning', 'active', 'suspended', 'error')),
  created_at timestamptz DEFAULT now()
);

-- Credit system
CREATE TABLE credit_balances (
  customer_id uuid PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
  credits_remaining integer NOT NULL DEFAULT 0,
  credits_used_total integer NOT NULL DEFAULT 0,
  plan_credits_monthly integer NOT NULL DEFAULT 20,
  next_reset_at timestamptz NOT NULL DEFAULT (now() + interval '30 days')
);

CREATE TABLE credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  amount integer NOT NULL,
  reason text NOT NULL
    CHECK (reason IN ('chat_turn', 'monthly_reset', 'purchase', 'initial_grant', 'custom_page', 'edge_function')),
  chat_message_id uuid,
  tokens_in integer,
  tokens_out integer,
  created_at timestamptz DEFAULT now()
);

-- Jobs (provisioning, SIE import, etc.)
CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  job_type text NOT NULL
    CHECK (job_type IN ('provision', 'sie_import', 'seed_kontoplan', 'deploy_edge_function')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  progress_pct integer DEFAULT 0,
  progress_message text,
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  created_at timestamptz DEFAULT now()
);

-- Chat messages (for context persistence)
CREATE TABLE chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content text NOT NULL,
  tool_calls jsonb,
  tokens_in integer,
  tokens_out integer,
  credits_used numeric(6,2),
  created_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Policies: users can only see their own data
CREATE POLICY "users_own_data" ON customers
  FOR ALL TO authenticated
  USING (auth_user_id = auth.uid());

CREATE POLICY "users_own_projects" ON customer_projects
  FOR ALL TO authenticated
  USING (customer_id IN (
    SELECT id FROM customers WHERE auth_user_id = auth.uid()
  ));

CREATE POLICY "users_own_credits" ON credit_balances
  FOR ALL TO authenticated
  USING (customer_id IN (
    SELECT id FROM customers WHERE auth_user_id = auth.uid()
  ));

CREATE POLICY "users_own_credit_txns" ON credit_transactions
  FOR ALL TO authenticated
  USING (customer_id IN (
    SELECT id FROM customers WHERE auth_user_id = auth.uid()
  ));

CREATE POLICY "users_own_jobs" ON jobs
  FOR ALL TO authenticated
  USING (customer_id IN (
    SELECT id FROM customers WHERE auth_user_id = auth.uid()
  ));

CREATE POLICY "users_own_messages" ON chat_messages
  FOR ALL TO authenticated
  USING (customer_id IN (
    SELECT id FROM customers WHERE auth_user_id = auth.uid()
  ));

-- Indexes
CREATE INDEX idx_jobs_customer_status ON jobs(customer_id, status);
CREATE INDEX idx_chat_messages_customer ON chat_messages(customer_id, created_at);
CREATE INDEX idx_credit_transactions_customer ON credit_transactions(customer_id, created_at);

-- Deduct credits function (atomic)
CREATE OR REPLACE FUNCTION deduct_credits(
  p_customer_id uuid,
  p_amount integer,
  p_reason text,
  p_tokens_in integer DEFAULT NULL,
  p_tokens_out integer DEFAULT NULL,
  p_chat_message_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_remaining integer;
BEGIN
  UPDATE credit_balances
  SET credits_remaining = credits_remaining - p_amount,
      credits_used_total = credits_used_total + p_amount
  WHERE customer_id = p_customer_id
    AND credits_remaining >= p_amount
  RETURNING credits_remaining INTO v_remaining;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient credits';
  END IF;

  INSERT INTO credit_transactions (customer_id, amount, reason, tokens_in, tokens_out, chat_message_id)
  VALUES (p_customer_id, -p_amount, p_reason, p_tokens_in, p_tokens_out, p_chat_message_id);

  RETURN v_remaining;
END;
$$;
