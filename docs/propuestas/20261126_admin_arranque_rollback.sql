-- Retroceso sin uso; no elimina datos deportivos ni económicos tras confirmar.
begin;
do $$ begin
  if exists(select 1 from app_private.admin_catalogo_inicial)
    or exists(select 1 from app_private.admin_repartos where applied is not null) then
    raise exception 'La reversión tras importar o repartir requiere un plan de corrección de datos aprobado';
  end if;
end; $$;
drop function public.macroliga_admin_aplicar_reparto(uuid,uuid);
drop function public.macroliga_admin_simular_reparto(uuid,bigint,jsonb,bigint,text,date);
drop function public.macroliga_admin_importar_catalogo(uuid,jsonb);
drop function public.macroliga_admin_arranque_estado(uuid);
drop function app_private.admin_huella(uuid);
drop function app_private.admin_arranque_vacio(uuid);
drop function app_private.admin_exigir(uuid);
drop table app_private.admin_repartos;
drop table app_private.admin_catalogo_inicial;
commit;
