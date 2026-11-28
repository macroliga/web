-- Definición de producción comprobada en modo solo lectura en macroliga-piloto
-- el 27/11/2026; pertenece al conjunto de migraciones posteriores a las versionadas.
-- Ningún dato alojado se copia.
CREATE OR REPLACE FUNCTION app_private.equipo_manager_activo(p_division_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare v_equipo uuid;
begin
  select t.id into v_equipo from public.teams t join public.managers m on m.id=t.manager_id
    where m.auth_user_id=auth.uid() and t.division_id=p_division_id and t.status='active';
  if v_equipo is null then raise exception 'No autorizado para esta división' using errcode='42501'; end if;
  return v_equipo;
end; $function$;
revoke all on function app_private.equipo_manager_activo(uuid) from public,anon,authenticated,service_role;
