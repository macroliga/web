#!/usr/bin/env bash
# Exclusivo PostgreSQL local desechable. No se aceptan URL, host ni credenciales externas.
set -euo pipefail
cd "$(dirname "$0")/../.."
[[ "${PGHOST:-}" == "127.0.0.1" && "${PGDATABASE:-}" == "macroliga_clause_test" && "${PGUSER:-}" == "postgres" && "${PGPORT:-}" =~ ^[0-9]+$ && "${PGPASSWORD:-}" == "fixture-macroliga-only" ]] ||
 { echo "Base local desechable no identificada; abortando." >&2; exit 1; }
export PGPASSWORD=fixture-macroliga-only
unset PGHOSTADDR PGSERVICE PGSERVICEFILE PGOPTIONS PGSSLMODE PGREQUIREAUTH
psql=(psql -X -v ON_ERROR_STOP=1 --host=127.0.0.1 --port="$PGPORT" --username=postgres --dbname=macroliga_clause_test)
"${psql[@]}" -c "select version()"
# La base debe estar vacía: no ejecutar sobre una instancia con datos de aplicación.
[[ "$("${psql[@]}" -Atc "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','app_private','auth') and c.relkind in ('r','p')")" == "0" ]] || { echo "Base no vacía; abortando." >&2; exit 1; }
"${psql[@]}" -f tests/sql/bootstrap_postgres_ci.sql
for sql in supabase/migrations/*.sql; do
 echo "=== MIGRACIÓN REAL: $sql ==="
 "${psql[@]}" -f "$sql"
done
"${psql[@]}" -f tests/sql/base_helper_manager_activo.sql
sig="app_private._contabilizar_traspaso(uuid,uuid,uuid,uuid,text,text,bigint,text,text)"
before=$("${psql[@]}" -Atc "select md5(pg_get_functiondef('$sig'::regprocedure)),coalesce(proacl::text,'') from pg_proc where oid='$sig'::regprocedure")
echo "=== REGRESIÓN BASE ==="
for sql in tests/sql/202611*.sql; do
 echo "=== $sql ==="
 "${psql[@]}" -f "$sql"
done
echo "=== APLICAR PROPUESTA DE CLÁUSULAS, SOLAMENTE AQUÍ ==="
"${psql[@]}" -f docs/propuestas/20261127_clausulas_equipo_malo.sql
"${psql[@]}" -f tests/sql/clausulas_equipo_malo.sql
echo "=== REGRESIÓN CON PROPUESTA ==="
for sql in tests/sql/202611*.sql; do
 echo "=== $sql ==="
 "${psql[@]}" -f "$sql"
done
"${psql[@]}" -f docs/propuestas/20261127_clausulas_equipo_malo_rollback.sql
after=$("${psql[@]}" -Atc "select md5(pg_get_functiondef('$sig'::regprocedure)),coalesce(proacl::text,'') from pg_proc where oid='$sig'::regprocedure")
[[ "$before" == "$after" ]] || { echo "La reversión no restauró definición/ACL anterior: antes=$before después=$after" >&2; exit 1; }
[[ "$("${psql[@]}" -Atc "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('macroliga_cotizar_clausula_equipo_malo','macroliga_pagar_clausula_equipo_malo')")" == "0" ]] || { echo "RPC residual tras reversión" >&2; exit 1; }
[[ "$("${psql[@]}" -Atc "select (select count(*) from auth.users)+(select count(*) from public.competitions)+(select count(*) from public.transfer_operations)+(select count(*) from public.wallet_entries)+(select count(*) from public.clause_rules)+(select count(*) from public.clause_windows)")" == "0" ]] || { echo "Fixtures residuales" >&2; exit 1; }
echo "VERIFICACIÓN SQL MACROLIGA: migraciones, regresión, cláusulas, permisos y rollback correctos; cero fixtures."
