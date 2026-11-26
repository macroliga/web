// Contrato de catálogo versionado. Sin credenciales ni dependencias externas.
import { createHash } from 'node:crypto';

export const POSICIONES = Object.freeze(['GK','DEF','MID','FWD']);
const MAX_BIGINT = 9223372036854775807n;
export const orden = (a,b) => a < b ? -1 : a > b ? 1 : 0;
export const huella = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function texto(value, campo, max = 200) {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim() ||
      value.length > max || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new TypeError(campo + ' inválido');
  }
  return value;
}
export function centimos(value, campo = 'importe') {
  if (typeof value === 'number' && Number.isSafeInteger(value)) value = String(value);
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,18})$/.test(value)) {
    throw new TypeError(campo + ': exigir céntimos enteros no negativos');
  }
  const n = BigInt(value);
  if (n > MAX_BIGINT) throw new RangeError(campo + ' supera BIGINT');
  return n;
}
function fecha(value) {
  texto(value,'fecha');
  const d = new Date(value);
  if (!Number.isFinite(d.valueOf()) || d.toISOString() !== value) {
    throw new TypeError('asOf: fecha UTC ISO con milisegundos obligatoria');
  }
  return value;
}
export function normalizarCatalogo(raw, {allowDiagnostic=false}={}) {
  if (!raw || raw.schemaVersion !== 1 || raw.currency !== 'EUR') throw new TypeError('Versión o moneda de catálogo inválida');
  if (!['authorized','fixture',...(allowDiagnostic?['diagnostic']:[])].includes(raw.kind)) throw new TypeError('Origen de catálogo no declarado');
  const provider = texto(raw.provider,'proveedor',100);
  const competition = texto(raw.competition,'competición',80);
  const season = texto(raw.season,'temporada',50);
  const asOf = fecha(raw.asOf);
  const permissionRef = texto(raw.permissionRef,'referencia de autorización',500);
  if (!Array.isArray(raw.players) || raw.players.length === 0 || raw.players.length > 20000) {
    throw new TypeError('Catálogo vacío o excesivo');
  }
  const ids = new Set();
  const players = raw.players.map(p => {
    const externalId = texto(p?.externalId,'identificador externo',150);
    if (ids.has(externalId)) throw new Error('Identificador externo duplicado: '+externalId);
    ids.add(externalId);
    const name = texto(p.name,'nombre');
    const club = texto(p.club,'club');
    if (!POSICIONES.includes(p.position)) throw new Error('Posición inválida: '+externalId);
    if (typeof p.active !== 'boolean') throw new TypeError('Estado activo obligatorio');
    // No inferimos valores de mercado faltantes ni confundimos euros con céntimos.
    const marketValueCents = centimos(p.marketValueCents,'valor de '+externalId).toString();
    return {externalId,name,club,position:p.position,active:p.active,marketValueCents};
  }).sort((a,b)=>orden(a.externalId,b.externalId));
  const catalogo = {schemaVersion:1,kind:raw.kind,provider,competition,season,currency:'EUR',asOf,permissionRef,players};
  return {...catalogo,snapshotHash:huella(catalogo)};
}

export function verificarCatalogo(snapshot, options) {
  const normalizado = normalizarCatalogo(snapshot, options);
  if (snapshot.snapshotHash !== normalizado.snapshotHash) throw new Error('Huella del catálogo no coincide');
  return normalizado;
}
