// Descargar SOLO una fuente explícitamente aprobada para MACROLIGA.
// El proveedor entrega el contrato JSON canónico. No hace scraping, no usa
// credenciales de Comunio ni crea una suscripción.
import { normalizarCatalogo, texto } from '../domain/catalogo-deportivo.mjs';
const MAX_BYTES = 8 * 1024 * 1024;

function validarFuente(source) {
  if (source?.authorized !== true) throw new Error('Fuente sin autorización documentada');
  let url,origin;
  try { url=new URL(source.url); origin=new URL(source.allowedOrigin); } catch {throw new Error('URL de fuente inválida');}
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||
     origin.origin!==source.allowedOrigin||origin.protocol!=='https:'||url.origin!==origin.origin) {
    throw new Error('Solo HTTPS, origen exacto autorizado y URL sin secretos ni parámetros');
  }
  return {url:url.href,provider:texto(source.provider,'proveedor',100),season:texto(source.season,'temporada',50),
    competition:texto(source.competition,'competición',80),permissionRef:texto(source.permissionRef,'referencia de autorización',500)};
}
async function leerLimitado(response,maxBytes) {
  const length=response.headers.get('content-length');
  if(length!==null&&(!/^\d+$/.test(length)||Number(length)>maxBytes)) throw new Error('Catálogo excede el límite de descarga');
  if(!response.body?.getReader) throw new Error('Respuesta sin contenido válido');
  const reader=response.body.getReader();
  const chunks=[];let bytes=0,done=false;
  try {
    while(true) {
      const chunk=await reader.read();
      if(chunk.done) {done=true;break;}
      bytes+=chunk.value.byteLength;
      if(bytes>maxBytes) throw new Error('Catálogo excede el límite de descarga');
      chunks.push(Buffer.from(chunk.value));
    }
    return Buffer.concat(chunks,bytes).toString('utf8');
  } finally {
    if(!done) await reader.cancel().catch(()=>{});
    reader.releaseLock();
  }
}

export async function descargarCatalogo(source,{fetchImpl=fetch,token,tokenOrigin,maxBytes=MAX_BYTES,timeoutMs=15000}={}) {
  const approved=validarFuente(source);
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>MAX_BYTES||
      !Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>60000) throw new Error('Límites de descarga inválidos');
  const headers={Accept:'application/json'};
  if(source.auth==='bearer') {
    if(tokenOrigin!==source.allowedOrigin) throw new Error('Credencial no vinculada al origen autorizado');
    if(typeof token!=='string'||!token.trim()||/[\r\n]/.test(token)) throw new Error('Credencial de fuente inválida');
    headers.Authorization='Bearer '+token;
  } else if(source.auth!==undefined&&source.auth!=='none') {
    throw new Error('Tipo de autenticación no permitido');
  }
  let response;
  try {
    response=await fetchImpl(approved.url,{method:'GET',headers,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(timeoutMs)});
  } catch {
    // No incluir URL, cabeceras o respuestas que puedan contener credenciales.
    throw new Error('Descarga fallida (red, redirección o timeout)');
  }
  if(!response.ok) throw new Error('Proveedor devolvió HTTP '+response.status);
  if(!/^application\/(?:json|[a-z0-9.+-]+\+json)(?:\s*;|$)/i.test(response.headers.get('content-type')??'')) throw new Error('La fuente no devolvió JSON');
  let raw;
  const body=await leerLimitado(response,maxBytes);
  try{raw=JSON.parse(body);}catch{throw new Error('JSON de catálogo inválido');}
  for(const key of ['provider','competition','season','permissionRef']) {
    if(raw?.[key]!==approved[key]) throw new Error('Metadatos de fuente no coinciden: '+key);
  }
  if(raw.kind!=='authorized') throw new Error('La fuente no declara catálogo autorizado');
  return normalizarCatalogo(raw);
}
