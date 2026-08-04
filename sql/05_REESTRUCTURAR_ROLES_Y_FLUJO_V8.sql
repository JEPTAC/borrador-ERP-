-- ============================================================================
-- EI ERP NOVA V8 · REESTRUCTURACIÓN POR ROLES EXACTOS Y MÁQUINA DE ESTADOS
-- Ejecutar DESPUÉS de 00_ACTIVAR_TODO_EI_ERP_V7.sql y 04_DIAGNOSTICO_Y_RUTAS_LOGISTICAS.sql.
-- No contiene claves. Endurece RLS, roles, comentarios, solicitudes y transiciones.
-- ============================================================================

begin;
create extension if not exists pgcrypto;

-- --------------------------------------------------------------------------
-- 1. Roles exactos. Se eliminan grupos genéricos como logistics/billing/dispatch.
-- --------------------------------------------------------------------------
create or replace function public.erp_exact_role(p_role text default null)
returns text language sql immutable as $$
select case public.erp_normalize_key(coalesce(p_role,''))
  when 'admin' then 'super_admin'
  when 'administrador' then 'super_admin'
  when 'super_administrador' then 'super_admin'
  when 'superadministrador' then 'super_admin'
  when 'gerente' then 'gerencia'
  when 'asesor' then 'ventas'
  when 'asesor_ventas' then 'ventas'
  when 'comercial' then 'ventas'
  when 'auxiliar_logistica' then 'aux_logistica'
  when 'auxiliar_de_logistica' then 'aux_logistica'
  when 'aux_logistico' then 'aux_logistica'
  when 'corte' then 'auxiliar_corte'
  when 'operador_corte' then 'auxiliar_corte'
  when 'lider_recepcion' then 'recepcion_mercancia'
  when 'recepcion' then 'recepcion_mercancia'
  when 'jefe_logistico' then 'jefe_logistica'
  when 'auditor' then 'auditoria'
  when 'despacho' then 'despacho_nacional'
  when 'despachos' then 'despacho_nacional'
  when 'auxiliar_despacho' then 'despacho_nacional'
  else public.erp_normalize_key(coalesce(p_role,''))
end
$$;

create or replace function public.erp_current_exact_role()
returns text language sql stable security definer set search_path=public
as $$ select public.erp_exact_role(public.erp_current_role()) $$;

create or replace function public.erp_role_group(p_role text default null)
returns text language sql immutable as $$
select case public.erp_exact_role(p_role)
  when 'super_admin' then 'admin'
  when 'gerencia' then 'management'
  when 'jefe_logistica' then 'logistics_manager'
  when 'ventas' then 'sales'
  when 'compras' then 'purchases'
  when 'aux_logistica' then 'picking'
  when 'auxiliar_corte' then 'cut'
  when 'despacho_nacional' then 'national_dispatch'
  when 'coordinador_logistico' then 'local_dispatch'
  when 'caja' then 'cash'
  when 'cartera' then 'credit'
  when 'recepcion_mercancia' then 'goods_reception'
  when 'auditoria' then 'audit'
  else 'user' end
$$;

-- Migración explícita de los responsables actuales.
update public.profiles
set role_code='despacho_nacional',
    raw_profile=coalesce(raw_profile,'{}'::jsonb)||jsonb_build_object(
      'role','despacho_nacional','deliveryGroup','national_delivery',
      'deliveryRoutes',jsonb_build_array('despacho_nacional','cierre_despacho_nacional'),
      'primaryDeliveryOwner',true,'v8MigratedAt',now()
    ),
    profile_updated_at=now()
where lower(email)='j.laverde@ei.com.co';

update public.profiles
set role_code='coordinador_logistico',
    raw_profile=coalesce(raw_profile,'{}'::jsonb)||jsonb_build_object(
      'role','coordinador_logistico','deliveryGroup','local_delivery',
      'deliveryRoutes',jsonb_build_array('cliente_punto','cliente_recoge','despacho_local'),
      'primaryDeliveryOwner',true,'v8MigratedAt',now()
    ),
    profile_updated_at=now()
where lower(email)='d.diaz@ei.com.co';

update public.profiles
set role_code='recepcion_mercancia',
    raw_profile=coalesce(raw_profile,'{}'::jsonb)||jsonb_build_object('role','recepcion_mercancia','v8MigratedAt',now()),
    profile_updated_at=now()
where lower(email)='a.mendoza@ei.com.co';

