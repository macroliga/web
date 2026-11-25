/**
 * MACROLIGA · Catálogo de cláusulas (SOLO REFERENCIA, NO EJECUTABLE PARA PAGAR).
 *
 * No se inventan precios entre umbrales. El CSV original tiene una columna
 * "Hasta" vacía; el criterio de intervalos y el redondeo siguen sin aprobar.
 * Cálculos exactos en BigInt, sin coma flotante.
 */
function enteroPositivo(texto,nombre) {
  if (!/^\d+$/.test(String(texto))) throw new Error(nombre+": debe ser un entero decimal");
  return BigInt(texto);
}
function fraccionDecimal(texto) {
  if (!/^\d+(?:\.\d+)?$/.test(String(texto))) throw new Error("Multiplicador decimal inválido");
  const [entero,decimales=""]=texto.split(".");
  return {num:BigInt(entero+decimales),den:10n**BigInt(decimales.length)};
}
function importeClausulaCentimos(valorEur,multiplicador) {
  const valor=enteroPositivo(valorEur,"Valor");
  const {num,den}=fraccionDecimal(multiplicador);
  const numerador=valor*100n*num;
  if (numerador%den!==0n) throw new Error("PRECISION_PENDIENTE: habría fracción de céntimo");
  return numerador/den;
}
export function leerCatalogoCsv(texto,{original=false}={}) {
  if (typeof texto!=="string") throw new TypeError("Se necesita texto CSV");
  const lineas=texto.trim().split(/\r?\n/);
  const cabecera=original
    ?"fila_origen,valor_eur,multiplicador,clausula_eur,prima_eur"
    :"valor_eur,multiplicador,clausula_eur,prima_eur";
  if (lineas.shift()!==cabecera) throw new Error("Cabecera CSV inesperada");
  return lineas.map((linea,i)=>{
    const campos=linea.split(",");
    if (campos.length!==(original?5:4)) throw new Error("Fila CSV inválida: "+(i+2));
    const [fila,valor,multiplicador,total,prima]=original
      ?campos : [String(i+1),...campos];
    const v=enteroPositivo(valor,"Valor");
    const t=enteroPositivo(total,"Cláusula");
    const p=enteroPositivo(prima,"Prima");
    const calculado=importeClausulaCentimos(valor,multiplicador);
    if (t*100n!==calculado||v+p!==t) {
      throw new Error("IMPORTE_DESCUADRADO: fila "+(i+2));
    }
    return {fila:Number(fila),valorEur:v,multiplicador,clausulaEur:t,primaEur:p};
  });
}
export function auditarCatalogoOriginal(filas) {
  if (!Array.isArray(filas)) throw new TypeError("Catálogo no válido");
  const duplicados=[];
  const saltosPrima=[];
  const saltosMultiplicador=[];
  for (let i=1;i<filas.length;i++) {
    const anterior=filas[i-1],actual=filas[i];
    if (actual.valorEur<anterior.valorEur) throw new Error("Filas desordenadas");
    if (actual.valorEur===anterior.valorEur) {
      duplicados.push({fila:actual.fila,valorEur:actual.valorEur,identica:
        actual.multiplicador===anterior.multiplicador &&
        actual.clausulaEur===anterior.clausulaEur});
    }
    if (actual.primaEur<anterior.primaEur) saltosPrima.push(actual.fila);
    if (Number(actual.multiplicador)>Number(anterior.multiplicador)) {
      saltosMultiplicador.push(actual.fila);
    }
  }
  return {filas:filas.length,duplicados,saltosPrima,saltosMultiplicador};
}
export function consultarPrecioExacto(filas,valorEur) {
  const valor=typeof valorEur==="bigint"?valorEur:enteroPositivo(valorEur,"Valor");
  const encontrados=filas.filter(f=>f.valorEur===valor);
  if (!encontrados.length) throw new Error("UMBRAL_NO_DEFINIDO: precio entre valores pendientes de regla");
  const primero=encontrados[0];
  if (encontrados.some(x=>x.multiplicador!==primero.multiplicador ||
      x.clausulaEur!==primero.clausulaEur)) {
    throw new Error("DUPLICADO_CONFLICTIVO: requiere decisión del administrador");
  }
  return {valorEur:valor,clausulaCentimos:primero.clausulaEur*100n,
    multiplicador:primero.multiplicador,registrosOriginales:encontrados.length};
}
