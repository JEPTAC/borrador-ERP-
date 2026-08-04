-- ============================================================
-- EI ERP NOVA V7 · VALIDACIÓN POSTERIOR A LA ACTIVACIÓN
-- Ejecute el archivo completo. Cada bloque devuelve un resultado.
-- ============================================================

-- 1. Conteos principales
select 'auth.users' as objeto,count(*)::bigint as registros from auth.users
union all select 'profiles',count(*) from public.profiles
union all select 'profiles_linked',count(*) from public.profiles where auth_user_id is not null
union all select 'profiles_active',count(*) from public.profiles where active=true
union all select 'user_roles',count(*) from public.user_roles
union all select 'cases',count(*) from public.cases
union all select 'case_items',count(*) from public.case_items
union all select 'case_events',count(*) from public.case_events
union all select 'case_state_history',count(*) from public.case_state_history
union all select 'case_process_stats',count(*) from public.case_process_stats
union all select 'case_checklist',count(*) from public.case_checklist
union all select 'case_cuts',count(*) from public.case_cuts
union all select 'case_components',count(*) from public.case_components
union all select 'evidences',count(*) from public.evidences
union all select 'issue_reports',count(*) from public.issue_reports
union all select 'issue_report_comments',count(*) from public.issue_report_comments
union all select 'inventory_chipas',count(*) from public.inventory_chipas
union all select 'business_holidays',count(*) from public.business_holidays
union all select 'credit_requests',count(*) from public.credit_requests
union all select 'erp_flow_health',count(*) from public.erp_flow_health
order by objeto;

-- 2. Perfiles que aún no están vinculados con Auth
select firebase_uid,email,display_name,role_code,active
from public.profiles
where auth_user_id is null
order by active desc,email;

-- 3. Integridad referencial. Los tres valores deben ser 0.
select
  (select count(*) from public.case_events e left join public.cases c on c.case_id=e.case_id where e.case_id is not null and c.case_id is null) as eventos_huerfanos,
  (select count(*) from public.case_checklist x left join public.cases c on c.case_id=x.case_id where x.case_id is not null and c.case_id is null) as checklist_huerfanos,
  (select count(*) from public.evidences e left join public.cases c on c.case_id=e.case_id where e.case_id is not null and c.case_id is null) as evidencias_huerfanas;

-- 4. Objetos obligatorios de V7. Todos deben ser true.
select
  to_regprocedure('public.erp_apply_operations(jsonb)') is not null as rpc_operaciones,
  to_regprocedure('public.erp_write_document(text,text,jsonb,boolean)') is not null as rpc_documentos,
  to_regprocedure('public.erp_delete_document(text,text)') is not null as rpc_eliminar_documentos,
  to_regprocedure('public.credit_transition(text,text,jsonb)') is not null as rpc_credito,
  to_regprocedure('public.erp_scan_flow_health()') is not null as rpc_guardian,
  to_regclass('public.v_vsm_case_summary') is not null as vista_casos,
  to_regclass('public.v_vsm_timeline_complete') is not null as vista_timeline,
  to_regclass('public.v_vsm_process_summary') is not null as vista_procesos,
  to_regclass('public.v_vsm_stuck_cases') is not null as vista_estancados,
  to_regclass('public.v_vsm_flow_health') is not null as vista_salud_flujo;

-- 5. RLS en tablas operativas. Todas deben mostrar rowsecurity=true.
select c.relname as tabla,c.relrowsecurity as rowsecurity
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in (
  'profiles','cases','case_items','case_events','case_state_history','case_process_stats',
  'case_checklist','case_cuts','case_components','evidences','issue_reports',
  'issue_report_comments','inventory_chipas','credit_requests','credit_request_events',
  'erp_documents','erp_flow_health'
)
order by c.relname;

-- 6. Tablas publicadas en Realtime.
select tablename
from pg_publication_tables
where pubname='supabase_realtime' and schemaname='public'
  and tablename in ('cases','case_events','credit_requests','issue_reports','erp_documents','erp_flow_health')
order by tablename;

-- 7. Calendario laboral: debe devolver 31800 segundos (8 h 50 min).
select public.business_seconds_between(
  '2026-08-04 07:00:00-05'::timestamptz,
  '2026-08-04 17:30:00-05'::timestamptz
) as segundos_habiles_esperados_31800;

-- 8. Ejecutar guardián. Solo Logística, Auditoría, Gerencia o Administración.
select public.erp_scan_flow_health() as guardian;

-- 9. Resumen del guardián.
select
  count(*) filter(where health_status='CRITICAL') as pedidos_criticos,
  count(*) filter(where health_status='ATTENTION') as pedidos_atencion,
  count(*) filter(where health_status='OK') as pedidos_sin_hallazgos
from public.erp_flow_health;