-- --------------------------------------------------------------------------
-- 2. Ruta, identidad y propiedad comercial.
-- --------------------------------------------------------------------------
create or replace function public.erp_case_route(p_data jsonb)
returns text language sql immutable as $$
with v as (
  select public.erp_normalize_key(coalesce(
    p_data->>'pendingDeliveryType',p_data->>'requestedDelivery',p_data->>'deliveryType',''
  )) as x,
  lower(coalesce(p_data->>'pendingDeliveryType',p_data->>'requestedDelivery',p_data->>'deliveryType','')) as raw
)
select case
  when x in ('cliente_punto','cliente_en_punto') then 'cliente_punto'
  when x='cliente_recoge' then 'cliente_recoge'
  when x='despacho_local' then 'despacho_local'
  when x in ('despacho_nacional','cierre_despacho_nacional') then 'despacho_nacional'
  when raw ~ 'nacional|transportadora|gu[ií]a|flete' then 'despacho_nacional'
  when raw ~ 'local|domicilio|direcci[oó]n' then 'despacho_local'
  when raw ~ 'recoge' then 'cliente_recoge'
  when raw ~ 'punto' then 'cliente_punto'
  else '' end
from v
$$;

create or replace function public.erp_case_route_owner(p_data jsonb)
returns text language sql immutable as $$
select case public.erp_case_route(p_data)
  when 'cliente_punto' then 'coordinador_logistico'
  when 'cliente_recoge' then 'coordinador_logistico'
  when 'despacho_local' then 'coordinador_logistico'
  when 'despacho_nacional' then 'despacho_nacional'
  else '' end
$$;

create or replace function public.erp_current_identity_matches(p_data jsonb)
returns boolean language plpgsql stable security definer set search_path=public as $$
declare p public.profiles%rowtype; uid text; email text; name text;
begin
 select * into p from public.profiles where auth_user_id=auth.uid() and active=true limit 1;
 if not found then return false; end if;
 uid:=lower(coalesce(p.firebase_uid,''));email:=lower(coalesce(p.email,''));name:=lower(coalesce(p.display_name,''));
 return lower(coalesce(p_data->>'assignedUid',p_data->>'assignedTo',''))=uid
   or lower(coalesce(p_data->>'assignedEmail',''))=email
   or lower(coalesce(p_data->>'assignedName',''))=name
   or public.erp_jsonb_contains_text(p_data->'assignedUserIds',p.firebase_uid)
   or public.erp_jsonb_contains_text(p_data->'assignedUserIds',p.email)
   or public.erp_jsonb_contains_text(p_data->'assignedUserIds',p.auth_user_id::text);
end $$;

create or replace function public.erp_current_sales_owns(p_data jsonb)
returns boolean language plpgsql stable security definer set search_path=public as $$
declare p public.profiles%rowtype;
begin
 select * into p from public.profiles where auth_user_id=auth.uid() and active=true limit 1;
 if not found then return false; end if;
 return lower(coalesce(p_data->>'createdBy',p_data->>'createdByUid',''))=lower(coalesce(p.firebase_uid,''))
   or lower(coalesce(p_data->>'createdByEmail',''))=lower(coalesce(p.email,''))
   or lower(coalesce(p_data->>'salesAdvisor','')) in (lower(coalesce(p.email,'')),lower(coalesce(p.display_name,'')));
end $$;

-- --------------------------------------------------------------------------
-- 3. Contrato de procesos y transiciones V8.
-- --------------------------------------------------------------------------
create or replace function public.erp_is_terminal_status(p_status text)
returns boolean language sql immutable as $$
select public.erp_normalize_key(p_status)=any(array[
  'cerrado','cerrado_conforme','cerrado_con_novedad','finalizado','cancelado','anulado'
])
$$;

create or replace function public.erp_known_process(p_process text)
returns boolean language sql immutable as $$
select public.erp_normalize_key(p_process)=any(array[
  'cartera','caja','compras','recepcion_pedidos','alistamiento','corte_cable','facturacion',
  'cliente_punto','cliente_recoge','despacho_local','despacho_nacional',
  'cierre_despacho_nacional','no_entregado','cierre_caso','reception_goods'
])
$$;

create or replace function public.erp_transition_allowed(p_from text,p_to text)
returns boolean language sql immutable as $$
with x as (select public.erp_normalize_key(p_from) f,public.erp_normalize_key(p_to) t)
select case
  when f=t then true
  when f='' then true
  when f='cartera' and t in ('caja','compras','recepcion_pedidos') then true
  when f='caja' and t in ('compras','recepcion_pedidos','cliente_punto','cliente_recoge','despacho_local','despacho_nacional') then true
  when f='compras' and t='recepcion_pedidos' then true
  when f='recepcion_pedidos' and t='alistamiento' then true
  when f='alistamiento' and t in ('corte_cable','facturacion') then true
  when f='corte_cable' and t='alistamiento' then true
  when f='facturacion' and t in ('cliente_punto','cliente_recoge','despacho_local','despacho_nacional') then true
  when f in ('cliente_punto','cliente_recoge','despacho_local') and t in ('no_entregado','cierre_caso') then true
  when f='despacho_nacional' and t in ('no_entregado','cierre_despacho_nacional') then true
  when f='cierre_despacho_nacional' and t in ('no_entregado','cierre_caso') then true
  when f='no_entregado' and t in ('cliente_punto','cliente_recoge','despacho_local','despacho_nacional','alistamiento','caja','cartera','cierre_caso') then true
  else false end
