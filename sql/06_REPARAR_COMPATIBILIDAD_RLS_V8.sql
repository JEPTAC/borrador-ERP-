begin;

-- ============================================================
-- REPARACIÓN CONTROLADA DE COMPATIBILIDAD RLS
-- Mantiene anon bloqueado y restaura solo lo requerido por
-- las políticas y módulos heredados todavía no migrados.
-- ============================================================

-- 1. Política segura del directorio de perfiles.
alter table public.profiles enable row level security;

drop policy if exists profiles_directory_v71 on public.profiles;
drop policy if exists profiles_select_self_or_admin on public.profiles;
drop policy if exists "profiles_select_self_or_admin" on public.profiles;
drop policy if exists profiles_read_v8 on public.profiles;

create policy profiles_read_v8
on public.profiles
for select
to authenticated
using (
  public.erp_current_exact_role() = 'super_admin'
  or (
    public.erp_current_exact_role() in (
      'gerencia',
      'jefe_logistica',
      'auditoria'
    )
    and active = true
  )
  or (
    public.erp_current_exact_role() in (
      'coordinador_logistico',
      'despacho_nacional'
    )
    and active = true
    and public.erp_exact_role(role_code) in (
      'aux_logistica',
      'auxiliar_corte',
      'recepcion_mercancia'
    )
  )
  or auth_user_id = auth.uid()
);

-- 2. Funciones técnicas requeridas directamente por las políticas RLS.
do $$
declare
  v_signature text;
  v_function regprocedure;
begin
  foreach v_signature in array array[
    'public.is_active_erp_user()',
    'public.erp_current_user_key()',
    'public.erp_current_firebase_uid()',
    'public.erp_current_role()',
    'public.erp_current_exact_role()',
    'public.erp_role_group(text)',
    'public.erp_exact_role(text)',
    'public.erp_normalize_key(text)',
    'public.erp_case_id_visible(text)',
    'public.erp_can_read_case(text,text,text,text,text,text,text,text,text,jsonb)',
    'public.erp_collection_read_allowed(text,text)',
    'public.erp_jsonb_contains_text(jsonb,text)',
    'public.erp_try_boolean(text,boolean)'
  ]
  loop
    v_function := to_regprocedure(v_signature);

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

-- 3. RPC de compatibilidad aún utilizados por módulos heredados.
-- Todos son SECURITY DEFINER y validan identidad/rol internamente.
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
    v_function := to_regprocedure(v_signature);

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

-- 4. Lectura directa temporal, siempre protegida por RLS.
-- No se concede INSERT, UPDATE ni DELETE sobre estas tablas.
do $$
declare
  v_table text;
  v_relation regclass;
  v_rls_enabled boolean;
begin
  foreach v_table in array array[
    'profiles',
    'case_events',
    'evidences',
    'credit_requests',
    'credit_request_events',
    'issue_reports',
    'issue_report_comments',
    'inventory_chipas',
    'erp_documents',
    'erp_access_events',
    'erp_flow_health'
  ]
  loop
    v_relation := to_regclass(format('public.%I', v_table));

    if v_relation is not null then
      select c.relrowsecurity
      into v_rls_enabled
      from pg_class c
      where c.oid = v_relation;

      if not coalesce(v_rls_enabled, false) then
        execute format(
          'alter table public.%I enable row level security',
          v_table
        );
      end if;

      execute format(
        'revoke all privileges on table public.%I from public, anon, authenticated',
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

-- 5. Las tablas centrales de escritura continúan bloqueadas.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'cases',
    'case_items',
    'case_state_history',
    'case_process_stats',
    'case_checklist',
    'case_cuts',
    'case_components',
    'case_comments',
    'workflow_requests',
    'roles'
  ]
  loop
    if to_regclass(format('public.%I', v_table)) is not null then
      execute format(
        'revoke insert, update, delete on table public.%I from public, anon, authenticated',
        v_table
      );
    end if;
  end loop;
end;
$$;

-- 6. API RPC oficial permanece disponible solo para authenticated.
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
    v_function := to_regprocedure(v_signature);

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

-- ============================================================
-- VERIFICACIÓN
-- ============================================================

select
  has_table_privilege(
    'authenticated',
    'public.profiles',
    'SELECT'
  ) as auth_lee_perfil,

  has_function_privilege(
    'authenticated',
    'public.erp_current_role()',
    'EXECUTE'
  ) as rls_puede_resolver_rol,

  has_function_privilege(
    'authenticated',
    'public.erp_apply_operations(jsonb)',
    'EXECUTE'
  ) as compatibilidad_escritura_activa,

  has_function_privilege(
    'authenticated',
    'public.credit_transition(text,text,jsonb)',
    'EXECUTE'
  ) as credito_puede_transicionar,

  has_function_privilege(
    'anon',
    'public.erp_current_role()',
    'EXECUTE'
  ) as anon_resuelve_rol,

  has_function_privilege(
    'anon',
    'public.erp_apply_operations(jsonb)',
    'EXECUTE'
  ) as anon_escribe;
