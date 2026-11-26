-- Activación autorizada del piloto existente. Ejecutar UNA VEZ en macroliga-piloto.
-- No crea otra liga, no reparte plantillas y no genera pujas.
begin;
create extension if not exists pg_cron;
do $activate$
declare
 v_div uuid;v_season uuid;v_cycle uuid; v_local timestamp:=clock_timestamp() at time zone 'Europe/Madrid';
 v_day date;v_open timestamptz;v_close timestamptz;v_publish timestamptz;
begin
 select d.id,s.id into strict v_div,v_season
 from public.divisions d join public.seasons s on s.id=d.season_id
 join public.competitions c on c.id=s.competition_id
 where c.code='MACROLIGA_PILOTO_INVIERNO_2026' and s.code='2026_27'
   and d.code='PILOTO' and d.timezone='Europe/Madrid' and s.status='draft';
 -- Solo la primera puesta en marcha sin actividad previa.
 perform 1 from public.divisions where id=v_div for update;
 select c.id into strict v_cycle from public.market_cycles c
 where c.division_id=v_div and c.status='draft' for update;
 if (select count(*) from public.market_cycles where division_id=v_div)<>1
 or (select count(*) from public.teams where division_id=v_div and status='active')<>16
 or (select count(*) from public.roster_ownership where division_id=v_div and owner_kind='team')<>240
 or (select count(*) from public.market_lots where cycle_id=v_cycle and status='available' and day_number=1)<>15
 or exists(select 1 from public.bids where division_id=v_div)
 or exists(select 1 from public.transfer_operations where division_id=v_div)
 or exists(select 1 from app_private.market_runner_divisions where division_id=v_div)
 or exists(select 1 from cron.job where jobname='macroliga_piloto_mercado_diario')
 then raise exception 'La fotografía inicial ha cambiado; revisar antes de activar'; end if;
 -- Adelantar el borrador existente a la ventana local actual, no fabricar una jornada pasada.
 if v_local::time<time '01:00' then v_day:=v_local::date-1;
 elsif v_local::time>=time '06:00' then v_day:=v_local::date;
 else raise exception 'Mercado en periodo de cierre; activar después de las 06:00'; end if;
 v_open:=(v_day+time '06:00') at time zone 'Europe/Madrid';
 v_close:=((v_day+1)+time '01:00') at time zone 'Europe/Madrid';
 v_publish:=((v_day+1)+time '06:00') at time zone 'Europe/Madrid';
 if not(v_open<=clock_timestamp() and clock_timestamp()<v_close) then raise exception 'No es horario de mercado';end if;
 update public.market_cycles set opens_at=v_open,closes_at=v_close,publishes_at=v_publish where id=v_cycle;
 -- La temporada activa permite al runner ya existente operar solo en la división autorizada.
 update public.seasons set status='active' where id=v_season and status='draft';
 insert into app_private.market_runner_divisions(division_id,enabled,bootstrap_cycle_id) values(v_div,true,v_cycle);
 if app_private.runner_abrir(v_cycle)<>15 then raise exception 'No se abrieron los quince lotes';end if;
 -- Reintento cada cinco minutos, las horas reales se deciden dentro de la BD en Madrid.
 perform cron.schedule('macroliga_piloto_mercado_diario','*/5 * * * *',
   format('select app_private.procesar_mercado_programado(%L::uuid);',v_div));
end;
$activate$;
commit;