from x
$$;

-- --------------------------------------------------------------------------
-- 4. RLS por rol exacto, ruta y asignación individual.
-- --------------------------------------------------------------------------
create or replace function public.erp_can_read_case(
  p_process text,p_created_uid text,p_created_email text,p_created_name text,
  p_assigned_uid text,p_assigned_email text,p_assigned_name text,p_assigned_role text,
  p_sales_advisor text,p_raw jsonb
)
returns boolean language plpgsql stable security definer set search_path=public as $$
declare r text:=public.erp_current_exact_role(); p text:=public.erp_normalize_key(p_process); route text:=public.erp_case_route(p_raw);
begin
 if r='' then return false; end if;
 if r in ('super_admin','gerencia','jefe_logistica','auditoria') then return true; end if;
 if r='ventas' then return public.erp_current_sales_owns(p_raw||jsonb_build_object(
   'createdBy',p_created_uid,'createdByEmail',p_created_email,'createdByName',p_created_name,'salesAdvisor',p_sales_advisor)); end if;
 if r='compras' then return p='compras'; end if;
 if r='caja' then return p='caja' or public.erp_exact_role(p_assigned_role)='caja'; end if;
 if r='cartera' then return p='cartera' or public.erp_exact_role(p_assigned_role)='cartera'; end if;
 if r='recepcion_mercancia' then return false; end if;
 if r='aux_logistica' then return p='alistamiento' and public.erp_current_identity_matches(p_raw||jsonb_build_object('assignedUid',p_assigned_uid,'assignedEmail',p_assigned_email,'assignedName',p_assigned_name)); end if;
 if r='auxiliar_corte' then return p='corte_cable' and (public.erp_current_identity_matches(p_raw||jsonb_build_object('assignedUid',p_assigned_uid,'assignedEmail',p_assigned_email,'assignedName',p_assigned_name)) or public.erp_exact_role(p_assigned_role)='auxiliar_corte'); end if;
 if r='coordinador_logistico' then return route in ('cliente_punto','cliente_recoge','despacho_local') and p in ('recepcion_pedidos','facturacion','cliente_punto','cliente_recoge','despacho_local','no_entregado'); end if;
 if r='despacho_nacional' then return route='despacho_nacional' and p in ('recepcion_pedidos','facturacion','despacho_nacional','cierre_despacho_nacional','no_entregado'); end if;
 return false;
end $$;

create or replace function public.erp_can_write_case(p_existing jsonb,p_new jsonb)
returns boolean language plpgsql stable security definer set search_path=public as $$
declare
 r text:=public.erp_current_exact_role();
 oldp text:=public.erp_normalize_key(coalesce(p_existing->>'currentProcess',p_existing->>'process',''));
 newp text:=public.erp_normalize_key(coalesce(p_new->>'currentProcess',p_new->>'process',''));
 oldstatus text:=public.erp_normalize_key(p_existing->>'status');
 newstatus text:=public.erp_normalize_key(p_new->>'status');
 route text:=public.erp_case_route(coalesce(p_new,p_existing));
 required_ok boolean:=coalesce(btrim(p_new->>'reference'),'')<>'' and coalesce(btrim(p_new->>'orderKind'),btrim(p_new->>'tipoPedido'),'')<>''
   and coalesce(btrim(p_new->>'client'),'')<>'' and public.erp_case_route(p_new)<>'' and coalesce(btrim(p_new->>'paymentCondition'),'')<>'';
