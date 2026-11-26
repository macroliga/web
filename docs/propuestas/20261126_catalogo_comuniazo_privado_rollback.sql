-- Revierte estructura sin uso; jamás borra una importación ni sus precios.
begin;
do $$ begin
 if exists(select 1 from app_private.catalogo_comuniazo_runs) then
  raise exception 'La reversión con catálogo importado exige un plan de datos aprobado';
 end if;
end $$;
drop function app_private.importar_catalogo_comuniazo(uuid,jsonb,jsonb,uuid);
drop table app_private.catalogo_comuniazo_puntos;
drop table app_private.catalogo_comuniazo_bajas_equipo_malo;
drop table app_private.catalogo_comuniazo_runs;
commit;
