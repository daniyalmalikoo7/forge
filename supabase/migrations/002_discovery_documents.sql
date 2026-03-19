-- 002_discovery_documents.sql

create table if not exists discovery_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  version integer not null default 1,
  status text not null default 'draft'
    check (status in ('draft', 'pending_review', 'approved', 'sealed', 'superseded')),
  document jsonb not null,
  overall_confidence float,
  has_blockers boolean default true,
  created_at timestamptz not null default now(),
  sealed_at timestamptz,
  unique (project_id, version)
);

-- Indexes
create index if not exists idx_discovery_documents_project_version
  on discovery_documents (project_id, version);

-- RLS
alter table discovery_documents enable row level security;

create policy "Users can view discovery documents for their projects"
  on discovery_documents for select
  using (
    project_id in (
      select id from projects where owner_id = auth.uid()::text
    )
  );

create policy "Users can insert discovery documents for their projects"
  on discovery_documents for insert
  with check (
    project_id in (
      select id from projects where owner_id = auth.uid()::text
    )
  );

create policy "Users can update discovery documents for their projects"
  on discovery_documents for update
  using (
    project_id in (
      select id from projects where owner_id = auth.uid()::text
    )
  );
