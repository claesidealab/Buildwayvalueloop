-- Buildway Loop: Postgres schema draft (phase 1). Not applied yet.
-- Every tenant-owned table carries workspace_id and is protected by row-level security.

create table workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

create table users (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique,
  name        text not null,
  is_buildway boolean not null default false
);

create type member_role as enum ('advisor', 'customer_admin', 'process_owner', 'viewer');

create table memberships (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id      uuid not null references users(id) on delete cascade,
  role         member_role not null,
  primary key (workspace_id, user_id)
);

create type process_stage as enum ('not_started', 'find', 'build', 'run');
create type gate_status as enum ('red', 'amber', 'green');

create table processes (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  name          text not null,
  template_id   text,                -- e.g. 'customer-service'
  template_ver  text,
  unit          text not null default 'case',
  stage         process_stage not null default 'not_started',
  gate          gate_status not null default 'red',
  owner_id      uuid references users(id),
  created_at    timestamptz not null default now()
);

create type rating as enum ('low', 'medium', 'high');

create table steps (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references workspaces(id) on delete cascade,
  process_id       uuid not null references processes(id) on delete cascade,
  key              text not null,     -- stable id from the template, e.g. 'resolve'
  name             text not null,
  description      text not null default '',
  position         int not null,
  minutes_per_case numeric(8,2) not null,
  fit_volume       rating not null,
  fit_rule_based   rating not null,
  fit_data_ready   rating not null,
  fit_error_risk   rating not null,
  unique (process_id, key)
);

-- A design is a versioned to-be: autonomy per step plus assumptions.
create table designs (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  process_id    uuid not null references processes(id) on delete cascade,
  version       int not null,
  assumptions   jsonb not null,       -- matches domain type Assumptions
  created_by    uuid references users(id),
  created_at    timestamptz not null default now(),
  unique (process_id, version)
);

create table design_steps (
  design_id  uuid not null references designs(id) on delete cascade,
  step_id    uuid not null references steps(id) on delete cascade,
  autonomy   smallint not null check (autonomy between 0 and 4),
  is_system  boolean not null default false,
  primary key (design_id, step_id)
);

-- Approved value cases. Immutable once written.
create table baselines (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  process_id    uuid not null references processes(id) on delete cascade,
  design_id     uuid not null references designs(id),
  net_value_sek numeric(14,0) not null,
  low_sek       numeric(14,0) not null,
  high_sek      numeric(14,0) not null,
  approved_by   uuid not null references users(id),
  approved_at   timestamptz not null default now()
);

-- Actuals: monthly (or finer) metric values per process, optionally per step.
create table actuals (
  id            bigserial primary key,
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  process_id    uuid not null references processes(id) on delete cascade,
  step_id       uuid references steps(id) on delete cascade,
  metric        text not null,        -- e.g. 'resolved_without_human', 'escalation_rate', 'cost_per_case'
  period_start  date not null,
  value         numeric not null,
  source        text not null,        -- 'csv', 'zendesk', 'servicenow', 'otel'
  unique (process_id, step_id, metric, period_start, source)
);

create table audit_log (
  id            bigserial primary key,
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  actor_id      uuid references users(id),
  action        text not null,        -- e.g. 'design.level_changed', 'baseline.approved'
  subject       jsonb not null,
  at            timestamptz not null default now()
);

-- Row-level security (sketch): the app sets app.workspace_id per request.
alter table processes enable row level security;
create policy tenant_isolation on processes using (workspace_id = current_setting('app.workspace_id')::uuid);
-- Repeat for steps, designs, baselines, actuals and audit_log.