begin
 if r='' then return false; end if;
 if r='super_admin' then return true; end if;
 if p_existing is null or p_existing='null'::jsonb then
   return r='ventas' and required_ok and public.erp_current_sales_owns(p_new);
 end if;
 if r='auditoria' then return false; end if;

 -- Gerencia aprueba/rechaza prioridad; Jefe/Gerencia solo ejecutan cancelación aprobada.
 if r='gerencia' and oldstatus='pendiente_gerencia' and newstatus in ('asignado','cancelado') then return true; end if;
 if r in ('jefe_logistica','gerencia') and newstatus='cancelado'
    and oldstatus not in ('cancelado','anulado','cerrado_conforme','cerrado_con_novedad')
    and coalesce(btrim(p_new->>'cancellationReason'),btrim(p_new->>'cancellationDetail'),'')<>'' then return true; end if;
 if r in ('jefe_logistica','gerencia') then return false; end if;

 -- Ventas no altera el flujo de pedidos existentes: usa case_comments/workflow_requests.
 if r='ventas' then return false; end if;
 if r='recepcion_mercancia' then return false; end if;

 if r='compras' then return oldp='compras' and newp in ('compras','recepcion_pedidos'); end if;
 if r='caja' then return oldp='caja' and (newp in ('caja','compras','recepcion_pedidos') or (newp in ('cliente_punto','cliente_recoge','despacho_local','despacho_nacional') and coalesce(p_existing#>>'{cashBilling,source}','')='facturacion' and upper(coalesce(p_new#>>'{cashBilling,status}','')) in ('CARGADA','PENDIENTE_SINCRONIZACION'))); end if;
 if r='cartera' then return oldp='cartera' and newp in ('cartera','caja','compras','recepcion_pedidos'); end if;
 if r='aux_logistica' then return oldp='alistamiento' and newp in ('alistamiento','corte_cable','facturacion') and public.erp_current_identity_matches(p_existing); end if;
 if r='auxiliar_corte' then return oldp='corte_cable' and newp in ('corte_cable','alistamiento') and (public.erp_current_identity_matches(p_existing) or public.erp_exact_role(p_existing->>'assignedRole')='auxiliar_corte'); end if;
 if r='coordinador_logistico' then return route in ('cliente_punto','cliente_recoge','despacho_local') and oldp in ('recepcion_pedidos','facturacion','cliente_punto','cliente_recoge','despacho_local','no_entregado') and newp in ('recepcion_pedidos','alistamiento','facturacion','cliente_punto','cliente_recoge','despacho_local','no_entregado','cierre_caso'); end if;
 if r='despacho_nacional' then return route='despacho_nacional' and oldp in ('recepcion_pedidos','facturacion','despacho_nacional','cierre_despacho_nacional','no_entregado') and newp in ('recepcion_pedidos','alistamiento','facturacion','despacho_nacional','cierre_despacho_nacional','no_entregado','cierre_caso'); end if;
 return false;
end $$;

-- --------------------------------------------------------------------------
-- 5. Comentarios dentro del pedido y solicitudes formales.
-- --------------------------------------------------------------------------
create table if not exists public.case_comments(
  comment_id uuid primary key default gen_random_uuid(),
  case_id text not null references public.cases(case_id) on delete cascade,
  comment_type text not null default 'COMMENT',
  body text not null,
  visibility text not null default 'CASE',
  created_by_uid text not null default public.erp_current_user_key(),
  created_by_name text,
  created_by_role text not null default public.erp_current_exact_role(),
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint case_comments_body_required check (length(btrim(body))>0),
  constraint case_comments_type_valid check (comment_type in ('COMMENT','NOVELTY','NO_DELIVERY','PAYMENT','STOCK','SUPERVISION','SYSTEM'))
);
create index if not exists idx_case_comments_case_time on public.case_comments(case_id,created_at);
alter table public.case_comments enable row level security;
drop policy if exists case_comments_read_v8 on public.case_comments;
create policy case_comments_read_v8 on public.case_comments for select to authenticated using (public.erp_case_id_visible(case_id));
drop policy if exists case_comments_insert_v8 on public.case_comments;
create policy case_comments_insert_v8 on public.case_comments for insert to authenticated with check (
  public.erp_case_id_visible(case_id) and created_by_uid=public.erp_current_user_key() and public.erp_current_exact_role()<>'auditoria'
);
revoke all on public.case_comments from anon;
revoke update,delete on public.case_comments from authenticated;
grant select,insert on public.case_comments to authenticated;

create table if not exists public.workflow_requests(
  request_id uuid primary key default gen_random_uuid(),
  case_id text not null references public.cases(case_id) on delete cascade,
  request_type text not null,
  status text not null default 'PENDING',
  reason text not null,
  requested_by_uid text not null default public.erp_current_user_key(),
  requested_by_name text,
  requested_by_role text not null default public.erp_current_exact_role(),
  assigned_roles text[] not null default '{}',
  assigned_user_uids text[] not null default '{}',
  decision text,
  decision_reason text,
  decided_by_uid text,
  decided_by_name text,
  decided_by_role text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint workflow_request_type_valid check (request_type in ('priority','cancellation','route_change','stock_exception','flow_exception','reopen','data_correction','payment_exception','no_delivery')),
  constraint workflow_request_status_valid check (status in ('PENDING','APPROVED','REJECTED','CLOSED')),
  constraint workflow_request_reason_required check (length(btrim(reason))>0)
);
alter table public.workflow_requests add column if not exists assigned_user_uids text[] not null default '{}';
create index if not exists idx_workflow_requests_case_status on public.workflow_requests(case_id,status,created_at desc);
alter table public.workflow_requests enable row level security;
drop policy if exists workflow_requests_read_v8 on public.workflow_requests;
create policy workflow_requests_read_v8 on public.workflow_requests for select to authenticated using (
  public.erp_case_id_visible(case_id) or requested_by_uid=public.erp_current_user_key() or public.erp_current_exact_role()=any(assigned_roles) or public.erp_current_user_key()=any(assigned_user_uids)
);
drop policy if exists workflow_requests_insert_v8 on public.workflow_requests;
create policy workflow_requests_insert_v8 on public.workflow_requests for insert to authenticated with check (
  public.erp_case_id_visible(case_id) and requested_by_uid=public.erp_current_user_key() and status='PENDING'
);
revoke all on public.workflow_requests from anon;
revoke update,delete on public.workflow_requests from authenticated;
grant select,insert on public.workflow_requests to authenticated;

create or replace function public.erp_request_approval(p_case_id text,p_type text,p_reason text,p_metadata jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
 roles text[]; user_uids text[]:='{}'; row public.workflow_requests%rowtype; owner text; c public.cases%rowtype;
begin
 if not public.erp_case_id_visible(p_case_id) then raise exception 'Pedido no visible' using errcode='42501'; end if;
 if coalesce(btrim(p_reason),'')='' then raise exception 'Debe indicar el motivo'; end if;
 select * into c from public.cases where case_id=p_case_id;
 if not found then raise exception 'Pedido no encontrado'; end if;
 owner:=public.erp_case_route_owner(coalesce(c.raw_data,'{}'::jsonb)||jsonb_build_object('requestedDelivery',c.requested_delivery,'deliveryType',c.delivery_type,'pendingDeliveryType',c.pending_delivery_type));
 roles:=case p_type
  when 'priority' then array['gerencia','super_admin']
  when 'cancellation' then array['jefe_logistica','gerencia','super_admin']
  when 'route_change' then array['jefe_logistica','gerencia','super_admin']
  when 'stock_exception' then array['jefe_logistica','gerencia','super_admin']
  when 'flow_exception' then array['jefe_logistica','gerencia','super_admin']
  when 'reopen' then array['jefe_logistica','gerencia','super_admin']
  when 'payment_exception' then array['caja','cartera','gerencia','super_admin']
  when 'no_delivery' then array[coalesce(nullif(owner,''),'super_admin'),'super_admin']
  when 'data_correction' then array['super_admin']
  else array['super_admin'] end;
 if p_type='data_correction' then
   user_uids:=array_remove(array[
     nullif(c.created_by,''),nullif(c.created_by_email,''),nullif(c.raw_data->>'createdBy',''),nullif(c.raw_data->>'createdByUid',''),nullif(c.raw_data->>'createdByEmail','')
   ],null);
 end if;
 insert into public.workflow_requests(case_id,request_type,reason,requested_by_uid,requested_by_name,requested_by_role,assigned_roles,assigned_user_uids,metadata)
 values(p_case_id,p_type,p_reason,public.erp_current_user_key(),(public.erp_current_profile()).display_name,public.erp_current_exact_role(),roles,user_uids,coalesce(p_metadata,'{}'::jsonb))
 returning * into row;
 return to_jsonb(row);
end $$;

create or replace function public.erp_decide_approval(p_request_id uuid,p_decision text,p_reason text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare req public.workflow_requests%rowtype;r text:=public.erp_current_exact_role();
begin
 select * into req from public.workflow_requests where request_id=p_request_id for update;
 if not found then raise exception 'Solicitud no encontrada'; end if;
 if req.status<>'PENDING' then raise exception 'La solicitud ya fue decidida'; end if;
 if not (r=any(req.assigned_roles) or public.erp_current_user_key()=any(req.assigned_user_uids)) then raise exception 'Usuario o rol no autorizado para decidir' using errcode='42501'; end if;
 if upper(p_decision) not in ('APPROVED','REJECTED') then raise exception 'Decisión inválida'; end if;
 update public.workflow_requests set status=upper(p_decision),decision=upper(p_decision),decision_reason=p_reason,
   decided_by_uid=public.erp_current_user_key(),decided_by_name=(public.erp_current_profile()).display_name,
   decided_by_role=r,decided_at=now()
 where request_id=p_request_id returning * into req;
 return to_jsonb(req);
end $$;

revoke all on function public.erp_request_approval(text,text,text,jsonb) from public,anon;
revoke all on function public.erp_decide_approval(uuid,text,text) from public,anon;
grant execute on function public.erp_current_exact_role() to authenticated;
grant execute on function public.erp_request_approval(text,text,text,jsonb) to authenticated;
grant execute on function public.erp_decide_approval(uuid,text,text) to authenticated;

-- --------------------------------------------------------------------------
-- 6. Perfil y colecciones auxiliares: se eliminan políticas permisivas antiguas.
-- --------------------------------------------------------------------------
alter table public.profiles enable row level security;
drop policy if exists profiles_directory_v71 on public.profiles;
drop policy if exists profiles_select_self_or_admin on public.profiles;
drop policy if exists "profiles_select_self_or_admin" on public.profiles;
drop policy if exists profiles_read_v8 on public.profiles;
create policy profiles_read_v8 on public.profiles for select to authenticated using (
  public.erp_current_exact_role()='super_admin'
  or (public.erp_current_exact_role() in ('gerencia','jefe_logistica','auditoria') and active=true)
  or (public.erp_current_exact_role() in ('coordinador_logistico','despacho_nacional') and active=true and public.erp_exact_role(role_code)='aux_logistica')
  or auth_user_id=auth.uid()
);

grant select on public.profiles to authenticated;

create or replace function public.erp_collection_write_allowed(p_collection text,p_group text)
returns boolean language sql immutable as $$
select case
  when p_group='admin' then true
  when p_collection in ('recepciones_mercancia','recepcion_stickers') then p_group='goods_reception'
  when p_collection like 'inventory_%' then p_group='cut'
  when p_collection like 'planning_%' then p_group='purchases'
  else false end
$$;

create or replace function public.erp_collection_read_allowed(p_collection text,p_group text)
returns boolean language sql immutable as $$
select case
  when p_group in ('admin','management','audit') then true
  when p_collection in ('recepciones_mercancia','recepcion_stickers') then p_group in ('goods_reception','purchases')
  when p_collection like 'inventory_%' then p_group in ('cut','logistics_manager')
  when p_collection like 'planning_%' then p_group in ('purchases','logistics_manager')
  when p_collection='erp_master_data' then p_group in ('purchases','goods_reception','picking','cut','local_dispatch','national_dispatch','logistics_manager')
  when p_collection='erp_domain_events' then p_group in ('sales','purchases','picking','cut','local_dispatch','national_dispatch','cash','credit','goods_reception','logistics_manager')
  else false end
$$;

-- --------------------------------------------------------------------------
-- 7. Guardián de campos, puertas y dueño de ruta.
-- --------------------------------------------------------------------------
create or replace function public.erp_validate_case_change(p_existing jsonb,p_new jsonb,p_is_admin boolean default false)
returns jsonb language plpgsql stable set search_path=public as $$
declare
 v_from text:=public.erp_normalize_key(coalesce(p_existing->>'currentProcess',p_existing->>'process',''));
 v_to text:=public.erp_normalize_key(coalesce(p_new->>'currentProcess',p_new->>'process',''));
 v_status text:=public.erp_normalize_key(p_new->>'status');
 v_old_status text:=public.erp_normalize_key(p_existing->>'status');
 v_kind text:=upper(coalesce(p_new->>'orderKind',p_new->>'tipoPedido',p_new->>'orderType',''));
 v_payment text:=upper(public.erp_normalize_key(p_new->>'paymentCondition'));
 v_hold text:=upper(public.erp_normalize_key(coalesce(p_new->>'clientFinancialStatus',p_new#>>'{salesHold,status}','')));
 v_mora boolean:=coalesce(public.erp_try_boolean(p_new->>'clientInArrears'),false) or v_hold like '%MORA%' or v_hold like '%RETEN%';
 v_cartera_ok boolean:=coalesce(p_new#>>'{carteraApproval,approvedAt}','')<>'';
 v_caja_ok boolean:=coalesce(p_new#>>'{cashApproval,approvedAt}','')<>'';
 errors jsonb:='[]'::jsonb;
begin
 if coalesce(btrim(p_new->>'reference'),'')='' then errors:=errors||jsonb_build_array('El número del pedido es obligatorio.'); end if;
 if coalesce(btrim(p_new->>'orderKind'),btrim(p_new->>'tipoPedido'),'')='' then errors:=errors||jsonb_build_array('El tipo de pedido es obligatorio.'); end if;
 if p_existing is null and exists(select 1 from public.cases c where lower(btrim(c.reference))=lower(btrim(p_new->>'reference'))) then errors:=errors||jsonb_build_array('Ya existe un pedido con el mismo número o referencia.'); end if;
 if coalesce(btrim(p_new->>'client'),'')='' then errors:=errors||jsonb_build_array('El cliente es obligatorio.'); end if;
 if public.erp_case_route(p_new)='' then errors:=errors||jsonb_build_array('La modalidad de entrega es obligatoria.'); end if;
 if coalesce(btrim(p_new->>'paymentCondition'),'')='' then errors:=errors||jsonb_build_array('La condición de pago es obligatoria.'); end if;
 if v_to='' and not public.erp_is_terminal_status(v_status) then errors:=errors||jsonb_build_array('El pedido no tiene proceso actual.'); end if;
 if v_to<>'' and not public.erp_known_process(v_to) then errors:=errors||jsonb_build_array('Proceso no reconocido: '||v_to||'.'); end if;

 if p_existing is not null and v_from<>v_to and not public.erp_transition_allowed(v_from,v_to) and v_old_status<>'pendiente_gerencia' then
   if not (p_is_admin and coalesce(public.erp_try_boolean(p_new->>'flowOverride'),false) and coalesce(btrim(p_new->>'flowOverrideReason'),'')<>'') then
     errors:=errors||jsonb_build_array('Transición no autorizada: '||v_from||' → '||v_to||'.');
   end if;
 end if;

 if v_status<>'pendiente_gerencia' and not public.erp_is_terminal_status(v_status) then
   if v_mora and not v_cartera_ok and v_to<>'cartera' then errors:=errors||jsonb_build_array('El cliente en mora debe ser liberado primero por Cartera.'); end if;
   if v_payment in ('CONTADO','MIXTO','ANTICIPO','CASH','CONSIGNACION','TRANSFERENCIA') and not v_caja_ok and v_to not in ('cartera','caja') then errors:=errors||jsonb_build_array('La condición de pago requiere liberación de Caja.'); end if;
 end if;

 if v_kind='PVE' and v_to='recepcion_pedidos' and v_from<>'compras'
   and coalesce(p_new#>>'{purchaseFlow,releasedAt}',p_new#>>'{documentFlow,purchaseReleasedAt}','')='' then
   errors:=errors||jsonb_build_array('El PVE debe ser liberado por Compras.');
 end if;
 if v_from='caja' and v_to in ('cliente_punto','cliente_recoge','despacho_local','despacho_nacional') then
   if coalesce(p_existing#>>'{cashBilling,source}','')<>'facturacion' then errors:=errors||jsonb_build_array('Caja solo puede enviar directamente a entrega después de Facturación.'); end if;
   if upper(coalesce(p_new#>>'{cashBilling,status}','')) not in ('CARGADA','PENDIENTE_SINCRONIZACION') then errors:=errors||jsonb_build_array('Caja debe cargar la factura PVN antes de liberar la entrega.'); end if;
 end if;
 if v_to='facturacion' and public.erp_pending_cuts(p_new)>0 then errors:=errors||jsonb_build_array('El pedido tiene cortes pendientes.'); end if;
 if not public.erp_is_terminal_status(v_status) and v_status<>'pendiente_gerencia'
   and v_to in ('recepcion_pedidos','facturacion','cliente_punto','cliente_recoge','despacho_local','despacho_nacional','cierre_despacho_nacional')
   and public.erp_case_route_owner(p_new)<>public.erp_exact_role(p_new->>'assignedRole') then
   errors:=errors||jsonb_build_array('El responsable no coincide con la modalidad de entrega.');
 end if;
 return jsonb_build_object('ok',jsonb_array_length(errors)=0,'errors',errors,'fromProcess',v_from,'toProcess',v_to);
end $$;


-- --------------------------------------------------------------------------
-- 8. Reparación idempotente de responsables actuales y pedidos abiertos.
-- --------------------------------------------------------------------------
create or replace function public.erp_repair_logistics_routes()
returns jsonb language plpgsql security definer set search_path=public as $$
declare
 v_duvan public.profiles%rowtype;v_javier public.profiles%rowtype;
 local_count integer:=0;national_count integer:=0;
begin
 if public.erp_current_exact_role()<>'super_admin' then raise exception 'Solo Super Admin puede reparar rutas logísticas' using errcode='42501'; end if;
 select * into v_duvan from public.profiles where lower(email)='d.diaz@ei.com.co' and active=true limit 1;
 if not found then raise exception 'No existe perfil activo para Duvan Díaz'; end if;
 select * into v_javier from public.profiles where lower(email)='j.laverde@ei.com.co' and active=true limit 1;
 if not found then raise exception 'No existe perfil activo para Javier Laverde'; end if;

 update public.profiles set role_code='coordinador_logistico',raw_profile=coalesce(raw_profile,'{}'::jsonb)||jsonb_build_object('role','coordinador_logistico','deliveryGroup','local_delivery','deliveryRoutes',jsonb_build_array('cliente_punto','cliente_recoge','despacho_local'),'routingVersion','8.0.0'),profile_updated_at=now() where lower(email)='d.diaz@ei.com.co';
 update public.profiles set role_code='despacho_nacional',raw_profile=coalesce(raw_profile,'{}'::jsonb)||jsonb_build_object('role','despacho_nacional','deliveryGroup','national_delivery','deliveryRoutes',jsonb_build_array('despacho_nacional','cierre_despacho_nacional'),'routingVersion','8.0.0'),profile_updated_at=now() where lower(email)='j.laverde@ei.com.co';

 update public.cases c set
   assigned_to=v_duvan.firebase_uid,assigned_uid=v_duvan.firebase_uid,assigned_email=v_duvan.email,
   assigned_name=v_duvan.display_name,assigned_role='coordinador_logistico',updated_at=now(),
   raw_data=coalesce(c.raw_data,'{}'::jsonb)||jsonb_build_object(
     'assignedTo',v_duvan.firebase_uid,'assignedUid',v_duvan.firebase_uid,'assignedEmail',v_duvan.email,
     'assignedName',v_duvan.display_name,'assignedRole','coordinador_logistico',
     'assignedUserIds',jsonb_build_array(v_duvan.firebase_uid,v_duvan.email,v_duvan.auth_user_id::text),
     'assignedUsers',jsonb_build_array(jsonb_build_object('uid',v_duvan.firebase_uid,'email',v_duvan.email,'name',v_duvan.display_name,'role','coordinador_logistico')),
     'deliveryRouteOwner','coordinador_logistico','routingVersion','8.0.0','routingRepairedAt',now())
 where not public.erp_is_terminal_status(c.status)
   and public.erp_normalize_key(c.current_process) in ('recepcion_pedidos','facturacion','cliente_punto','cliente_recoge','despacho_local','no_entregado')
   and public.erp_case_route(coalesce(c.raw_data,'{}'::jsonb)||jsonb_build_object('requestedDelivery',c.requested_delivery,'deliveryType',c.delivery_type,'pendingDeliveryType',c.pending_delivery_type)) in ('cliente_punto','cliente_recoge','despacho_local');
 get diagnostics local_count=row_count;

 update public.cases c set
   assigned_to=v_javier.firebase_uid,assigned_uid=v_javier.firebase_uid,assigned_email=v_javier.email,
   assigned_name=v_javier.display_name,assigned_role='despacho_nacional',updated_at=now(),
   raw_data=coalesce(c.raw_data,'{}'::jsonb)||jsonb_build_object(
     'assignedTo',v_javier.firebase_uid,'assignedUid',v_javier.firebase_uid,'assignedEmail',v_javier.email,
     'assignedName',v_javier.display_name,'assignedRole','despacho_nacional',
     'assignedUserIds',jsonb_build_array(v_javier.firebase_uid,v_javier.email,v_javier.auth_user_id::text),
     'assignedUsers',jsonb_build_array(jsonb_build_object('uid',v_javier.firebase_uid,'email',v_javier.email,'name',v_javier.display_name,'role','despacho_nacional')),
     'deliveryRouteOwner','despacho_nacional','routingVersion','8.0.0','routingRepairedAt',now())
 where not public.erp_is_terminal_status(c.status)
   and public.erp_normalize_key(c.current_process) in ('recepcion_pedidos','facturacion','despacho_nacional','cierre_despacho_nacional','no_entregado')
   and public.erp_case_route(coalesce(c.raw_data,'{}'::jsonb)||jsonb_build_object('requestedDelivery',c.requested_delivery,'deliveryType',c.delivery_type,'pendingDeliveryType',c.pending_delivery_type))='despacho_nacional';
 get diagnostics national_count=row_count;
 return jsonb_build_object('version','8.0.0','localAssignments',local_count,'nationalAssignments',national_count,'localOwner',v_duvan.email,'nationalOwner',v_javier.email,'repairedAt',now());
end $$;
revoke all on function public.erp_repair_logistics_routes() from public,anon;
grant execute on function public.erp_repair_logistics_routes() to authenticated;

-- --------------------------------------------------------------------------
-- 9. Diagnóstico final.
-- --------------------------------------------------------------------------
commit;

select jsonb_build_object(
 'version','8.0.0',
 'profiles',(select count(*) from public.profiles),
 'active_profiles',(select count(*) from public.profiles where active=true),
 'javier_role',(select role_code from public.profiles where lower(email)='j.laverde@ei.com.co' limit 1),
 'duvan_role',(select role_code from public.profiles where lower(email)='d.diaz@ei.com.co' limit 1),
 'goods_role',(select role_code from public.profiles where lower(email)='a.mendoza@ei.com.co' limit 1),
 'comments_table',to_regclass('public.case_comments') is not null,
 'requests_table',to_regclass('public.workflow_requests') is not null,
 'current_role_function',to_regprocedure('public.erp_current_exact_role()') is not null
) as erp_v8_activation;
