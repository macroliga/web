import test from 'node:test';
import assert from 'node:assert/strict';
import { mercadoAbierto, equipoMaloAbierto, euros } from '../app/logic.mjs';
import { crearCliente } from '../app/api.mjs';

test('horario del mercado de invierno en Europe/Madrid', () => {
  assert.equal(mercadoAbierto(new Date('2026-11-26T00:00:00Z')), false); // 01:00
  assert.equal(mercadoAbierto(new Date('2026-11-26T04:59:00Z')), false); // 05:59
  assert.equal(mercadoAbierto(new Date('2026-11-26T05:00:00Z')), true);  // 06:00
  assert.equal(mercadoAbierto(new Date('2026-11-26T23:59:00Z')), true);  // 00:59
});

test('horario del mercado con cambio de horario de verano', () => {
  assert.equal(mercadoAbierto(new Date('2027-06-26T03:59:00Z')), false);
  assert.equal(mercadoAbierto(new Date('2027-06-26T04:00:00Z')), true);
  assert.equal(mercadoAbierto(new Date('2027-06-26T23:00:00Z')), false); // 01:00
});

test('Equipo Malo abierto desde mediodia hasta medianoche', () => {
  assert.equal(equipoMaloAbierto(new Date('2026-11-26T10:59:00Z')), false);
  assert.equal(equipoMaloAbierto(new Date('2026-11-26T11:00:00Z')), true);
  assert.equal(equipoMaloAbierto(new Date('2026-11-26T22:59:00Z')), true);
  assert.equal(equipoMaloAbierto(new Date('2026-11-26T23:00:00Z')), false);
});

test('importes convertidos de centimos a euros', () => {
  assert.match(euros(54000000), /540[.\s\u00a0]?000/);
  assert.equal(euros(NaN), '—');
});

test('cliente no admite configuracion incompleta', () => {
  assert.throws(() => crearCliente({supabaseUrl:'https://xuwjbfnhvvbdargcohfe.supabase.co',anonKey:''}));
});

test('cliente usa identidad propia en RPC y bloquea otras operaciones', async () => {
  const peticiones = [];
  const fetchImpl = async (url,options) => {
    peticiones.push({url,options});
    return {
      ok: true,
      json: async () => url.includes('/auth/') ? {access_token:'token-de-prueba'} : [{equipo_id:'ficticio'}]
    };
  };
  const api = crearCliente({supabaseUrl:'https://xuwjbfnhvvbdargcohfe.supabase.co',
    anonKey:'clave-publica-ficticia',fetchImpl});
  const token = await api.iniciarSesion('ejemplo@example.invalid','clave-ficticia');
  assert.equal(token,'token-de-prueba');
  assert.equal(peticiones[0].options.headers.Authorization, undefined);
  assert.equal(peticiones[0].options.headers.apikey, 'clave-publica-ficticia');
  const perfil = await api.consultar('macroliga_mi_equipo',{},token);
  assert.deepEqual(perfil,[{equipo_id:'ficticio'}]);
  assert.equal(peticiones[1].options.headers.Authorization, 'Bearer token-de-prueba');
  assert.match(peticiones[1].url,/\/rest\/v1\/rpc\/macroliga_mi_equipo$/);
  await assert.rejects(api.consultar('borrar_todo',{},token),/Operacion no permitida/);
  await assert.rejects(api.consultar('macroliga_mi_equipo',{},null),/Debes iniciar sesion/);
  assert.equal(peticiones.length,2);
});

test('rechazar claves privadas en el navegador', () => {
  assert.throws(() => crearCliente({
    supabaseUrl: 'https://xuwjbfnhvvbdargcohfe.supabase.co',
    anonKey: 'sb_secret_NO_PUBLICAR'
  }), /incompleta/);
});

