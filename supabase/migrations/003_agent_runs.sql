-- 003_agent_runs.sql

create table if not exists agent_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  discovery_document_id uuid references discovery_documents(id) on delete set null,
  agent_name text not null,
  status text not null default 'running'
    check (status in ('running', 'complete', 'failed')),
  input jsonb,
  output jsonb,
  confidence float,
  flags jsonb default '[]'::jsonb,
  error text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

-- Indexes
create index if not exists idx_agent_runs_project_status
  on agent_runs (project_id, status);

-- RLS
alter table agent_runs enable row level security;

create policy "Users can view agent runs for their projects"
  on agent_runs for select
  using (
    project_id in (
      select id from projects where owner_id = auth.uid()::text
    )
  );

create policy "Users can insert agent runs for their projects"
  on agent_runs for insert
  with check (
    project_id in (
      select id from projects where owner_id = auth.uid()::text
    )
  );

create policy "Users can update agent runs for their projects"
  on agent_runs for update
  using (
    project_id in (
      select id from projects where owner_id = auth.uid()::text
    )
  );
