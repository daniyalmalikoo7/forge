-- 001_initial.sql — projects table

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  owner_id text not null,
  problem_statement text not null default '',
  status text not null default 'created'
    check (status in ('created', 'exploring', 'explored', 'designing', 'designed', 'building', 'built')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_projects_owner_id on projects (owner_id);
create index if not exists idx_projects_slug on projects (slug);

-- RLS
alter table projects enable row level security;

create policy "Users can view their own projects"
  on projects for select
  using (owner_id = auth.uid()::text);

create policy "Users can insert their own projects"
  on projects for insert
  with check (owner_id = auth.uid()::text);

create policy "Users can update their own projects"
  on projects for update
  using (owner_id = auth.uid()::text);

create policy "Users can delete their own projects"
  on projects for delete
  using (owner_id = auth.uid()::text);

-- Auto-update updated_at
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger projects_updated_at
  before update on projects
  for each row
  execute function update_updated_at();
