-- Tabela para rastreamento de tokens (input/output) por chamada LLM
create table if not exists agent_token_usage (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  agent_id uuid references agents(id) on delete cascade,
  conversation_id uuid,
  message_role text, -- 'dispatcher' | 'conversational' | 'single' | 'dual_provider'
  model text,
  provider text,
  prompt_tokens int default 0,
  completion_tokens int default 0,
  total_tokens int default 0,
  metadata jsonb -- {tool_calls, iteration, dispatcher, conversational, etc}
);

create index if not exists idx_token_usage_agent on agent_token_usage(agent_id);
create index if not exists idx_token_usage_conversation on agent_token_usage(conversation_id);
create index if not exists idx_token_usage_created on agent_token_usage(created_at desc);

-- RLS
alter table agent_token_usage enable row level security;

create policy "Service role full access on agent_token_usage"
  on agent_token_usage for all
  to service_role
  using (true)
  with check (true);

create policy "Authenticated users can read token usage"
  on agent_token_usage for select
  to authenticated
  using (true);
