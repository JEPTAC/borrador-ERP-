-- ============================================================
-- EI ERP NOVA V7 · ACTIVACIÓN OPERATIVA SUPABASE + GOOGLE DRIVE
-- Ejecutar DESPUÉS del esquema e importación de CSV.
-- No contiene claves secretas.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- CONVERSIONES SEGURAS
-- ------------------------------------------------------------
create or replace function public.erp_try_timestamptz(p_value text)
returns timestamptz language plpgsql immutable as $$
begin
  if p_value is null or btrim(p_value)='' then return null; end if;
  return p_value::timestamptz;
exception when others then return null;
end $$;

create or replace function public.erp_try_numeric(p_value text)
returns numeric language plpgsql immutable as $$
begin
  if p_value is null or btrim(p_value)='' then return null; end if;
  return replace(p_value,',','.')::numeric;
exception when others then return null;
end $$;

create or replace function public.erp_try_integer(p_value text)
returns integer language plpgsql immutable as $$
begin
  if p_value is null or btrim(p_value)='' then return null; end if;
  return regexp_replace(p_value,'[^0-9-]','','g')::integer;
exception when others then return null;
end $$;

create or replace function public.erp_try_bigint(p_value text)
returns bigint language plpgsql immutable as $$
begin
  if p_value is null or btrim(p_value)='' then return null; end if;
  return regexp_replace(p_value,'[^0-9-]','','g')::bigint;
exception when others then return null;
end $$;

create or replace function public.erp_try_boolean(p_value text, p_default boolean default false)
returns boolean language plpgsql immutable as $$
begin
  if p_value is null or btrim(p_value)='' then return p_default; end if;
  return lower(btrim(p_value)) in ('true','1','yes','si','sí','ok','active','activo');
end $$;


create or replace function public.erp_try_date(p_value text)
returns date language plpgsql immutable as $$
begin
  if p_value is null or btrim(p_value)='' then return null; end if;
  return p_value::date;
exception when others then return null;
end $$;

create or replace function public.erp_try_time(p_value text)
returns time language plpgsql immutable as $$
begin
  if p_value is null or btrim(p_value)='' then return null; end if;
  return p_value::time;
exception when others then return null;
end $$;

create or replace function public.erp_jsonb_array(p_value jsonb)
returns jsonb language sql immutable as $$
  select case when jsonb_typeof(p_value)='array' then p_value else '[]'::jsonb end
$$;

create or replace function public.erp_jsonb_object(p_value jsonb)
returns jsonb language sql immutable as $$
  select case when jsonb_typeof(p_value)='object' then p_value else '{}'::jsonb end
$$;

create or replace function public.erp_jsonb_contains_text(p_value jsonb,p_text text)
returns boolean language sql immutable as $$
  select case jsonb_typeof(p_value)
    when 'array' then exists(select 1 from jsonb_array_elements_text(p_value) x where lower(x)=lower(coalesce(p_text,'')))
    when 'string' then lower(trim(both '"' from p_value::text))=lower(coalesce(p_text,''))
    when 'object' then public.erp_try_boolean(p_value->>p_text,false)
    else false end
$$;

-- ------------------------------------------------------------
-- IDENTIDAD Y ROLES
-- ------------------------------------------------------------
create or replace function public.erp_current_profile()
returns public.profiles
language sql stable security definer set search_path=public
as $$
  select p from public.profiles p
  where p.auth_user_id=auth.uid() and p.active=true
  limit 1
$$;

create or replace function public.erp_current_user_key()
returns text language sql stable security definer set search_path=public
as $$ select p.firebase_uid from public.profiles p where p.auth_user_id=auth.uid() and p.active=true limit 1 $$;

-- Alias temporal: conserva compatibilidad con identificadores históricos. No conecta Firebase.
create or replace function public.erp_current_firebase_uid()
returns text language sql stable security definer set search_path=public
as $$ select public.erp_current_user_key() $$;

create or replace function public.erp_current_role()
returns text language sql stable security definer set search_path=public
as $$ select lower(coalesce(p.role_code,'')) from public.profiles p where p.auth_user_id=auth.uid() and p.active=true limit 1 $$;

create or replace function public.erp_role_group(p_role text default null)
returns text language sql immutable as $$
select case lower(coalesce(p_role,''))
  when 'super_admin' then 'admin' when 'super_administrador' then 'admin' when 'admin' then 'admin' when 'administrador' then 'admin'
  when 'gerencia' then 'management' when 'gerente' then 'management' when 'manager' then 'management'
  when 'auditoria' then 'audit' when 'auditor' then 'audit'
  when 'ventas' then 'sales' when 'asesor_ventas' then 'sales' when 'asesor' then 'sales' when 'comercial' then 'sales' when 'ejecutivo_comercial' then 'sales'
  when 'cartera' then 'credit' when 'jefe_cartera' then 'credit' when 'analista_cartera' then 'credit' when 'credito' then 'credit' when 'creditos' then 'credit' when 'analista_credito' then 'credit' when 'coordinador_cartera' then 'credit'
  when 'compras' then 'purchases'
  when 'recepcion' then 'reception' when 'recepcion_mercancia' then 'reception'
  when 'corte' then 'cut' when 'operador_corte' then 'cut'
  when 'facturacion' then 'billing'
  when 'caja' then 'cash'
  when 'despacho' then 'dispatch' when 'despachos' then 'dispatch'
  when 'proyectos' then 'projects'
  when 'calidad' then 'quality'
  when 'mantenimiento' then 'maintenance'
  when 'coordinador_logistico' then 'logistics' when 'jefe_logistica' then 'logistics' when 'lider_logistico' then 'logistics' when 'lider_logistica' then 'logistics' when 'auxiliar_logistico' then 'logistics' when 'logistica' then 'logistics'
  else 'user' end
$$;

create or replace function public.erp_is_admin()
returns boolean language sql stable security definer set search_path=public
as $$ select public.erp_role_group(public.erp_current_role())='admin' $$;


create or replace function public.erp_collection_write_allowed(p_collection text,p_group text)
returns boolean language sql immutable as $$
  select case
    when p_group in ('admin','management') then true
    when p_collection in ('recepciones_mercancia','recepcion_stickers') then p_group in ('purchases','reception','logistics')
    when p_collection='proyectos_pedidos' then p_group in ('projects','logistics')
    when p_collection='erp_master_data' then p_group in ('logistics','purchases')
    when p_collection like 'inventory_%' then p_group in ('logistics','reception','cut')
    when p_collection like 'planning_%' then p_group in ('logistics','purchases')
    when p_collection like 'quality_%' then p_group in ('quality','logistics','reception')
    when p_collection like 'maintenance_%' then p_group='maintenance'
    when p_collection in ('erp_security_findings','erp_sod_rules','erp_continuity_checks') then p_group='audit'
    else false end
$$;

create or replace function public.erp_collection_read_allowed(p_collection text,p_group text)
returns boolean language sql immutable as $$
  select case
    when p_group in ('admin','management','audit') then true
    when p_collection in ('recepciones_mercancia','recepcion_stickers') then p_group in ('purchases','reception','logistics')
    when p_collection='proyectos_pedidos' then p_group in ('projects','logistics')
    when p_collection='erp_master_data' then p_group in ('logistics','purchases','reception','cut','billing','cash','dispatch')
    when p_collection like 'inventory_%' then p_group in ('logistics','reception','cut','purchases')
    when p_collection like 'planning_%' then p_group in ('logistics','purchases','sales')
    when p_collection like 'quality_%' then p_group in ('quality','logistics','reception')
    when p_collection like 'maintenance_%' then p_group='maintenance'
    when p_collection='erp_domain_events' then p_group in ('logistics','purchases','reception','cut','billing','cash','credit','dispatch','projects','quality','maintenance')
    else false end
$$;

create or replace function public.erp_can_read_case(
  p_process text,p_created_uid text,p_created_email text,p_created_name text,
  p_assigned_uid text,p_assigned_email text,p_assigned_name text,p_assigned_role text,
  p_sales_advisor text,p_raw jsonb
)
returns boolean language plpgsql stable security definer set search_path=public as $$
declare
  v_profile public.profiles%rowtype;
  v_group text;
  v_role text;
  v_uid text;
  v_process text:=public.erp_normalize_key(p_process);
  v_assigned_group text:=public.erp_role_group(p_assigned_role);
