CREATE TABLE IF NOT EXISTS customer_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_phone text NOT NULL,
  agent_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  result text NOT NULL CHECK (result IN ('no_answer', 'callback', 'not_interested', 'interested', 'order_obtained')),
  notes text,
  next_followup_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_followups_phone ON customer_followups(customer_phone);
CREATE INDEX IF NOT EXISTS idx_customer_followups_agent_id ON customer_followups(agent_id);
CREATE INDEX IF NOT EXISTS idx_customer_followups_created_at ON customer_followups(created_at);