test('cada usuario usa su propio JWT; las contrasenas no se envian a las RPC', async () => {
  const peticiones = [];
  const fetchImpl = async (url, options) => {
    peticiones.push({url, options});
    if (url.endsWith('grant_type=password')) {
      const credentials = JSON.parse(options.body);
      return { ok:true, json:async() => ({
        access_token: credentials.email.includes('manager-a')
          ? 'jwt-usuario-a' : 'jwt-usuario-b'
      }) };
    }
    return { ok:true, json:async() => [{equipo_id:'demo'}] };
  };
  const client = crearCliente({
    supabaseUrl: 'https://xuwjbfnhvvbdargcohfe.supabase.co',
    anonKey: 'sb_publishable_clave_ficticia',
    fetchImpl
  });
  const a = await client.iniciarSesion('manager-a@example.invalid','clave-a');
  const b = await client.iniciarSesion('manager-b@example.invalid','clave-b');
  await client.consultar('macroliga_mi_equipo', {}, a);
  await client.consultar('macroliga_mi_equipo', {}, b);
  assert.equal(peticiones[2].options.headers.Authorization, 'Bearer jwt-usuario-a');
  assert.equal(peticiones[3].options.headers.Authorization, 'Bearer jwt-usuario-b');
  assert.ok(!peticiones[2].options.body.includes('clave-a'));
  assert.ok(!peticiones[3].options.body.includes('clave-b'));
});

test('fallo de login y fallo de permiso se informan sin entregar datos', async () => {
  const client = crearCliente({
    supabaseUrl: 'https://xuwjbfnhvvbdargcohfe.supabase.co',
    anonKey: 'sb_publishable_clave_ficticia',
    fetchImpl: async() => ({ok:false,status:401,json:async() => ({error:'no autorizado'})})
  });
  await assert.rejects(client.iniciarSesion('invalido@example.invalid','clave'), /No se pudo completar el acceso/);
  await assert.rejects(client.consultar('macroliga_plantilla_equipo',{p_equipo_id:'ajeno'},'jwt'), /No se pudo completar el acceso/);
});

test('inicio de sesión guardable devuelve refresh token distinto del PIN', async () => {
  const calls = [];
  const api = crearCliente({
    supabaseUrl:'https://xuwjbfnhvvbdargcohfe.supabase.co',
    anonKey:'sb_publishable_ficticia',
    fetchImpl:async(url,options)=>{
      calls.push({url,options});
      return {ok:true,json:async()=>({
        access_token:'jwt-test-a',refresh_token:'refresh-token-a-largo-para-ensayos',
        expires_in:3600
      })};
    }
  });
  const result=await api.iniciarSesionConSesion('demo01@macroliga.invalid','123456');
  assert.deepEqual(result,{
    accessToken:'jwt-test-a',
    refreshToken:'refresh-token-a-largo-para-ensayos',
    expiresIn:3600
  });
  assert.equal(calls.length,1);
  assert.match(calls[0].url,/grant_type=password$/);
  assert.equal(calls[0].options.headers.Authorization,undefined);
});

test('la recuperación automática usa refresh token y no vuelve a solicitar PIN', async () => {
  const calls=[];
  const api=crearCliente({
    supabaseUrl:'https://xuwjbfnhvvbdargcohfe.supabase.co',
    anonKey:'sb_publishable_ficticia',
    fetchImpl:async(url,options)=>{
      calls.push({url,body:JSON.parse(options.body),headers:options.headers});
      return {ok:true,json:async()=>({
        access_token:'jwt-renovado',
        refresh_token:'refresh-rotado-con-valor-aleatorio-de-prueba',
        expires_in:3599
      })};
    }
  });
  const renovado=await api.renovarSesion('refresh-original-de-mas-de-veinte-caracteres');
  assert.equal(renovado.accessToken,'jwt-renovado');
  assert.equal(renovado.refreshToken,'refresh-rotado-con-valor-aleatorio-de-prueba');
  assert.equal(calls.length,1);
  assert.match(calls[0].url,/grant_type=refresh_token$/);
  assert.deepEqual(Object.keys(calls[0].body),['refresh_token']);
  assert.ok(!JSON.stringify(calls[0]).includes('123456'));
  assert.equal(calls[0].headers.Authorization,undefined);
});

test('un refresh token inválido no genera un inicio de sesión artificial', async () => {
  const api=crearCliente({
    supabaseUrl:'https://xuwjbfnhvvbdargcohfe.supabase.co',
    anonKey:'sb_publishable_ficticia',
    fetchImpl:async()=>({ok:false,status:401,json:async()=>({error:'invalid_grant'})})
  });
  await assert.rejects(api.renovarSesion('refresh-original-de-mas-de-veinte-caracteres'),
    (err)=>err.status===401 && /credenciales/.test(err.message));
});
