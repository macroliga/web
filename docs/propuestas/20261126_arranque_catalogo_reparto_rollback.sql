-- Reversión de la ESTRUCTURA propuesta únicamente cuando no se haya usado.
-- Si ya existe una inicialización, abortar; no borrar plantillas ni dinero.
begin;
lock table app_private.initialization_runs in access exclusive mode;
do $$ begin
  if exists(select 1 from app_private.initialization_runs) then
    raise exception 'Ya se usó el arranque: requiere un plan de compensación aprobado';
  end if;
end $$;
drop function app_private.aplicar_arranque_piloto(uuid,jsonb,jsonb);
drop table app_private.initialization_runs;
commit;
