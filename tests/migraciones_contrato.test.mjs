import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const root=new URL('../supabase/migrations/',import.meta.url);
const leer=(f)=>readFileSync(new URL(f,root),'utf8');
const core=leer('202611250001_core_schema.sql');
const fks=leer('202611250002_consistencia_divisiones.sql');
const rpc=leer('202611250003_pujas_seguras.sql');

test('33 tablas declaradas, todas incorporadas al bloqueo de RLS',()=>{
  const nombres=[...core.matchAll(/create table public\.(\w+)/g)].map(m=>m[1]);
  assert.equal(nombres.length,33);
  const cierre=core.slice(core.indexOf('-- Defensa por defecto'));
  for (const nombre of nombres) assert.ok(cierre.includes(`'${nombre}'`),`Falta en RLS: ${nombre}`);
  assert.match(cierre,/enable row level security/);
  assert.match(cierre,/revoke all on public/);
});
test('las pujas se validan por auth.uid() y por bloqueo transaccional',()=>{
  assert.match(rpc,/auth\.uid\(\)/);
  assert.match(rpc,/for update of t/);
  assert.match(rpc,/v_plantilla_count \+ v_pujas_count >= v_max_plantilla/);
  assert.match(rpc,/v_total_pujas \+ p_importe_centimos > v_limite/);
  assert.match(rpc,/accepted_at,status\)/);
});
test('no se concede SELECT directo de tabla de pujas a authenticated',()=>{
  assert.doesNotMatch(core+fks+rpc,/grant\s+select\s+on\s+public\.bids\s+to\s+authenticated/i);
  assert.match(rpc,/grant execute on function public\.macroliga_mis_pujas\(\) to authenticated/);
  assert.match(rpc,/where m\.auth_user_id = auth\.uid\(\)/);
});
test('funciones elevadas fijan search_path vacío y revocan PUBLIC',()=>{
  assert.equal((rpc.match(/security definer\s*set search_path = ''/g)||[]).length,3);
  assert.equal((rpc.match(/from PUBLIC,anon,authenticated/g)||[]).length,3);
});
test('FK compuestas preservan aislamiento de divisiones',()=>{
  for (const nombre of ['ownership_team_same_division','transfer_seller_same_division','transfer_buyer_same_division',
    'bid_team_same_division','bid_lot_same_division','lineup_team_same_division',
    'gameweek_score_team_same_division','award_team_same_division','manager_offer_buyer_same_division']) {
    assert.ok(fks.includes(nombre),`Falta restricción ${nombre}`);
  }
});