begin
  select * into v_profile from public.profiles where auth_user_id=auth.uid() and active=true limit 1;
  if not found then return false; end if;
  v_role:=lower(coalesce(v_profile.role_code,''));
  v_group:=public.erp_role_group(v_role);
  v_uid:=v_profile.firebase_uid;
  if v_group in ('admin','management','audit','logistics') then return true; end if;

  if lower(coalesce(p_created_uid,''))=lower(v_uid)
    or lower(coalesce(p_assigned_uid,''))=lower(v_uid)
    or lower(coalesce(p_created_email,''))=lower(coalesce(v_profile.email,''))
    or lower(coalesce(p_assigned_email,''))=lower(coalesce(v_profile.email,''))
    or lower(coalesce(p_created_name,''))=lower(coalesce(v_profile.display_name,''))
    or lower(coalesce(p_assigned_name,''))=lower(coalesce(v_profile.display_name,''))
    or lower(coalesce(p_sales_advisor,'')) in (lower(coalesce(v_profile.email,'')),lower(coalesce(v_profile.display_name,''))) then return true;
  end if;

  if v_assigned_group=v_group then return true; end if;
  if public.erp_jsonb_contains_text(p_raw->'visibleRoles',v_role)
    or public.erp_jsonb_contains_text(p_raw->'visibleRoles',v_group)
    or public.erp_jsonb_contains_text(p_raw->'targetRoles',v_role)
    or public.erp_jsonb_contains_text(p_raw->'targetRoles',v_group)
    or public.erp_jsonb_contains_text(p_raw->'assignedUserIds',v_uid) then return true;
  end if;

  return case v_group
    when 'sales' then v_process in ('ventas','comercial','crear_pedido')
    when 'credit' then v_process='cartera'
    when 'purchases' then v_process='compras'
    when 'reception' then v_process in ('recepcion_pedidos','reception_goods','recepcion_mercancia')
    when 'cut' then v_process='corte_cable'
    when 'billing' then v_process='facturacion'
    when 'cash' then v_process='caja'
    when 'dispatch' then v_process in ('cliente_punto','cliente_recoge','despacho_local','despacho_nacional','cierre_despacho_nacional','cierre_caso')
    when 'projects' then v_process='proyectos' or upper(coalesce(p_raw->>'orderKind',''))='PROYECTO'
    else false end;
end $$;

create or replace function public.erp_case_id_visible(p_case_id text)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.cases c where c.case_id=p_case_id and public.erp_can_read_case(
      c.current_process,c.created_by_uid,c.created_by_email,c.created_by_name,
      c.assigned_uid,c.assigned_email,c.assigned_name,c.assigned_role,c.sales_advisor,c.raw_data)
  )
$$;

create or replace function public.erp_can_write_case(p_existing jsonb,p_new jsonb)
returns boolean language plpgsql stable security definer set search_path=public as $$
declare
  v_profile public.profiles%rowtype;
  v_group text;
  v_uid text;
  v_email text;
  v_process text:=public.erp_normalize_key(coalesce(p_existing->>'currentProcess',p_existing->>'process',p_new->>'currentProcess',p_new->>'process'));
  v_owner boolean;
begin
  select * into v_profile from public.profiles where auth_user_id=auth.uid() and active=true limit 1;
  if not found then return false; end if;
  v_group:=public.erp_role_group(v_profile.role_code);v_uid:=v_profile.firebase_uid;v_email:=lower(coalesce(v_profile.email,''));
  if v_group in ('admin','management','logistics') then return true; end if;
  v_owner:=lower(coalesce(p_existing->>'createdBy',p_existing->>'createdByUid',p_new->>'createdBy',p_new->>'createdByUid',''))=lower(v_uid)
    or lower(coalesce(p_existing->>'createdByEmail',p_new->>'createdByEmail',''))=v_email
    or lower(coalesce(p_existing->>'salesAdvisor',p_new->>'salesAdvisor','')) in (v_email,lower(coalesce(v_profile.display_name,'')));
  if p_existing is null or p_existing='null'::jsonb then return v_group in ('sales','projects'); end if;
  if v_group in ('sales','projects') and v_owner then return true; end if;
  return case v_group
    when 'purchases' then v_process='compras'
    when 'reception' then v_process in ('recepcion_pedidos','reception_goods','recepcion_mercancia')
    when 'cut' then v_process='corte_cable'
    when 'billing' then v_process='facturacion'
    when 'cash' then v_process='caja'
    when 'credit' then v_process='cartera'
    when 'dispatch' then v_process in ('cliente_punto','cliente_recoge','despacho_local','despacho_nacional','cierre_despacho_nacional','cierre_caso')
    else false end;
end $$;

-- ------------------------------------------------------------
-- DOCUMENTOS GENÉRICOS PARA MÓDULOS SIN TABLA NORMALIZADA
-- ------------------------------------------------------------
create table if not exists public.erp_documents (
  collection_name text not null,
  document_id text not null,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_uid text,
  updated_by_uid text,
  primary key(collection_name,document_id)
);
create index if not exists idx_erp_documents_collection_updated on public.erp_documents(collection_name,updated_at desc);
create index if not exists idx_erp_documents_raw_gin on public.erp_documents using gin(raw_data jsonb_path_ops);
alter table public.erp_documents enable row level security;
drop policy if exists erp_documents_active_read on public.erp_documents;
create policy erp_documents_active_read on public.erp_documents for select to authenticated using (public.is_active_erp_user() and public.erp_collection_read_allowed(collection_name,public.erp_role_group(public.erp_current_role())));
grant select on public.erp_documents to authenticated;

-- ------------------------------------------------------------
-- SOLICITUDES DE CRÉDITO EN SUPABASE; DOCUMENTOS FÍSICOS EN DRIVE
-- ------------------------------------------------------------
create table if not exists public.credit_requests (
  request_id text primary key,
  request_code text unique,
  status text not null default 'DRAFT',
  created_by_uid text not null,
  created_by_auth_uid uuid references auth.users(id) on delete set null,
  created_by_name text,
  created_by_email text,
  company_name text,
  contact_name text,
  contact_phone text,
  company_address text,
  landline text,
  requested_amount numeric,
  requested_term text,
  document_count integer not null default 0,
  completeness integer not null default 0,
  documents jsonb not null default '{}'::jsonb,
  review_checklist jsonb not null default '{}'::jsonb,
  decision_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  review_started_at timestamptz,
  decided_at timestamptz,
  reviewed_by_uid text,
  reviewed_by_name text,
  raw_data jsonb not null default '{}'::jsonb
);
create index if not exists idx_credit_requests_owner on public.credit_requests(created_by_uid,created_at desc);
create index if not exists idx_credit_requests_status on public.credit_requests(status,updated_at desc);

create table if not exists public.credit_request_events (
  event_id text primary key,
  request_id text not null references public.credit_requests(request_id) on delete cascade,
  event_type text not null,
  detail text,
  created_by_uid text,
  created_by_name text,
  created_by_role text,
  created_at timestamptz not null default now(),
  raw_data jsonb not null default '{}'::jsonb
);
create index if not exists idx_credit_events_request_time on public.credit_request_events(request_id,created_at desc);

alter table public.credit_requests enable row level security;
alter table public.credit_request_events enable row level security;
drop policy if exists credit_requests_read on public.credit_requests;
create policy credit_requests_read on public.credit_requests for select to authenticated using (
  public.is_active_erp_user() and (
    public.erp_role_group(public.erp_current_role()) in ('admin','management','audit','credit')
    or created_by_uid=public.erp_current_user_key()
  )
);
drop policy if exists credit_events_read on public.credit_request_events;
create policy credit_events_read on public.credit_request_events for select to authenticated using (
  exists(select 1 from public.credit_requests r where r.request_id=credit_request_events.request_id)
);
grant select on public.credit_requests,public.credit_request_events to authenticated;

-- ------------------------------------------------------------
-- CONTRATO DE FLUJO Y VALIDACIONES SERVIDORAS
-- ------------------------------------------------------------
create or replace function public.erp_normalize_key(p_value text)
returns text language sql immutable as $$
  select trim(both '_' from regexp_replace(
    translate(lower(coalesce(p_value,'')),
      'áéíóúüñ /-',
      'aeiouun___'),
    '_+','_','g'))
$$;

create or replace function public.erp_is_terminal_status(p_status text)
returns boolean language sql immutable as $$
  select public.erp_normalize_key(p_status)=any(array[
    'cerrado','cerrado_conforme','cerrado_con_novedad','finalizado','cancelado','anulado'
  ])
$$;

create or replace function public.erp_known_process(p_process text)
returns boolean language sql immutable as $$
  select public.erp_normalize_key(p_process)=any(array[
    'compras','cartera','caja','recepcion_pedidos','alistamiento','corte_cable',
    'facturacion','cliente_punto','cliente_recoge','despacho_local','despacho_nacional',
    'cierre_despacho_nacional','cierre_caso','proyectos','reception_goods'
  ])
$$;

create or replace function public.erp_transition_allowed(p_from text,p_to text)
returns boolean language sql immutable as $$
  with x as (
    select public.erp_normalize_key(p_from) as f, public.erp_normalize_key(p_to) as t
  )
  select case
    when f=t then true
    when f='' then true
    when f='compras' and t='recepcion_pedidos' then true
    when f='cartera' and t in ('compras','recepcion_pedidos') then true
    when f='caja' and t in ('cliente_punto','cliente_recoge','despacho_local','despacho_nacional') then true
    when f='recepcion_pedidos' and t='alistamiento' then true
    when f='alistamiento' and t in ('corte_cable','facturacion') then true
    when f='corte_cable' and t='alistamiento' then true
    when f='facturacion' and t in ('caja','cliente_punto','cliente_recoge','despacho_local','despacho_nacional') then true
    when f in ('cliente_punto','cliente_recoge','despacho_local') and t='cierre_caso' then true
    when f='despacho_nacional' and t in ('cierre_despacho_nacional','cierre_caso') then true
    when f='cierre_despacho_nacional' and t='cierre_caso' then true
    when f='proyectos' and t='recepcion_pedidos' then true
    else false end
  from x
$$;

create or replace function public.erp_pending_cuts(p_data jsonb)
returns integer language sql immutable as $$
  select coalesce(count(*) filter (
    where public.erp_normalize_key(x->>'status') not in (
      'finalizado','terminado','completado','cerrado','cancelado','no_aplica',
      'no_aplica_medida_completa','no_aplica_no_necesita_corte'
    )
  ),0)::integer
  from jsonb_array_elements(
    case when jsonb_typeof(coalesce(p_data->'cutRequests','[]'::jsonb))='array'
         then coalesce(p_data->'cutRequests','[]'::jsonb) else '[]'::jsonb end
  ) x
