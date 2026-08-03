begin;
create extension if not exists pgcrypto;
create extension if not exists citext;

create table if not exists public.migration_runs (
  id uuid primary key default gen_random_uuid(),
  source_system text not null default 'firebase',
  source_project text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'running',
  manifest jsonb not null default '{}'::jsonb,
  notes text
);

create table if not exists public.firestore_documents (
  document_path text primary key,
  parent_path text,
  collection_name text not null,
  document_id text not null,
  payload jsonb not null default '{}'::jsonb,
  firebase_create_time timestamptz,
  firebase_update_time timestamptz,
  source_hash text,
  source_project text not null,
  migrated_at timestamptz not null default now(),
  migration_version integer not null default 2
);
create index if not exists firestore_documents_collection_idx on public.firestore_documents(collection_name, document_id);
create index if not exists firestore_documents_parent_idx on public.firestore_documents(parent_path);
create index if not exists firestore_documents_payload_gin on public.firestore_documents using gin(payload jsonb_path_ops);

create table if not exists public.storage_migration_map (
  source_bucket text not null,
  source_path text not null,
  target_bucket text not null,
  target_path text not null,
  source_hash text,
  metadata jsonb not null default '{}'::jsonb,
  migrated_at timestamptz not null default now(),
  primary key (source_bucket, source_path)
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  firebase_uid text unique,
  legacy_profile_id text,
  email citext unique,
  full_name text,
  role text not null default 'consulta',
  is_active boolean not null default true,
  tenant_id text not null default 'electroingenieria',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists profiles_role_idx on public.profiles(role, is_active);

create table if not exists public.business_calendar (
  work_date date primary key,
  is_workday boolean not null,
  morning_start time not null default '07:00',
  morning_end time not null default '12:00',
  afternoon_start time not null default '13:40',
  afternoon_end time not null default '17:30',
  description text,
  source text not null default 'system'
);

create or replace function public.json_first_text(p jsonb, variadic keys text[])
returns text language plpgsql immutable as $$
declare k text; v text;
begin
  foreach k in array keys loop
    v := nullif(trim(p->>k), '');
    if v is not null then return v; end if;
  end loop;
  return null;
end $$;

create or replace function public.json_timestamp(p jsonb, variadic keys text[])
returns timestamptz language plpgsql immutable as $$
declare k text; v jsonb; t text;
begin
  foreach k in array keys loop
    v := p->k;
    if v is null then continue; end if;
    if jsonb_typeof(v) = 'object' and v->>'__type' = 'timestamp' then t := v->>'value'; else t := trim(both '"' from v::text); end if;
    begin return t::timestamptz; exception when others then null; end;
  end loop;
  return null;
end $$;

create or replace function public.refresh_migrated_profiles()
returns integer language plpgsql security definer set search_path = public, auth as $$
declare affected integer := 0; step_count integer := 0;
begin
  insert into public.profiles(id, firebase_uid, email, full_name, role, is_active, metadata)
  select
    u.id,
    u.raw_user_meta_data->>'firebase_uid',
    u.email,
    coalesce(u.raw_user_meta_data->>'display_name', u.email),
    coalesce(u.raw_user_meta_data->'firebase_custom_claims'->>'role', u.raw_user_meta_data->'firebase_custom_claims'->>'rol', 'consulta'),
    coalesce((u.banned_until is null or u.banned_until < now()), true),
    u.raw_user_meta_data
  from auth.users u
  where u.raw_user_meta_data->>'migrated_from' = 'firebase'
  on conflict (id) do update set
    firebase_uid = excluded.firebase_uid, email = excluded.email, full_name = excluded.full_name,
    role = excluded.role, is_active = excluded.is_active, metadata = excluded.metadata, updated_at = now();
  get diagnostics step_count = row_count; affected := affected + step_count;

  insert into public.profiles(id, firebase_uid, legacy_profile_id, email, full_name, role, is_active, metadata)
  select
    u.id,
    coalesce(u.raw_user_meta_data->>'firebase_uid', d.payload->>'uid', d.document_id),
    d.document_id,
    coalesce(u.email, d.payload->>'email', case when position('@' in d.document_id) > 0 then d.document_id end),
    coalesce(d.payload->>'name', d.payload->>'displayName', d.payload->>'fullName', u.raw_user_meta_data->>'display_name', u.email),
    coalesce(d.payload->>'role', d.payload->>'rol', d.payload->>'userRole', 'consulta'),
    coalesce(nullif(d.payload->>'isActive','')::boolean, nullif(d.payload->>'active','')::boolean, true),
    d.payload
  from public.firestore_documents d
  join auth.users u on lower(u.email) = lower(coalesce(d.payload->>'email', case when position('@' in d.document_id) > 0 then d.document_id end))
  where d.collection_name in ('users','usuarios','profiles')
  on conflict (id) do update set
    firebase_uid = excluded.firebase_uid, legacy_profile_id = excluded.legacy_profile_id, email = excluded.email,
    full_name = excluded.full_name, role = excluded.role, is_active = excluded.is_active,
    metadata = excluded.metadata, updated_at = now();
  get diagnostics step_count = row_count; affected := affected + step_count;
  return affected;
end $$;

create or replace view public.vsm_cases as
select
  document_path,
  document_id as case_id,
  public.json_first_text(payload, 'orderNumber','order_number','pedido','caseNumber','number') as order_number,
  public.json_first_text(payload, 'orderType','type','tipoPedido','pedidoType') as order_type,
  public.json_first_text(payload, 'customerName','clientName','cliente','customer') as customer_name,
  public.json_first_text(payload, 'status','estado','currentStatus') as status,
  public.json_first_text(payload, 'process','proceso','currentProcess','stage') as process,
  public.json_first_text(payload, 'responsibleName','assignedToName','responsable','ownerName') as responsible_name,
  public.json_timestamp(payload, 'createdAt','created_at','creationDate') as created_at,
  coalesce(public.json_timestamp(payload, 'updatedAt','updated_at','lastUpdate'), firebase_update_time) as updated_at,
  payload
from public.firestore_documents
where collection_name in ('cases','pedidos','orders')
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active);

