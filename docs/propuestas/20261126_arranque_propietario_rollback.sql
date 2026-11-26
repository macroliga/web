-- Reversión del núcleo antes de aplicar. Retirar primero wrappers públicos si existen.
begin;
do $$ begin
 if exists(select 1 from app_private.admin_repartos where applied is not null) then
   raise exception 'La reversión tras repartir requiere un plan de corrección de datos aprobado';
 end if;
end; $$;
drop function app_private.iniciar_todo_propietario(uuid,jsonb,jsonb,bigint,jsonb,bigint,date,uuid);
drop function app_private.admin_iniciar_todo_core(uuid,uuid,jsonb,jsonb,bigint,jsonb,bigint,date,uuid);
drop function app_private.admin_aplicar_reparto_core(uuid,uuid,uuid);
drop function app_private.admin_simular_reparto_core(uuid,uuid,bigint,jsonb,bigint,text,date);
drop function app_private.admin_huella(uuid);
drop function app_private.admin_arranque_vacio(uuid);
drop table app_private.admin_repartos;
commit;
