-- Disposable database only, after running the proposal's reversal.
do $$
begin
  if to_regprocedure('public.macroliga_mis_equipos()') is not null
     or to_regprocedure('public.macroliga_mi_plantilla(uuid)') is not null then
    raise exception 'Manager RPC reversal incomplete';
  end if;
end $$;