create or replace view public.vsm_events as
select
  document_path,
  document_id as event_id,
  parent_path,
  public.json_first_text(payload, 'caseId','orderId','pedidoId') as case_id,
  public.json_first_text(payload, 'eventType','type','tipo') as event_type,
  public.json_first_text(payload, 'fromStatus','previousStatus','estadoAnterior') as from_status,
  public.json_first_text(payload, 'toStatus','status','newStatus','estadoNuevo') as to_status,
  public.json_first_text(payload, 'process','proceso','stage') as process,
  public.json_first_text(payload, 'actorName','userName','responsibleName','usuario') as actor_name,
  public.json_timestamp(payload, 'createdAt','timestamp','at','date') as occurred_at,
  payload
from public.firestore_documents
where collection_name in ('case_events','events','eventos')
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active);

create or replace view public.vsm_process_intervals as
select
  document_path,
  document_id as interval_id,
  public.json_first_text(payload, 'caseId','orderId','pedidoId') as case_id,
  public.json_first_text(payload, 'process','proceso','stage') as process,
  public.json_first_text(payload, 'responsibleName','actorName','usuario') as responsible_name,
  public.json_timestamp(payload, 'startedAt','startAt','start','inicio') as started_at,
  public.json_timestamp(payload, 'endedAt','endAt','end','fin') as ended_at,
  nullif(public.json_first_text(payload, 'businessSeconds','workingSeconds','segundosHabiles'),'')::numeric as business_seconds,
  payload
from public.firestore_documents
where collection_name in ('case_process_intervals','process_intervals','intervalos_proceso')
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active);

alter table public.firestore_documents enable row level security;
alter table public.storage_migration_map enable row level security;
alter table public.profiles enable row level security;
alter table public.business_calendar enable row level security;

revoke all on public.firestore_documents from anon;
revoke all on public.storage_migration_map from anon;
grant select on public.vsm_cases, public.vsm_events, public.vsm_process_intervals to authenticated;
grant select on public.profiles, public.business_calendar to authenticated;

create policy "profiles_select_self_or_admin" on public.profiles for select to authenticated
using (id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','super_admin','auditoria','gerencia')));

commit;
