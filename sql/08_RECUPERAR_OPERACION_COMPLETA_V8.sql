-- ============================================================================
-- PASO 63 · RECUPERACIÓN OPERATIVA TOTAL
-- Restaura la capa de compatibilidad utilizada por el frontend V8 original.
-- NO borra pedidos, usuarios, archivos, eventos ni solicitudes.
-- ============================================================================

begin;

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

create or replace function public.erp_current_firebase_uid()
returns text language sql stable security definer set search_path=public
as $$ select public.erp_current_user_key() $$;

create or replace function public.erp_current_role()
returns text language sql stable security definer set search_path=public
as $$ select lower(coalesce(p.role_code,'')) from public.profiles p where p.auth_user_id=auth.uid() and p.active=true limit 1 $$;

create or replace function public.erp_is_admin()
returns boolean language sql stable security definer set search_path=public
as $$ select public.erp_role_group(public.erp_current_role())='admin' $$;

create or replace function public.erp_case_id_visible(p_case_id text)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from public.cases c where c.case_id=p_case_id and public.erp_can_read_case(
      c.current_process,c.created_by_uid,c.created_by_email,c.created_by_name,
      c.assigned_uid,c.assigned_email,c.assigned_name,c.assigned_role,c.sales_advisor,c.raw_data)
  )
$$;

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


-- --------------------------------------------------------------------------
-- RESTAURAR LECTURA DIRECTA PROTEGIDA POR RLS
-- --------------------------------------------------------------------------
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'profiles',
    'roles',
    'cases',
    'case_items',
    'case_state_history',
    'case_process_stats',
    'case_checklist',
    'case_cuts',
    'case_components',
    'case_events',
    'evidences',
    'case_comments',
    'workflow_requests',
    'credit_requests',
    'credit_request_events',
    'issue_reports',
    'issue_report_comments',
    'inventory_chipas',
    'deleted_users_log',
    'erp_access_events',
    'erp_documents',
    'erp_flow_health'
  ]
  loop
    if to_regclass(format('public.%I',v_table)) is not null then
      execute format(
        'revoke all privileges on table public.%I from public, anon',
        v_table
      );
      execute format(
        'grant select on table public.%I to authenticated',
        v_table
      );
    end if;
  end loop;
end;
$$;

-- El frontend no escribe tablas directamente. Escribe mediante RPC.
do $$
declare
  v_signature text;
  v_function regprocedure;
begin
  foreach v_signature in array array[
    'public.erp_apply_operations(jsonb)',
    'public.credit_transition(text,text,jsonb)',
    'public.erp_scan_flow_health()',
    'public.erp_repair_logistics_routes()',
    'public.erp_diagnostic_snapshot()'
  ]
  loop
    v_function:=to_regprocedure(v_signature);
    if v_function is not null then
      execute format(
        'revoke all on function %s from public, anon, authenticated',
        v_function
      );
      execute format(
        'grant execute on function %s to authenticated',
        v_function
      );
    end if;
  end loop;
end;
$$;

-- Funciones que Postgres/RLS y el adaptador requieren durante la sesión.
do $$
declare
  v_signature text;
  v_function regprocedure;
begin
  foreach v_signature in array array[
    'public.erp_current_profile()',
    'public.erp_current_user_key()',
    'public.erp_current_firebase_uid()',
    'public.erp_current_role()',
    'public.erp_current_exact_role()',
    'public.erp_exact_role(text)',
    'public.erp_role_group(text)',
    'public.erp_is_admin()',
    'public.erp_case_id_visible(text)',
    'public.erp_can_read_case(text,text,text,text,text,text,text,text,text,jsonb)',
    'public.erp_can_write_case(jsonb,jsonb)',
    'public.erp_collection_read_allowed(text,text)',
    'public.erp_collection_write_allowed(text,text)',
    'public.erp_jsonb_contains_text(jsonb,text)',
    'public.erp_try_boolean(text,boolean)',
    'public.erp_try_integer(text)',
    'public.erp_try_numeric(text)',
    'public.erp_try_timestamptz(text)'
  ]
  loop
    v_function:=to_regprocedure(v_signature);
    if v_function is not null then
      execute format(
        'revoke all on function %s from public, anon, authenticated',
        v_function
      );
      execute format(
        'grant execute on function %s to authenticated',
        v_function
      );
    end if;
  end loop;
end;
$$;

-- Las funciones oficiales nuevas pueden coexistir, pero el frontend recuperado
-- no depende de ellas para crear o mover pedidos.
do $$
declare
  v_signature text;
  v_function regprocedure;
begin
  foreach v_signature in array array[
    'public.erp_get_session_context()',
    'public.erp_get_dashboard_summary(integer)',
    'public.erp_list_cases(text,text,text,text,text,text,text,integer,integer)',
    'public.erp_get_case_detail(text)',
    'public.erp_list_workflow_requests(text,text,text,text,integer,integer)',
    'public.erp_get_frontend_catalog()',
    'public.erp_get_case_actions(text)',
    'public.erp_execute_case_action(text,text,jsonb)'
  ]
  loop
    v_function:=to_regprocedure(v_signature);
    if v_function is not null then
      execute format(
        'revoke all on function %s from public, anon, authenticated',
        v_function
      );
      execute format(
        'grant execute on function %s to authenticated',
        v_function
      );
    end if;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
commit;

-- ============================================================================
-- VERIFICACIÓN NO DESTRUCTIVA
-- ============================================================================
select
  (select count(*) from public.cases) as pedidos_totales_reales,

  has_table_privilege(
    'authenticated',
    'public.cases',
    'SELECT'
  ) as auth_lee_pedidos,

  has_table_privilege(
    'authenticated',
    'public.profiles',
    'SELECT'
  ) as auth_lee_perfiles,

  has_function_privilege(
    'authenticated',
    'public.erp_apply_operations(jsonb)',
    'EXECUTE'
  ) as auth_ejecuta_operaciones,

  has_function_privilege(
    'authenticated',
    'public.credit_transition(text,text,jsonb)',
    'EXECUTE'
  ) as auth_ejecuta_creditos,

  has_function_privilege(
    'anon',
    'public.erp_apply_operations(jsonb)',
    'EXECUTE'
  ) as anon_ejecuta_operaciones;