$$;

create or replace function public.erp_validate_case_change(
  p_existing jsonb,
  p_new jsonb,
  p_is_admin boolean default false
)
returns jsonb language plpgsql stable set search_path=public as $$
declare
  v_from text:=public.erp_normalize_key(coalesce(p_existing->>'currentProcess',p_existing->>'process'));
  v_to text:=public.erp_normalize_key(coalesce(p_new->>'currentProcess',p_new->>'process'));
  v_status text:=public.erp_normalize_key(p_new->>'status');
  v_kind text:=upper(coalesce(p_new->>'orderKind',p_new->>'tipoPedido',p_new->>'orderType',''));
  v_errors jsonb:='[]'::jsonb;
  v_released boolean:=coalesce(public.erp_try_boolean(p_new->>'purchaseReleased'),false)
    or coalesce(public.erp_try_boolean(p_new#>>'{purchaseFlow,released}'),false)
    or coalesce(nullif(p_new#>>'{purchaseFlow,releasedAt}',''),'')<>'';
begin
  if v_to='' and not public.erp_is_terminal_status(v_status) then
    v_errors:=v_errors||jsonb_build_array('El pedido no tiene proceso actual.');
  elsif v_to<>'' and not public.erp_known_process(v_to) then
    v_errors:=v_errors||jsonb_build_array('Proceso no reconocido: '||v_to||'.');
  end if;

  if p_existing is not null and v_from<>v_to and not public.erp_transition_allowed(v_from,v_to) then
    if not (p_is_admin and coalesce(public.erp_try_boolean(p_new->>'flowOverride'),false)
      and coalesce(btrim(p_new->>'flowOverrideReason'),'')<>'') then
      v_errors:=v_errors||jsonb_build_array('Transición no autorizada: '||coalesce(v_from,'')||' → '||coalesce(v_to,'')||'.');
    end if;
  end if;

  if v_kind='PVE' and v_to='recepcion_pedidos' and v_from<>'compras' and not v_released then
    v_errors:=v_errors||jsonb_build_array('El pedido PVE debe ser liberado por Compras antes de Recepción.');
  end if;

  if v_to='facturacion' and public.erp_pending_cuts(p_new)>0 then
    v_errors:=v_errors||jsonb_build_array('El pedido tiene cortes pendientes y no puede pasar a Facturación.');
  end if;

  if public.erp_is_terminal_status(v_status)
    and coalesce(p_new->>'closedAt',p_new->>'cancelledAt','')=''
    and v_status not in ('cancelado','anulado') then
    v_errors:=v_errors||jsonb_build_array('Un pedido cerrado debe registrar fecha de cierre.');
  end if;

  return jsonb_build_object('ok',jsonb_array_length(v_errors)=0,'errors',v_errors,'fromProcess',v_from,'toProcess',v_to);
end $$;

-- ------------------------------------------------------------
-- ACTUALIZAR/REFRESCAR UN PEDIDO Y SUS COMPONENTES NORMALIZADOS
-- ------------------------------------------------------------
create or replace function public.erp_upsert_case(p_case_id text,p_payload jsonb,p_merge boolean default true)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_existing jsonb;
  v_existing_process text;
  v_existing_status text;
  v_existing_revision integer:=0;
  v_new_process text;
  v_new_status text;
  v_validation jsonb;
  v_data jsonb;
  v_item jsonb;
  v_key text;
  v_value jsonb;
  v_ord bigint;
  v_event_id text;
begin
  select raw_data,current_process,status,coalesce(public.erp_try_integer(raw_data->>'flowRevision'),0)
    into v_existing,v_existing_process,v_existing_status,v_existing_revision
    from public.cases where case_id=p_case_id for update;
  v_data:=case when p_merge then coalesce(v_existing,'{}'::jsonb)||coalesce(p_payload,'{}'::jsonb) else coalesce(p_payload,'{}'::jsonb) end;
  v_data:=jsonb_set(v_data,'{id}',to_jsonb(p_case_id),true);
  v_new_process:=coalesce(v_data->>'currentProcess',v_data->>'process');
  v_new_status:=v_data->>'status';

  if v_existing is not null and public.erp_try_integer(p_payload->>'flowRevision') is not null
    and public.erp_try_integer(p_payload->>'flowRevision')<>v_existing_revision then
    raise exception 'El pedido cambió mientras estaba abierto. Recargue la información antes de guardar.' using errcode='40001';
  end if;
  if not public.erp_can_write_case(v_existing,v_data) then
    raise exception 'Su rol no puede modificar este pedido en el proceso actual.' using errcode='42501';
  end if;

  -- El servidor serializa la modificación, incrementa revisión y valida el contrato de flujo.
  v_validation:=public.erp_validate_case_change(v_existing,v_data,public.erp_is_admin());
  if not coalesce((v_validation->>'ok')::boolean,false) then
    raise exception '%',array_to_string(array(select jsonb_array_elements_text(v_validation->'errors')),' ') using errcode='23514';
  end if;

  if public.erp_is_terminal_status(v_new_status) and coalesce(v_data->>'closedAt',v_data->>'cancelledAt','')='' then
    if public.erp_normalize_key(v_new_status) in ('cancelado','anulado') then
      v_data:=jsonb_set(v_data,'{cancelledAt}',to_jsonb(now()),true);
    else
      v_data:=jsonb_set(v_data,'{closedAt}',to_jsonb(now()),true);
    end if;
  end if;
  v_data:=jsonb_set(v_data,'{flowRevision}',to_jsonb(v_existing_revision+1),true);
  v_data:=jsonb_set(v_data,'{lastServerWriteAt}',to_jsonb(now()),true);

  insert into public.cases(
    case_id,source_path,reference,order_kind,case_type,client,description,purchase_order,payment_condition,delivery_type,priority,status,current_process,procedure_code,sales_advisor,
    created_by_uid,created_by_name,created_by_email,assigned_to,assigned_uid,assigned_name,assigned_email,assigned_role,requested_delivery,has_cuts,total_requirements,billing_type,tipo_pedido,
    parent_case_id,partial_sequence,is_partial_shipment,has_partial_shipment,partial_shipment_open,pending_delivery_type,exclude_from_kpi,exclude_from_vsm,cancellation_status,cancellation_reason,
    wait_started_at,dead_started_at,active_started_at,created_at,updated_at,closed_at,cancelled_at,raw_data
  ) values (
    p_case_id,'cases/'||p_case_id,coalesce(v_data->>'reference',v_data->>'orderNumber',p_case_id),coalesce(v_data->>'orderKind',v_data->>'order_kind'),coalesce(v_data->>'type',v_data->>'caseType'),v_data->>'client',v_data->>'description',v_data->>'purchaseOrder',v_data->>'paymentCondition',v_data->>'deliveryType',v_data->>'priority',v_data->>'status',v_data->>'currentProcess',v_data->>'procedureCode',v_data->>'salesAdvisor',
    coalesce(v_data->>'createdBy',v_data->>'createdByUid'),v_data->>'createdByName',v_data->>'createdByEmail',v_data->>'assignedTo',v_data->>'assignedUid',v_data->>'assignedName',v_data->>'assignedEmail',v_data->>'assignedRole',v_data->>'requestedDelivery',public.erp_try_boolean(v_data->>'hasCuts'),public.erp_try_integer(v_data->>'totalRequirements'),v_data->>'billingType',v_data->>'tipoPedido',
    v_data->>'parentCaseId',public.erp_try_integer(v_data->>'partialSequence'),public.erp_try_boolean(v_data->>'isPartialShipment'),public.erp_try_boolean(v_data->>'hasPartialShipment'),public.erp_try_boolean(v_data->>'partialShipmentOpen'),v_data->>'pendingDeliveryType',public.erp_try_boolean(v_data->>'excludeFromKpi'),public.erp_try_boolean(v_data->>'excludeFromVsm'),coalesce(v_data->>'cancellationStatus',v_data->>'cancelStatus'),v_data->>'cancellationReason',
    public.erp_try_timestamptz(v_data->>'waitStartedAt'),public.erp_try_timestamptz(v_data->>'deadStartedAt'),public.erp_try_timestamptz(v_data->>'activeStartedAt'),coalesce(public.erp_try_timestamptz(v_data->>'createdAt'),now()),coalesce(public.erp_try_timestamptz(v_data->>'updatedAt'),now()),public.erp_try_timestamptz(v_data->>'closedAt'),public.erp_try_timestamptz(v_data->>'cancelledAt'),v_data
  ) on conflict(case_id) do update set
    reference=excluded.reference,order_kind=excluded.order_kind,case_type=excluded.case_type,client=excluded.client,description=excluded.description,purchase_order=excluded.purchase_order,payment_condition=excluded.payment_condition,
    delivery_type=excluded.delivery_type,priority=excluded.priority,status=excluded.status,current_process=excluded.current_process,procedure_code=excluded.procedure_code,sales_advisor=excluded.sales_advisor,
    created_by_uid=excluded.created_by_uid,created_by_name=excluded.created_by_name,created_by_email=excluded.created_by_email,assigned_to=excluded.assigned_to,assigned_uid=excluded.assigned_uid,assigned_name=excluded.assigned_name,
    assigned_email=excluded.assigned_email,assigned_role=excluded.assigned_role,requested_delivery=excluded.requested_delivery,has_cuts=excluded.has_cuts,total_requirements=excluded.total_requirements,billing_type=excluded.billing_type,
    tipo_pedido=excluded.tipo_pedido,parent_case_id=excluded.parent_case_id,partial_sequence=excluded.partial_sequence,is_partial_shipment=excluded.is_partial_shipment,has_partial_shipment=excluded.has_partial_shipment,
    partial_shipment_open=excluded.partial_shipment_open,pending_delivery_type=excluded.pending_delivery_type,exclude_from_kpi=excluded.exclude_from_kpi,exclude_from_vsm=excluded.exclude_from_vsm,cancellation_status=excluded.cancellation_status,
    cancellation_reason=excluded.cancellation_reason,wait_started_at=excluded.wait_started_at,dead_started_at=excluded.dead_started_at,active_started_at=excluded.active_started_at,updated_at=excluded.updated_at,closed_at=excluded.closed_at,cancelled_at=excluded.cancelled_at,raw_data=excluded.raw_data;

  delete from public.case_items where case_id=p_case_id;
  for v_item,v_ord in select value,ordinality from jsonb_array_elements(public.erp_jsonb_array(coalesce(v_data->'orderItems',v_data->'items'))) with ordinality loop
    insert into public.case_items(case_id,item_id,item_index,reference,description,quantity_text,quantity_numeric,unit,item_status,requires_cut,preparation_status,location,observation,source_requested_qty,source_pending_before,raw_data)
    values(p_case_id,coalesce(v_item->>'id',v_item->>'itemId','ITEM_'||v_ord),v_ord::integer-1,coalesce(v_item->>'reference',v_item->>'referencia'),coalesce(v_item->>'description',v_item->>'descripcion'),coalesce(v_item->>'quantity',v_item->>'cantidad'),public.erp_try_numeric(coalesce(v_item->>'quantity',v_item->>'cantidad')),coalesce(v_item->>'unit',v_item->>'unidad'),coalesce(v_item->>'status',v_item->>'itemStatus'),public.erp_try_boolean(coalesce(v_item->>'requiresCut',v_item->>'requiereCorte')),coalesce(v_item->>'alistamientoStatus',v_item->>'preparationStatus'),coalesce(v_item->>'location',v_item->>'ubicacion'),coalesce(v_item->>'observation',v_item->>'observacion'),v_item->>'sourceRequestedQty',v_item->>'sourcePendingBefore',v_item);
  end loop;

  delete from public.case_state_history where case_id=p_case_id;
  for v_item,v_ord in select value,ordinality from jsonb_array_elements(public.erp_jsonb_array(v_data->'stateHistory')) with ordinality loop
    v_event_id:=coalesce(v_item->>'id','ST_'||md5(p_case_id||':'||v_ord||':'||coalesce(v_item->>'timestamp','')));
    insert into public.case_state_history(case_id,state_id,sequence_no,timestamp,started_at,ended_at,process_code,process_name,state_type,status,detail,responsible_uid,responsible_name,responsible_role,from_process,to_process,reason,raw_data)
    values(p_case_id,v_event_id,v_ord::integer,coalesce(public.erp_try_timestamptz(v_item->>'timestamp'),public.erp_try_timestamptz(v_item->>'fecha_hora_inicio_estado')),coalesce(public.erp_try_timestamptz(v_item->>'startedAt'),public.erp_try_timestamptz(v_item->>'fecha_hora_inicio_estado')),coalesce(public.erp_try_timestamptz(v_item->>'endedAt'),public.erp_try_timestamptz(v_item->>'fecha_hora_fin_estado')),coalesce(v_item->>'process',v_item->>'processCode'),v_item->>'processName',coalesce(v_item->>'type',v_item->>'tipo_estado'),v_item->>'status',v_item->>'detail',v_item->>'responsibleUid',v_item->>'responsibleName',v_item->>'responsibleRole',v_item->>'fromProcess',v_item->>'toProcess',v_item->>'reason',v_item);
  end loop;

  delete from public.case_process_stats where case_id=p_case_id;
  for v_key,v_value in select key,value from jsonb_each(public.erp_jsonb_object(v_data->'processStats')) loop
    insert into public.case_process_stats(case_id,process_code,started_at,completed_at,active_ms,wait_ms,dead_ms,handoffs,responsibles,raw_data)
    values(p_case_id,v_key,public.erp_try_timestamptz(v_value->>'startedAt'),public.erp_try_timestamptz(v_value->>'completedAt'),coalesce(public.erp_try_bigint(v_value->>'activeMs'),0),coalesce(public.erp_try_bigint(v_value->>'waitMs'),0),coalesce(public.erp_try_bigint(v_value->>'deadMs'),0),coalesce(public.erp_try_integer(v_value->>'handoffs'),0),coalesce(v_value->'responsibles','[]'::jsonb),v_value);
  end loop;

  delete from public.case_checklist where case_id=p_case_id;
  for v_key,v_value in select key,value from jsonb_each(public.erp_jsonb_object(v_data->'checklist')) loop
    insert into public.case_checklist(case_id,checklist_item,status) values(p_case_id,v_key,trim(both '"' from v_value::text));
  end loop;

  delete from public.case_cuts where case_id=p_case_id;
  for v_item,v_ord in select value,ordinality from jsonb_array_elements(public.erp_jsonb_array(v_data->'cutRequests')) with ordinality loop
    insert into public.case_cuts(cut_id,case_id,cut_code,status,reference,description,unit,requested_meters,final_meters,available_before,projected_remaining,actual_remaining,created_at,taken_at,started_at,completed_at,finished_at,cut_date,start_time,end_time,duration_ms,customer,order_reference,warehouse,approval_required,approval_status,registered_by_uid,registered_by_name,taken_by_uid,taken_by_name,finished_by_name,raw_data)
    values(coalesce(v_item->>'id',v_item->>'cutId','CUT_'||md5(p_case_id||':'||v_ord)),p_case_id,coalesce(v_item->>'code',v_item->>'cutCode'),v_item->>'status',coalesce(v_item->>'reference',v_item->>'referencia'),coalesce(v_item->>'description',v_item->>'descripcion'),coalesce(v_item->>'unit',v_item->>'unidad'),public.erp_try_numeric(coalesce(v_item->>'requestedMeters',v_item->>'metrosSolicitados')),public.erp_try_numeric(coalesce(v_item->>'finalMeters',v_item->>'metrosFinales')),public.erp_try_numeric(coalesce(v_item->>'availableBefore',v_item->>'disponibleAntes')),public.erp_try_numeric(v_item->>'projectedRemaining'),public.erp_try_numeric(v_item->>'actualRemaining'),public.erp_try_timestamptz(v_item->>'createdAt'),public.erp_try_timestamptz(v_item->>'takenAt'),public.erp_try_timestamptz(v_item->>'startedAt'),public.erp_try_timestamptz(v_item->>'completedAt'),public.erp_try_timestamptz(v_item->>'finishedAt'),public.erp_try_date(v_item->>'cutDate'),public.erp_try_time(v_item->>'startTime'),public.erp_try_time(v_item->>'endTime'),public.erp_try_bigint(v_item->>'durationMs'),coalesce(v_item->>'customer',v_data->>'client'),coalesce(v_item->>'orderReference',v_data->>'reference'),v_item->>'warehouse',public.erp_try_boolean(v_item->>'approvalRequired'),v_item->>'approvalStatus',v_item->>'registeredByUid',v_item->>'registeredByName',v_item->>'takenByUid',v_item->>'takenByName',v_item->>'finishedByName',v_item);
  end loop;

  -- Componentes variables que deben conservarse para consultas posteriores.
  delete from public.case_components where case_id=p_case_id;
  for v_item,v_ord in select value,ordinality from jsonb_array_elements(public.erp_jsonb_array(v_data->'partialShipments')) with ordinality loop
    insert into public.case_components(case_id,component_type,component_index,component_id,created_at,component_data) values(p_case_id,'partialShipment',v_ord::integer-1,v_item->>'id',public.erp_try_timestamptz(v_item->>'createdAt'),v_item);
  end loop;
  for v_item,v_ord in select value,ordinality from jsonb_array_elements(public.erp_jsonb_array(v_data->'requirements')) with ordinality loop
    insert into public.case_components(case_id,component_type,component_index,component_id,created_at,component_data) values(p_case_id,'requirement',v_ord::integer-1,v_item->>'id',public.erp_try_timestamptz(v_item->>'createdAt'),v_item);
  end loop;
  for v_item,v_ord in select value,ordinality from jsonb_array_elements(public.erp_jsonb_array(v_data->'cutReturnAlerts')) with ordinality loop
    insert into public.case_components(case_id,component_type,component_index,component_id,created_at,component_data) values(p_case_id,'cutReturnAlert',v_ord::integer-1,v_item->>'id',public.erp_try_timestamptz(v_item->>'createdAt'),v_item);
  end loop;

  -- Aun si el cliente omite el evento, el servidor conserva el cambio de estado/proceso.
  if v_existing is null or coalesce(v_existing_process,'')<>coalesce(v_new_process,'') or coalesce(v_existing_status,'')<>coalesce(v_new_status,'') then
    v_event_id:='SRV_'||replace(gen_random_uuid()::text,'-','');
    insert into public.case_events(
      event_id,source_path,case_id,case_reference,case_client,case_status,event_type,detail,
      process_code,current_process,created_by_uid,created_by_name,created_by_role,user_id,user_name,timestamp,raw_data
    ) values (
      v_event_id,'case_events/'||v_event_id,p_case_id,coalesce(v_data->>'reference',v_data->>'orderNumber',p_case_id),v_data->>'client',v_new_status,
      case when v_existing is null then 'CASE_CREATED_SERVER' else 'CASE_SERVER_STATE_CHANGE' end,
      case when v_existing is null then 'Pedido registrado en Supabase.' else 'Cambio confirmado por servidor: '||coalesce(v_existing_process,'sin proceso')||'/'||coalesce(v_existing_status,'sin estado')||' → '||coalesce(v_new_process,'sin proceso')||'/'||coalesce(v_new_status,'sin estado') end,
      v_new_process,v_new_process,public.erp_current_user_key(),(public.erp_current_profile()).display_name,public.erp_current_role(),public.erp_current_user_key(),(public.erp_current_profile()).display_name,now(),
      jsonb_build_object('id',v_event_id,'caseId',p_case_id,'type',case when v_existing is null then 'CASE_CREATED_SERVER' else 'CASE_SERVER_STATE_CHANGE' end,'process',v_new_process,'currentProcess',v_new_process,'caseStatus',v_new_status,'timestamp',now(),'flowRevision',v_existing_revision+1)
    );
  end if;

  return v_data;
end $$;

-- ------------------------------------------------------------
-- ESCRITURA GENÉRICA CON VALIDACIÓN DE ROL
-- ------------------------------------------------------------
create or replace function public.erp_write_document(p_collection text,p_document_id text,p_payload jsonb,p_merge boolean default true)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_uid text:=public.erp_current_user_key();
  v_role text:=public.erp_current_role();
  v_group text:=public.erp_role_group(public.erp_current_role());
  v_existing jsonb;
  v_data jsonb;
  v_status text;
  v_owner text;
begin
  if v_uid is null then raise exception 'Usuario ERP no autorizado' using errcode='42501'; end if;
  if p_collection is null or p_document_id is null then raise exception 'Colección o documento inválido'; end if;

  if p_collection='cases' then
    if v_group not in ('admin','management','sales','purchases','reception','logistics','cut','billing','cash','credit','dispatch','projects') then raise exception 'Rol sin permiso para modificar pedidos' using errcode='42501'; end if;
    return public.erp_upsert_case(p_document_id,p_payload,p_merge);

  elsif p_collection='case_events' then
    insert into public.case_events(event_id,source_path,case_id,case_reference,case_client,case_status,event_type,detail,process_code,process_name,current_process,target_role,source_role,created_by_uid,created_by_name,created_by_role,user_id,user_name,assigned_to,assigned_role,timestamp,cut_id,reason,exclude_from_kpi,visible_roles,assigned_user_ids,assigned_users,raw_data)
    values(p_document_id,'case_events/'||p_document_id,p_payload->>'caseId',p_payload->>'caseReference',p_payload->>'caseClient',p_payload->>'caseStatus',coalesce(p_payload->>'type',p_payload->>'eventType','EVENT'),p_payload->>'detail',coalesce(p_payload->>'process',p_payload->>'processCode'),p_payload->>'processName',p_payload->>'currentProcess',p_payload->>'targetRole',p_payload->>'sourceRole',coalesce(p_payload->>'createdBy',v_uid),p_payload->>'createdByName',coalesce(p_payload->>'createdByRole',v_role),coalesce(p_payload->>'userId',p_payload->>'createdBy',v_uid),coalesce(p_payload->>'userName',p_payload->>'createdByName'),p_payload->>'assignedTo',p_payload->>'assignedRole',coalesce(public.erp_try_timestamptz(p_payload->>'timestamp'),public.erp_try_timestamptz(p_payload->>'createdAt'),now()),p_payload->>'cutId',p_payload->>'reason',public.erp_try_boolean(p_payload->>'excludeFromKpi'),coalesce(p_payload->'visibleRoles','[]'::jsonb),coalesce(p_payload->'assignedUserIds','[]'::jsonb),coalesce(p_payload->'assignedUsers','[]'::jsonb),p_payload)
    on conflict(event_id) do update set detail=excluded.detail,case_status=excluded.case_status,current_process=excluded.current_process,assigned_to=excluded.assigned_to,assigned_role=excluded.assigned_role,raw_data=case when p_merge then public.case_events.raw_data||excluded.raw_data else excluded.raw_data end;
    return p_payload;

  elsif p_collection='evidences' then
    insert into public.evidences(evidence_id,source_path,case_id,case_number,order_reference,client,process_code,process_name,evidence_type,file_name,mime_type,folder,drive_id,drive_url,cut_id,detail,responsible_role,created_by_uid,created_by_name,uploaded_at,created_at,raw_data)
    values(p_document_id,'evidences/'||p_document_id,p_payload->>'caseId',p_payload->>'caseNumber',p_payload->>'orderReference',p_payload->>'client',coalesce(p_payload->>'process',p_payload->>'processCode'),p_payload->>'processName',p_payload->>'evidenceType',p_payload->>'fileName',p_payload->>'mimeType',p_payload->>'folder',coalesce(p_payload->>'driveId',p_payload->>'fileId'),coalesce(p_payload->>'driveUrl',p_payload->>'url'),p_payload->>'cutId',p_payload->>'detail',p_payload->>'responsibleRole',coalesce(p_payload->>'createdBy',p_payload->>'uploadedBy',v_uid),coalesce(p_payload->>'createdByName',p_payload->>'uploadedByName'),coalesce(public.erp_try_timestamptz(p_payload->>'uploadedAt'),now()),coalesce(public.erp_try_timestamptz(p_payload->>'createdAt'),now()),p_payload)
    on conflict(evidence_id) do update set drive_id=excluded.drive_id,drive_url=excluded.drive_url,file_name=excluded.file_name,detail=excluded.detail,raw_data=case when p_merge then public.evidences.raw_data||excluded.raw_data else excluded.raw_data end;
    return p_payload;

  elsif p_collection='reportes_novedad' then
    insert into public.issue_reports(report_id,source_path,source_id,source_type,source_reference,source_module,case_client,title,description,detail,category,severity,status,process_code,process_name,created_by_uid,created_by_name,created_by_role,assigned_role,sales_advisor,managed_by_uid,managed_by_name,created_at,updated_at,visible_roles,raw_data)
    values(p_document_id,'reportes_novedad/'||p_document_id,p_payload->>'sourceId',p_payload->>'sourceType',p_payload->>'sourceReference',p_payload->>'sourceModule',coalesce(p_payload->>'caseClient',p_payload->>'client'),p_payload->>'title',p_payload->>'description',p_payload->>'detail',p_payload->>'category',p_payload->>'severity',p_payload->>'status',coalesce(p_payload->>'process',p_payload->>'processCode'),p_payload->>'processName',coalesce(p_payload->>'createdBy',v_uid),p_payload->>'createdByName',coalesce(p_payload->>'createdByRole',v_role),p_payload->>'assignedRole',p_payload->>'salesAdvisor',p_payload->>'managedBy',p_payload->>'managedByName',coalesce(public.erp_try_timestamptz(p_payload->>'createdAt'),now()),coalesce(public.erp_try_timestamptz(p_payload->>'updatedAt'),now()),coalesce(p_payload->'visibleRoles','[]'::jsonb),p_payload)
    on conflict(report_id) do update set title=excluded.title,description=excluded.description,detail=excluded.detail,status=excluded.status,managed_by_uid=excluded.managed_by_uid,managed_by_name=excluded.managed_by_name,updated_at=excluded.updated_at,visible_roles=excluded.visible_roles,raw_data=case when p_merge then public.issue_reports.raw_data||excluded.raw_data else excluded.raw_data end;
    return p_payload;

  elsif p_collection='inventario_chipas' then
    insert into public.inventory_chipas(chip_id,case_id,case_reference,cut_id,cut_code,reference,description,unit,warehouse,available_before,meters_cut,remaining,status,client,purchase_order,source,registered_by_name,created_by_name,created_at,updated_at,raw_data)
    values(p_document_id,p_payload->>'caseId',p_payload->>'caseReference',p_payload->>'cutId',p_payload->>'cutCode',coalesce(p_payload->>'reference',p_payload->>'referencia'),coalesce(p_payload->>'description',p_payload->>'descripcion'),coalesce(p_payload->>'unit',p_payload->>'unidad'),p_payload->>'warehouse',public.erp_try_numeric(p_payload->>'availableBefore'),public.erp_try_numeric(p_payload->>'metersCut'),public.erp_try_numeric(p_payload->>'remaining'),p_payload->>'status',p_payload->>'client',p_payload->>'purchaseOrder',p_payload->>'source',p_payload->>'registeredByName',p_payload->>'createdByName',coalesce(public.erp_try_timestamptz(p_payload->>'createdAt'),now()),coalesce(public.erp_try_timestamptz(p_payload->>'updatedAt'),now()),p_payload)
    on conflict(chip_id) do update set remaining=excluded.remaining,status=excluded.status,updated_at=excluded.updated_at,raw_data=case when p_merge then public.inventory_chipas.raw_data||excluded.raw_data else excluded.raw_data end;
    return p_payload;

  elsif p_collection='users' then
    if v_group<>'admin' then raise exception 'Solo administración puede modificar perfiles' using errcode='42501'; end if;
    insert into public.profiles(firebase_uid,auth_user_id,email,display_name,role_code,active,profile_exists,profile_created_at,profile_updated_at,created_by_uid,raw_profile)
    values(p_document_id,(select id from auth.users where lower(email)=lower(p_payload->>'email') limit 1),p_payload->>'email',coalesce(p_payload->>'name',p_payload->>'displayName'),coalesce(p_payload->>'role',p_payload->>'rol'),coalesce(public.erp_try_boolean(coalesce(p_payload->>'isActive',p_payload->>'active'),true),true),true,coalesce(public.erp_try_timestamptz(p_payload->>'createdAt'),now()),now(),v_uid,p_payload)
    on conflict(firebase_uid) do update set auth_user_id=coalesce(profiles.auth_user_id,excluded.auth_user_id),email=coalesce(excluded.email,profiles.email),display_name=coalesce(excluded.display_name,profiles.display_name),role_code=coalesce(excluded.role_code,profiles.role_code),active=excluded.active,profile_updated_at=now(),raw_profile=case when p_merge then profiles.raw_profile||excluded.raw_profile else excluded.raw_profile end;
    if coalesce(p_payload->>'role',p_payload->>'rol','')<>'' then
      insert into public.roles(role_code,role_name,active) values(lower(coalesce(p_payload->>'role',p_payload->>'rol')),coalesce(p_payload->>'role',p_payload->>'rol'),true) on conflict(role_code) do nothing;
      delete from public.user_roles where firebase_uid=p_document_id and is_primary=true;
      insert into public.user_roles(firebase_uid,role_code,is_primary,source) values(p_document_id,lower(coalesce(p_payload->>'role',p_payload->>'rol')),true,'EI_ERP_V7') on conflict(firebase_uid,role_code) do update set is_primary=true,source='EI_ERP_V7';
    end if;
    return p_payload;

  elsif p_collection='users_deleted_log' then
    if v_group<>'admin' then raise exception 'Solo administración puede registrar eliminaciones de usuarios' using errcode='42501'; end if;
    insert into public.deleted_users_log(log_id,user_id,email,display_name,role_code,deleted_by_uid,deleted_by_name,deleted_at,raw_data)
    values(p_document_id,p_payload->>'userId',p_payload->>'email',coalesce(p_payload->>'name',p_payload->>'displayName'),coalesce(p_payload->>'role',p_payload->>'rol'),v_uid,coalesce(p_payload->>'deletedByName',(public.erp_current_profile()).display_name),coalesce(public.erp_try_timestamptz(p_payload->>'deletedAt'),now()),p_payload)
    on conflict(log_id) do update set raw_data=excluded.raw_data;
    return p_payload;

  elsif p_collection='erp_access_events' then
    insert into public.erp_access_events(access_event_id,tenant_id,action,resource,resource_id,source,trust_level,created_by_uid,created_by_name,created_at,details,raw_data)
    values(p_document_id,coalesce(p_payload->>'tenantId','electroingenieria'),p_payload->>'action',p_payload->>'resource',p_payload->>'resourceId',coalesce(p_payload->>'source','SUPABASE_UI'),coalesce(p_payload->>'trustLevel','AUTHENTICATED'),v_uid,(public.erp_current_profile()).display_name,coalesce(public.erp_try_timestamptz(p_payload->>'createdAt'),now()),coalesce(p_payload->'details','{}'::jsonb),p_payload)
    on conflict(access_event_id) do nothing;
    return p_payload;

  elsif p_collection='credit_requests' then
    select raw_data,status,created_by_uid into v_existing,v_status,v_owner from public.credit_requests where request_id=p_document_id;
    v_data:=case when p_merge then coalesce(v_existing,'{}'::jsonb)||coalesce(p_payload,'{}'::jsonb) else coalesce(p_payload,'{}'::jsonb) end;
    v_owner:=coalesce(v_owner,v_data->>'createdBy',v_uid);
    if not (v_group in ('admin','sales') and (v_group='admin' or v_owner=v_uid)) then raise exception 'Sin permiso para editar esta solicitud' using errcode='42501'; end if;
    if v_status is not null and v_status not in ('DRAFT','RETURNED') and v_group<>'admin' then raise exception 'La solicitud ya no está editable' using errcode='42501'; end if;
    insert into public.credit_requests(request_id,request_code,status,created_by_uid,created_by_auth_uid,created_by_name,created_by_email,company_name,contact_name,contact_phone,company_address,landline,requested_amount,requested_term,document_count,completeness,documents,review_checklist,decision_reason,created_at,updated_at,submitted_at,review_started_at,decided_at,reviewed_by_uid,reviewed_by_name,raw_data)
    values(p_document_id,coalesce(v_data->>'requestCode','SCR-'||to_char(now(),'YYYYMMDD-HH24MISS')),coalesce(v_data->>'status','DRAFT'),v_owner,auth.uid(),v_data->>'createdByName',v_data->>'createdByEmail',coalesce(v_data->>'companyName',v_data->>'businessName'),v_data->>'contactName',coalesce(v_data->>'contactPhone',v_data->>'phone'),v_data->>'companyAddress',v_data->>'landline',public.erp_try_numeric(v_data->>'requestedAmount'),v_data->>'requestedTerm',coalesce(public.erp_try_integer(v_data->>'documentCount'),jsonb_object_length(coalesce(v_data->'documents','{}'::jsonb))),coalesce(public.erp_try_integer(v_data->>'completeness'),0),coalesce(v_data->'documents','{}'::jsonb),coalesce(v_data->'reviewChecklist','{}'::jsonb),v_data->>'decisionReason',coalesce(public.erp_try_timestamptz(v_data->>'createdAt'),now()),now(),public.erp_try_timestamptz(v_data->>'submittedAt'),public.erp_try_timestamptz(v_data->>'reviewStartedAt'),public.erp_try_timestamptz(v_data->>'decidedAt'),v_data->>'reviewedBy',v_data->>'reviewedByName',v_data)
    on conflict(request_id) do update set company_name=excluded.company_name,contact_name=excluded.contact_name,contact_phone=excluded.contact_phone,company_address=excluded.company_address,landline=excluded.landline,requested_amount=excluded.requested_amount,requested_term=excluded.requested_term,document_count=excluded.document_count,completeness=excluded.completeness,documents=excluded.documents,updated_at=now(),raw_data=excluded.raw_data;
    return v_data;

  elsif p_collection='credit_request_events' then
    insert into public.credit_request_events(event_id,request_id,event_type,detail,created_by_uid,created_by_name,created_by_role,created_at,raw_data)
    values(p_document_id,p_payload->>'requestId',coalesce(p_payload->>'type',p_payload->>'eventType','EVENT'),p_payload->>'detail',coalesce(p_payload->>'createdBy',v_uid),p_payload->>'createdByName',coalesce(p_payload->>'createdByRole',v_role),coalesce(public.erp_try_timestamptz(p_payload->>'createdAt'),now()),p_payload)
    on conflict(event_id) do update set detail=excluded.detail,raw_data=case when p_merge then public.credit_request_events.raw_data||excluded.raw_data else excluded.raw_data end;
    return p_payload;
  end if;

  if not public.erp_collection_write_allowed(p_collection,v_group) then
    raise exception 'Su rol no tiene permiso de escritura en el módulo solicitado.' using errcode='42501';
  end if;

  select raw_data into v_existing from public.erp_documents where collection_name=p_collection and document_id=p_document_id;
  v_data:=case when p_merge then coalesce(v_existing,'{}'::jsonb)||coalesce(p_payload,'{}'::jsonb) else coalesce(p_payload,'{}'::jsonb) end;
  insert into public.erp_documents(collection_name,document_id,raw_data,created_by_uid,updated_by_uid)
  values(p_collection,p_document_id,v_data,v_uid,v_uid)
  on conflict(collection_name,document_id) do update set raw_data=excluded.raw_data,updated_at=now(),updated_by_uid=v_uid;
  return v_data;
end $$;

create or replace function public.erp_delete_document(p_collection text,p_document_id text)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_group text:=public.erp_role_group(public.erp_current_role());
begin
  if public.erp_current_user_key() is null then raise exception 'Usuario no autorizado' using errcode='42501'; end if;
  if p_collection='cases' then
    if v_group not in ('admin','management') then raise exception 'Solo administración/gerencia puede eliminar pedidos' using errcode='42501'; end if;
    delete from public.cases where case_id=p_document_id;
  elsif p_collection='case_events' then
    if v_group<>'admin' then raise exception 'Los eventos son inmutables; solo administración puede eliminarlos' using errcode='42501'; end if;
    delete from public.case_events where event_id=p_document_id;
  elsif p_collection='evidences' then
    if v_group<>'admin' and not exists(select 1 from public.evidences where evidence_id=p_document_id and created_by_uid=public.erp_current_user_key()) then raise exception 'Solo el autor o administración puede eliminar la evidencia' using errcode='42501'; end if;
    delete from public.evidences where evidence_id=p_document_id;
  elsif p_collection='reportes_novedad' then
    if v_group not in ('admin','management') and not exists(select 1 from public.issue_reports where report_id=p_document_id and created_by_uid=public.erp_current_user_key()) then raise exception 'Sin permiso para eliminar la novedad' using errcode='42501'; end if;
    delete from public.issue_reports where report_id=p_document_id;
  elsif p_collection='inventario_chipas' then
    if v_group not in ('admin','management','logistics','cut') then raise exception 'Sin permiso para eliminar inventario de chipas' using errcode='42501'; end if;
    delete from public.inventory_chipas where chip_id=p_document_id;
  elsif p_collection='credit_requests' then
    delete from public.credit_requests where request_id=p_document_id and (v_group='admin' or (created_by_uid=public.erp_current_user_key() and status='DRAFT'));
  elsif p_collection='users' then
    if v_group<>'admin' then raise exception 'Solo administración puede desactivar perfiles' using errcode='42501'; end if;
    update public.profiles set active=false,profile_updated_at=now() where firebase_uid=p_document_id;
  else
    if not public.erp_collection_write_allowed(p_collection,v_group) then raise exception 'Sin permiso para eliminar en este módulo' using errcode='42501'; end if;
    delete from public.erp_documents where collection_name=p_collection and document_id=p_document_id;
  end if;
  return true;
end $$;

create or replace function public.erp_apply_operations(p_operations jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_op jsonb;v_results jsonb:='[]'::jsonb;v_result jsonb;
begin
  if jsonb_typeof(p_operations)<>'array' then raise exception 'p_operations debe ser un arreglo'; end if;
  for v_op in select value from jsonb_array_elements(p_operations) loop
    if lower(coalesce(v_op->>'type','set'))='delete' then
      perform public.erp_delete_document(v_op->>'collection',v_op->>'id');
      v_result:=jsonb_build_object('collection',v_op->>'collection','id',v_op->>'id','deleted',true);
    else
      v_result:=public.erp_write_document(v_op->>'collection',v_op->>'id',coalesce(v_op->'data','{}'::jsonb),coalesce((v_op->>'merge')::boolean,false));
    end if;
    v_results:=v_results||jsonb_build_array(v_result);
  end loop;
  return v_results;
end $$;

-- ------------------------------------------------------------
-- TRANSICIONES DE CRÉDITO SEGURAS
-- ------------------------------------------------------------
create or replace function public.credit_transition(p_request_id text,p_action text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_req public.credit_requests%rowtype;
  v_uid text:=public.erp_current_user_key();
  v_role text:=public.erp_current_role();
  v_group text:=public.erp_role_group(public.erp_current_role());
  v_action text:=upper(coalesce(p_action,''));
  v_status text;
  v_event text;
  v_reason text:=p_payload->>'reason';
  v_check jsonb:=coalesce(p_payload->'reviewChecklist','{}'::jsonb);
begin
  select * into v_req from public.credit_requests where request_id=p_request_id for update;
  if not found then raise exception 'Solicitud no encontrada'; end if;
  if v_action='SUBMIT' then
    if not (v_group in ('admin','sales') and (v_group='admin' or v_req.created_by_uid=v_uid)) then raise exception 'Sin permiso para enviar' using errcode='42501'; end if;
    if v_req.status not in ('DRAFT','RETURNED') then raise exception 'La solicitud no está editable'; end if;
    if v_req.document_count<15 then raise exception 'Debe cargar los 15 documentos'; end if;
    v_status:='SUBMITTED';v_event:='CREDIT_SUBMITTED';
    update public.credit_requests set status=v_status,submitted_at=now(),updated_at=now(),raw_data=raw_data||jsonb_build_object('status',v_status,'submittedAt',now()) where request_id=p_request_id;
  elsif v_action='START_REVIEW' then
    if v_group not in ('admin','credit') then raise exception 'Solo Cartera puede iniciar revisión' using errcode='42501'; end if;
    if v_req.status<>'SUBMITTED' then raise exception 'La solicitud no está enviada'; end if;
    v_status:='IN_REVIEW';v_event:='CREDIT_REVIEW_STARTED';
    update public.credit_requests set status=v_status,review_started_at=now(),reviewed_by_uid=v_uid,reviewed_by_name=(public.erp_current_profile()).display_name,updated_at=now(),raw_data=raw_data||jsonb_build_object('status',v_status,'reviewStartedAt',now()) where request_id=p_request_id;
  elsif v_action in ('RETURN','REJECT','APPROVE') then
    if v_group not in ('admin','credit') then raise exception 'Solo Cartera puede decidir' using errcode='42501'; end if;
    if v_req.status not in ('SUBMITTED','IN_REVIEW') then raise exception 'La solicitud no está pendiente de decisión'; end if;
    if v_action in ('RETURN','REJECT') and coalesce(btrim(v_reason),'')='' then raise exception 'Debe registrar el motivo'; end if;
    v_status:=case v_action when 'RETURN' then 'RETURNED' when 'REJECT' then 'REJECTED' else 'APPROVED' end;
    v_event:='CREDIT_'||v_status;
    update public.credit_requests set status=v_status,review_checklist=v_check,decision_reason=v_reason,decided_at=case when v_action in ('REJECT','APPROVE') then now() else decided_at end,reviewed_by_uid=v_uid,reviewed_by_name=(public.erp_current_profile()).display_name,updated_at=now(),raw_data=raw_data||jsonb_build_object('status',v_status,'reviewChecklist',v_check,'decisionReason',v_reason,'decidedAt',case when v_action in ('REJECT','APPROVE') then to_jsonb(now()) else 'null'::jsonb end) where request_id=p_request_id;
  else raise exception 'Acción de crédito inválida';
  end if;

  insert into public.credit_request_events(event_id,request_id,event_type,detail,created_by_uid,created_by_name,created_by_role,created_at,raw_data)
  values('CRE_'||gen_random_uuid()::text,p_request_id,v_event,coalesce(v_reason,v_event),v_uid,(public.erp_current_profile()).display_name,v_role,now(),jsonb_build_object('requestId',p_request_id,'type',v_event,'detail',coalesce(v_reason,v_event),'createdBy',v_uid,'createdByName',(public.erp_current_profile()).display_name,'createdByRole',v_role,'createdAt',now()));
  return (select to_jsonb(r) from public.credit_requests r where r.request_id=p_request_id);
end $$;

-- ------------------------------------------------------------
-- RLS POR ROL, RESPONSABLE Y PROCESO
-- Sustituye la lectura general de la etapa de migración.
-- ------------------------------------------------------------
drop policy if exists erp_active_read on public.cases;
drop policy if exists erp_cases_role_read on public.cases;
create policy erp_cases_role_read on public.cases for select to authenticated using (
  public.erp_can_read_case(current_process,created_by_uid,created_by_email,created_by_name,assigned_uid,assigned_email,assigned_name,assigned_role,sales_advisor,raw_data)
);

do $$
declare t text;
begin
  foreach t in array array['case_items','case_state_history','case_process_stats','case_checklist','case_cuts','case_components'] loop
    execute format('drop policy if exists erp_active_read on public.%I',t);
    execute format('drop policy if exists erp_case_related_read on public.%I',t);
    execute format('create policy erp_case_related_read on public.%I for select to authenticated using (public.erp_case_id_visible(case_id))',t);
  end loop;
end $$;

drop policy if exists erp_active_read on public.case_events;
drop policy if exists erp_case_events_role_read on public.case_events;
create policy erp_case_events_role_read on public.case_events for select to authenticated using (
  public.is_active_erp_user() and (
    (case_id is not null and public.erp_case_id_visible(case_id))
    or created_by_uid=public.erp_current_user_key()
    or public.erp_role_group(created_by_role)=public.erp_role_group(public.erp_current_role())
    or public.erp_jsonb_contains_text(visible_roles,public.erp_current_role())
    or public.erp_jsonb_contains_text(visible_roles,public.erp_role_group(public.erp_current_role()))
  )
);

drop policy if exists erp_active_read on public.evidences;
drop policy if exists erp_evidences_role_read on public.evidences;
create policy erp_evidences_role_read on public.evidences for select to authenticated using (
  public.is_active_erp_user() and (case_id is null or public.erp_case_id_visible(case_id) or created_by_uid=public.erp_current_user_key())
);

drop policy if exists erp_active_read on public.issue_reports;
drop policy if exists erp_issue_reports_role_read on public.issue_reports;
create policy erp_issue_reports_role_read on public.issue_reports for select to authenticated using (
  public.is_active_erp_user() and (
    public.erp_role_group(public.erp_current_role()) in ('admin','management','audit')
    or created_by_uid=public.erp_current_user_key()
    or managed_by_uid=public.erp_current_user_key()
    or public.erp_role_group(assigned_role)=public.erp_role_group(public.erp_current_role())
    or public.erp_jsonb_contains_text(visible_roles,public.erp_current_role())
    or public.erp_jsonb_contains_text(visible_roles,public.erp_role_group(public.erp_current_role()))
  )
);

drop policy if exists erp_active_read on public.issue_report_comments;
drop policy if exists erp_issue_comments_role_read on public.issue_report_comments;
create policy erp_issue_comments_role_read on public.issue_report_comments for select to authenticated using (
  exists(select 1 from public.issue_reports r where r.report_id=issue_report_comments.report_id)
);

drop policy if exists erp_active_read on public.inventory_chipas;
drop policy if exists erp_chip_inventory_role_read on public.inventory_chipas;
create policy erp_chip_inventory_role_read on public.inventory_chipas for select to authenticated using (
  public.is_active_erp_user() and public.erp_role_group(public.erp_current_role()) in ('admin','management','audit','logistics','reception','cut','purchases')
);

drop policy if exists erp_active_read on public.erp_access_events;
drop policy if exists erp_access_role_read on public.erp_access_events;
create policy erp_access_role_read on public.erp_access_events for select to authenticated using (
  public.is_active_erp_user() and (public.erp_role_group(public.erp_current_role()) in ('admin','management','audit') or created_by_uid=public.erp_current_user_key())
);

-- ------------------------------------------------------------
-- AUDITORÍA Y VSM EXTENDIDO
-- ------------------------------------------------------------
create or replace view public.v_vsm_timeline_complete with (security_invoker=true) as
select * from public.v_vsm_timeline
union all
select c.case_id,c.reference,c.order_kind,c.client,coalesce(c.created_at,c.updated_at) as occurred_at,c.current_process,null::text as process_name,'CASE_SNAPSHOT'::text as movement_type,'Estado actual: '||coalesce(c.status,'') as detail,c.assigned_uid,c.assigned_name,c.assigned_role,'cases'::text as source,c.case_id as source_id
from public.cases c;

grant select on public.v_vsm_timeline_complete to authenticated;

-- Funciones de escritura: la app usa la clave publicable y el JWT del usuario.
grant execute on function public.erp_apply_operations(jsonb) to authenticated;
grant execute on function public.erp_write_document(text,text,jsonb,boolean) to authenticated;
grant execute on function public.erp_delete_document(text,text) to authenticated;
grant execute on function public.credit_transition(text,text,jsonb) to authenticated;
grant execute on function public.erp_current_user_key() to authenticated;
grant execute on function public.erp_current_firebase_uid() to authenticated;
grant execute on function public.erp_current_role() to authenticated;
grant execute on function public.erp_case_id_visible(text) to authenticated;
grant execute on function public.erp_can_read_case(text,text,text,text,text,text,text,text,text,jsonb) to authenticated;

-- Realtime para tablas centrales. Si ya están publicadas, se ignora el error.
do $$ begin
  alter publication supabase_realtime add table public.cases;
exception when duplicate_object then null; when undefined_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.case_events;
exception when duplicate_object then null; when undefined_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.credit_requests;
exception when duplicate_object then null; when undefined_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.issue_reports;
exception when duplicate_object then null; when undefined_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.erp_documents;
exception when duplicate_object then null; when undefined_object then null; end $$;

-- ------------------------------------------------------------
-- GUARDIÁN DE INTEGRIDAD: DETECTA PEDIDOS COLGADOS SIN ALTERARLOS
-- ------------------------------------------------------------
create table if not exists public.erp_flow_health (
  case_id text primary key references public.cases(case_id) on delete cascade,
  reference text,
  current_process text,
  current_status text,
  assigned_role text,
  assigned_name text,
  health_status text not null default 'OK',
  issue_count integer not null default 0,
  critical_count integer not null default 0,
  high_count integer not null default 0,
  issues jsonb not null default '[]'::jsonb,
  business_age_hours numeric not null default 0,
  limit_hours numeric,
  evaluated_at timestamptz not null default now()
);
create index if not exists idx_erp_flow_health_status on public.erp_flow_health(health_status,evaluated_at desc);
alter table public.erp_flow_health enable row level security;
drop policy if exists erp_flow_health_read on public.erp_flow_health;
create policy erp_flow_health_read on public.erp_flow_health for select to authenticated using (public.is_active_erp_user() and public.erp_case_id_visible(case_id));
grant select on public.erp_flow_health to authenticated;

create or replace function public.erp_process_sla_hours(p_process text)
returns numeric language sql immutable as $$
  select case public.erp_normalize_key(p_process)
    when 'compras' then 24
    when 'cartera' then 16
    when 'caja' then 8
    when 'recepcion_pedidos' then 8
    when 'alistamiento' then 16
    when 'corte_cable' then 16
    when 'facturacion' then 8
    when 'cliente_punto' then 8
    when 'cliente_recoge' then 8
    when 'despacho_local' then 16
    when 'despacho_nacional' then 24
    when 'cierre_despacho_nacional' then 8
    else 24 end
$$;

create or replace function public.erp_scan_flow_health()
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  c public.cases%rowtype;
  v_issues jsonb;
  v_process text;
  v_status text;
  v_age numeric;
  v_limit numeric;
  v_critical integer;
  v_high integer;
  v_checked integer:=0;
  v_attention integer:=0;
begin
  if not public.is_active_erp_user() then raise exception 'Usuario ERP no autorizado' using errcode='42501'; end if;
  if public.erp_role_group(public.erp_current_role()) not in ('admin','management','audit','logistics') then
    return jsonb_build_object('checked',0,'attention',0,'skipped',true,'reason','El guardián global se ejecuta desde Logística, Auditoría, Gerencia o Administración.');
  end if;

  for c in select * from public.cases loop
    v_checked:=v_checked+1;
    v_issues:='[]'::jsonb;
    v_process:=public.erp_normalize_key(c.current_process);
    v_status:=public.erp_normalize_key(c.status);
    v_limit:=public.erp_process_sla_hours(v_process);
    v_age:=round(coalesce(public.business_seconds_between(coalesce(c.active_started_at,c.wait_started_at,c.dead_started_at,c.updated_at,c.created_at),now()),0)/3600.0,2);

    if not public.erp_is_terminal_status(v_status) then
      if v_process='' then v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','MISSING_PROCESS','severity','CRITICAL','message','Pedido abierto sin proceso actual.')); end if;
      if v_process<>'' and not public.erp_known_process(v_process) then v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','UNKNOWN_PROCESS','severity','CRITICAL','message','Proceso no reconocido: '||v_process)); end if;
      if coalesce(c.assigned_role,c.assigned_to,c.assigned_uid,c.assigned_name,'')='' then v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','UNASSIGNED_OPEN_CASE','severity','HIGH','message','Pedido abierto sin responsable.')); end if;
      if upper(coalesce(c.order_kind,c.tipo_pedido,''))='PVE' and v_process='recepcion_pedidos'
        and not (coalesce(public.erp_try_boolean(c.raw_data->>'purchaseReleased'),false)
          or coalesce(c.raw_data#>>'{purchaseFlow,releasedAt}','')<>'') then
        v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','PVE_BYPASSED_PURCHASES','severity','CRITICAL','message','PVE en Recepción sin liberación de Compras.'));
      end if;
      if v_process='facturacion' and public.erp_pending_cuts(c.raw_data)>0 then v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','BILLING_WITH_PENDING_CUTS','severity','CRITICAL','message','Facturación con cortes pendientes.')); end if;
      if v_process='corte_cable' and public.erp_pending_cuts(c.raw_data)=0 then v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','CUT_FINISHED_NOT_RETURNED','severity','HIGH','message','Corte terminado sin retorno a Alistamiento.')); end if;
      if v_age>v_limit then v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','PROCESS_SLA_EXCEEDED','severity','HIGH','message','Superó el SLA de '||v_limit||' horas hábiles.')); end if;
      if v_status in ('en_espera','espera_ventas','espera_transportadora','pendiente_gerencia','no_entregado','devolucion_caja')
        and c.wait_started_at is null
        and coalesce(c.raw_data->>'waitReason',c.raw_data#>>'{openRequirement,reason}','')='' then
        v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','WAIT_WITHOUT_CONTEXT','severity','HIGH','message','Espera sin motivo o fecha de inicio.'));
      end if;
    elsif c.closed_at is null and c.cancelled_at is null then
      v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','CLOSED_WITHOUT_DATE','severity','HIGH','message','Estado terminal sin fecha de cierre.'));
    end if;

    select count(*) filter(where x->>'severity'='CRITICAL'),count(*) filter(where x->>'severity'='HIGH')
      into v_critical,v_high from jsonb_array_elements(v_issues) x;
    if jsonb_array_length(v_issues)>0 then v_attention:=v_attention+1; end if;

    insert into public.erp_flow_health(case_id,reference,current_process,current_status,assigned_role,assigned_name,health_status,issue_count,critical_count,high_count,issues,business_age_hours,limit_hours,evaluated_at)
    values(c.case_id,c.reference,c.current_process,c.status,c.assigned_role,c.assigned_name,
      case when v_critical>0 then 'CRITICAL' when jsonb_array_length(v_issues)>0 then 'ATTENTION' else 'OK' end,
      jsonb_array_length(v_issues),v_critical,v_high,v_issues,v_age,v_limit,now())
    on conflict(case_id) do update set reference=excluded.reference,current_process=excluded.current_process,current_status=excluded.current_status,assigned_role=excluded.assigned_role,assigned_name=excluded.assigned_name,health_status=excluded.health_status,issue_count=excluded.issue_count,critical_count=excluded.critical_count,high_count=excluded.high_count,issues=excluded.issues,business_age_hours=excluded.business_age_hours,limit_hours=excluded.limit_hours,evaluated_at=excluded.evaluated_at;
  end loop;

  delete from public.erp_flow_health h where not exists(select 1 from public.cases c2 where c2.case_id=h.case_id);
  return jsonb_build_object('checked',v_checked,'attention',v_attention,'evaluatedAt',now());
end $$;
grant execute on function public.erp_scan_flow_health() to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.erp_flow_health;
exception when duplicate_object then null; when undefined_object then null; end $$;

create or replace view public.v_vsm_flow_health with (security_invoker=true) as
select h.*,c.order_kind,c.client,c.created_at,c.updated_at
from public.erp_flow_health h join public.cases c on c.case_id=h.case_id
where h.issue_count>0
order by h.critical_count desc,h.high_count desc,h.business_age_hours desc;
grant select on public.v_vsm_flow_health to authenticated;

select 'EI ERP Nova V7 · Supabase + Google Drive operativo' as resultado,
       (select count(*) from public.cases) as pedidos,
       (select count(*) from public.profiles where active) as usuarios_activos;
