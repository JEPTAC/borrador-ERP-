-- OPCIONAL · Programar el guardián cada 30 minutos.
-- Ejecute solo si Cron está disponible en Database > Extensions.
-- La aplicación y el VSM funcionan sin este archivo; el botón Actualizar también ejecuta el guardián.

create extension if not exists pg_cron;

do $$
declare v_job bigint;
begin
  select jobid into v_job from cron.job where jobname='ei-erp-flow-health-30m' limit 1;
  if v_job is not null then perform cron.unschedule(v_job); end if;
end $$;

select cron.schedule(
  'ei-erp-flow-health-30m',
  '*/30 * * * *',
  $$select public.erp_scan_flow_health();$$
) as job_id;
