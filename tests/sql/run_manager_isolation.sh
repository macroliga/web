#!/usr/bin/env bash
# Run only against an already initialized, disposable local MACROLIGA schema.
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${MACROLIGA_TEST_SOCKET:?Set a local Unix socket directory}"
: "${MACROLIGA_TEST_DATABASE:?Set a disposable database named macroliga_test_*}"
[[ "$MACROLIGA_TEST_SOCKET" = /* && -d "$MACROLIGA_TEST_SOCKET" ]] || exit 2
[[ "$MACROLIGA_TEST_DATABASE" =~ ^macroliga_test_[a-zA-Z0-9_]+$ ]] || exit 2
unset PGHOSTADDR PGSERVICE PGSERVICEFILE PGOPTIONS PGDATABASE PGHOST
p=(psql -X -v ON_ERROR_STOP=1 -h "$MACROLIGA_TEST_SOCKET" -d "$MACROLIGA_TEST_DATABASE")
"${p[@]}" <<'SQL'
do $$ begin
 if inet_server_addr() is not null or current_database() !~ '^macroliga_test_' then raise exception 'not a local test database'; end if;
 if to_regprocedure('public.macroliga_mis_equipos()') is not null or to_regprocedure('public.macroliga_mi_plantilla(uuid)') is not null then raise exception 'proposal already installed'; end if;
end $$;
SQL
proposal=docs/propuestas/20261125_lecturas_manager.sql
rollback=docs/propuestas/20261125_lecturas_manager.rollback.sql
"${p[@]}" -f "$proposal"
trap '"${p[@]}" -f "$rollback"' EXIT
"${p[@]}" -f tests/sql/manager_isolation.sql
"${p[@]}" -f "$rollback"
trap - EXIT
"${p[@]}" <<'SQL'
do $$ begin
 if to_regprocedure('public.macroliga_mis_equipos()') is not null or to_regprocedure('public.macroliga_mi_plantilla(uuid)') is not null then raise exception 'rollback incomplete'; end if;
 if exists(select 1 from public.competitions where id='00000000-0000-4000-8000-000000000010') or exists(select 1 from auth.users where id in ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003')) then raise exception 'fixture residue'; end if;
end $$;
SQL
