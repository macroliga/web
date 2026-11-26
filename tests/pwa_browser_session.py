"""Prueba E2E de la PWA con Chromium móvil y Auth/RPC ficticios.
Ejecutar: python tests/pwa_browser_session.py (Playwright + Chromium + openssl).
No usa credenciales ni realiza llamadas a Supabase real.
"""
import argparse
import json
import os
import shutil
import ssl
import subprocess
import tempfile
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

KEY = 'macroliga.piloto.sesion.v2'
HOST = 'https://xuwjbfnhvvbdargcohfe.supabase.co'
EMAIL = 'demo02@macroliga.invalid'
PIN = '123456' # exclusivamente la identidad ficticia de este servidor de pruebas

class Auth:
    def __init__(self):
        self.password_calls = self.refresh_calls = self.logout_calls = 0
        self.current = None
        self.rpc_error = False
        self.auth_error = None
        self.expires = 3600
        self.valid_access = set()
        self.admin_allowed = False
        self.initialized = False

    def session(self):
        self.current = f'fake{self.password_calls:04d}{self.refresh_calls:04d}'
        assert len(self.current) == 12
        jwt = 'fake-jwt-' + self.current
        self.valid_access.add(jwt)
        return {'access_token': jwt, 'refresh_token': self.current, 'expires_in': self.expires}

    def route(self, route):
        req = route.request
        headers = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers':
                   'apikey,authorization,content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS'}
        def respond(data, status=200):
            route.fulfill(status=status, headers=headers, json=data)
        if req.method == 'OPTIONS':
            return respond({})
        body = req.post_data_json
        path = req.url
        if path.endswith('grant_type=password'):
            assert body == {'email': EMAIL, 'password': PIN}
            self.password_calls += 1
            return respond(self.session())
        if path.endswith('grant_type=refresh_token'):
            if self.auth_error:
                return respond({'error_code': self.auth_error}, 400)
            assert set(body) == {'refresh_token'}
            if body['refresh_token'] != self.current or not self.current:
                return respond({'error_code':'refresh_token_not_found'}, 400)
            self.refresh_calls += 1
            return respond(self.session())
        if '/auth/v1/logout' in path:
            assert path.endswith('?scope=local')
            self.logout_calls += 1
            self.current = None
            return respond({})
        assert req.headers.get('authorization', '').removeprefix('Bearer ') in self.valid_access
        if self.rpc_error:
            return respond({'code':'P0001'}, 400)
        if path.endswith('macroliga_mi_equipo'):
            return respond([{'equipo_id':'ficticio','division_id':'division-prueba','nombre_equipo':'Equipo ficticio',
                'nombre_division':'Division ficticia','saldo_centimos':6990000000 if self.initialized else 500000,'valor_plantilla_centimos':10000000 if self.initialized else 1000000,
                'jugadores':1,'margen_pujas_centimos':500000}])
        if path.endswith('macroliga_plantilla_equipo'):
            assert body == {'p_equipo_id':'ficticio'}
            return respond([{'nombre_jugador':'Futbolista ficticio','posicion':'DEL','club':'Prueba',
                             'valor_mercado_centimos':1000000}])
        if path.endswith('macroliga_mercado_visible'):
            assert body == {'p_division_id':'division-prueba'}
            return respond([{'jugador_id':f'm{i}','nombre_jugador':f'Ficticio {i}','posicion':pos,'club':'Club ficticio','valor_mercado_centimos':'1000000','puntos_acumulados':i,'estado':'preview'} for i,pos in enumerate(['GK']*2+['DEF']*5+['MID']*5+['FWD']*3)])
        if path.endswith('macroliga_catalogo_division'):
            assert body == {'p_division_id':'division-prueba','p_despues':None,'p_limite':250}
            return respond([
                {'jugador_id':'01','nombre_jugador':'Álvaro ficticio','club':'Club A','propietario_equipo':'Computer','propietario_tipo':'computer','activo':True,'posicion':'GK','valor_mercado_centimos':'10000','puntos_acumulados':0},
                {'jugador_id':'02','nombre_jugador':'Baja ficticia','club':'Club B','propietario_equipo':'Equipo A','propietario_manager':'Manager ficticio','propietario_equipo_id':'t1','propietario_tipo':'team','activo':False,'posicion':'DEF','valor_mercado_centimos':'810050','puntos_acumulados':50}
            ])
        if path.endswith('macroliga_historial_traspasos'):
            assert body == {'p_division_id':'division-prueba','p_antes_fecha':None,'p_antes_id':None,'p_limite':50}
            return respond([{'traspaso_id':'h1','fecha':'2026-11-26T10:00:00+00:00','nombre_jugador':'Jugador ficticio vendido','importe_centimos':'800000','origen':'Equipo A','destino':'Computer','tipo':'computer_sale'}])
        if path.endswith('macroliga_clasificacion'):
            assert body == {'p_division_id':'division-prueba'}
            return respond([{'posicion':1,'equipo_id':f'e{i}','nombre_manager':f'Manager ficticio {i}','nombre_equipo':f'Equipo {i}','valor_equipo_centimos':'0','puntos':0,'es_mi_equipo':i==0} for i in range(16)])
        if path.endswith('macroliga_admin_arranque_estado'):
            assert body == {'p_division':'division-prueba'}
            if not self.admin_allowed:
                return respond({'code':'42501'},403)
            return respond({'teamCount':16,'catalogCount':500 if self.initialized else 0,'catalogReady':self.initialized,
                 'initialized':self.initialized,'marketPrepared':self.initialized,'seasonStatus':'draft','maxRoster':16,'wealthCents':'7000000000'})
        if path.endswith('macroliga_admin_iniciar_todo'):
            assert self.admin_allowed and not self.initialized
            assert body['p_division']=='division-prueba' and body['p_wealth']=='7000000000'
            assert body['p_slots']=={'GK':2,'DEF':5,'MID':5,'FWD':3}
            assert body['p_catalogo']['permissionRef']=='ficticia local'
            assert body['p_request']
            self.initialized=True
            return respond({'teams':16,'marketPlayers':15,'marketStatus':'draft','rosterSpreadCents':'100'})
        raise AssertionError('Operacion no permitida')

def run(source):
    with tempfile.TemporaryDirectory(prefix='macroliga-browser-') as d:
        root = Path(d)
        web = root / 'web'
        shutil.copytree(source / 'app', web / 'app')
        (web / 'app/config.js').write_text(
            'window.MACROLIGA_CONFIG = ' + json.dumps({'supabaseUrl':HOST,'anonKey':'sb_publishable_ficticia'}) + ';')
        subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(root/'key.pem'),
                        '-out',str(root/'cert.pem'),'-days','1','-subj','/CN=localhost'],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        class Handler(SimpleHTTPRequestHandler):
            def __init__(self, *args, **kwargs): super().__init__(*args, directory=str(web), **kwargs)
            def log_message(self, *_): pass
        server = ThreadingHTTPServer(('127.0.0.1',0),Handler)
        tls = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        tls.load_cert_chain(root/'cert.pem', root/'key.pem')
        server.socket = tls.wrap_socket(server.socket, server_side=True)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        url = f'https://localhost:{server.server_port}/app/'
        auth = Auth()
        try:
            with sync_playwright() as p:
                def open_browser():
                    ctx=p.chromium.launch_persistent_context(str(root/'profile'), executable_path=os.environ.get('MACROLIGA_CHROMIUM'),
                            headless=True, ignore_https_errors=True, args=['--ignore-certificate-errors'],
                            **{k:v for k,v in p.devices['Pixel 7'].items() if k != 'default_browser_type'})
                    ctx.route(HOST+'/**',auth.route)
                    return ctx, ctx.pages[0] if ctx.pages else ctx.new_page()
                def private(page):
                    expect(page.locator('#private-view')).to_be_visible(timeout=10000)
                    expect(page.locator('#login-view')).to_be_hidden()
                def login(page, remember=True):
                    expect(page.locator('#login-form')).to_be_visible()
                    page.select_option('#manager-select',EMAIL)
                    page.fill('#password',PIN)
                    page.locator('#remember-pin').set_checked(remember)
                    page.click('#login-button')
                    private(page)
                def assert_saved(page):
                    data=json.loads(page.evaluate(f'localStorage.getItem("{KEY}")'))
                    assert data == {'email':EMAIL,'refreshToken':auth.current}, data.keys()
                    assert len(data['refreshToken']) == 12

                ctx,page=open_browser()
                page.goto(url)
                login(page)
                assert_saved(page)
                page.locator('[data-view="market"]').first.click()
                expect(page.locator('#market-current-list li')).to_have_count(15)
                expect(page.locator('#market-current-status')).to_contain_text('2 POR · 5 DEF · 5 MED · 3 DEL')
                page.click('#market-players-tab')
                expect(page.locator('#catalog-status')).to_contain_text('2 de 2 jugadores')
                page.fill('#catalog-search','alvaro')
                expect(page.locator('#catalog-list')).to_contain_text('Álvaro ficticio')
                expect(page.locator('#catalog-status')).to_contain_text('1 de 2')
                page.fill('#catalog-search','')
                page.locator('.market-filter summary').click()
                page.select_option('#catalog-owner','team:t1')
                page.fill('#catalog-min-points','50')
                expect(page.locator('#catalog-list')).to_contain_text('valor congelado')
                expect(page.locator('#catalog-status')).to_contain_text('1 de 2')
                page.click('#market-history-tab')
                expect(page.locator('#history-list')).to_contain_text('Equipo A → Computer')
                expect(page.locator('#history-more')).to_be_hidden()
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
                page.locator('.bottom-nav [data-view="home"]').click()
                expect(page.locator('#history-list li')).to_have_count(0)
                private(page)
                print('PASS mercado móvil: búsqueda, filtros, baja congelada, historial y salida sin PIN',flush=True)
                page.locator('.bottom-nav [data-view="standings"]').click()
                expect(page.locator('#standings-rows tr')).to_have_count(16)
                expect(page.locator('#standings-status')).to_contain_text('16 managers')
                expect(page.locator('#standings-rows .my-standing')).to_contain_text('Manager ficticio 0')
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
                page.locator('.bottom-nav [data-view="home"]').click()
                expect(page.locator('#standings-rows tr')).to_have_count(0)
                print('PASS clasificación móvil de 16 managers a cero y salida sin PIN',flush=True)
                for view in ('team','market','rules','home','lineup','cup','standings','home'):
                    page.locator('.bottom-nav [data-view="home"]').click()
                    page.locator(f'[data-view="{view}"]:visible').first.click()
                    private(page)
                expect(page.locator('#admin-nav')).to_be_hidden()
                # El cambio de permiso solo se determina por respuesta del servidor.
                auth.admin_allowed=True
                page.evaluate("window.dispatchEvent(new Event('online'))")
                expect(page.locator('#admin-nav')).to_be_visible()
                page.click('#admin-nav')
                expect(page.locator('#admin-form-submit')).to_contain_text('Cargar, repartir')
                lot={'catalogo':{'kind':'authorized','permissionRef':'ficticia local','players':[{'externalId':'ficticio','active':True}]},
                     'puntos':[{'externalId':'ficticio','points':0}]}
                page.locator('#admin-file').set_input_files({'name':'lote-ficticio.json','mimeType':'application/json','buffer':json.dumps(lot).encode()})
                page.locator('#admin-source-confirm').check()
                page.locator('#admin-combined-confirm').check()
                page.click('#admin-form-submit')
                expect(page.locator('#admin-message')).to_contain_text('Arranque completo')
                page.locator('.bottom-nav [data-view="home"]').click()
                expect(page.locator('#home-wealth')).to_contain_text('70.000.000')
                page.locator('[data-view="team"]').click()
                expect(page.locator('#team-wealth')).to_contain_text('70.000.000')
                auth.admin_allowed=False
                page.evaluate("window.dispatchEvent(new Event('online'))")
                expect(page.locator('#admin-nav')).to_be_hidden()
                private(page)
                print('PASS administración privada, arranque combinado y patrimonio actualizado sin PIN',flush=True)
                assert auth.password_calls == 1 and auth.refresh_calls == 0
                # El service worker de esta entrega debe estar activo y usar recursos exactos.
                page.evaluate('navigator.serviceWorker.ready')
                page.wait_for_function('navigator.serviceWorker.controller !== null')
                cache_keys=page.evaluate('caches.keys()')
                assert cache_keys == ['macroliga-pwa-estatica-v17'], cache_keys
                cached_urls=page.evaluate('caches.open("macroliga-pwa-estatica-v17").then(c=>c.keys()).then(k=>k.map(r=>r.url))')
                assert all('/config.js' not in u and 'supabase.co' not in u for u in cached_urls)
                assert any('/session.mjs?v=10' in u for u in cached_urls)
                print('PASS acceso único, navegación móvil y caché sin credenciales', flush=True)
                ctx.close()
                ctx,page=open_browser()
                page.goto(url)
                private(page)
                assert auth.password_calls == 1 and auth.refresh_calls == 1
                assert_saved(page)
                print('PASS cerrar por completo y reabrir Chromium con el mismo perfil', flush=True)
                # Error RPC: se mantiene la renovación rotada y no aparece el formulario PIN.
                auth.rpc_error=True
                page.reload()
                expect(page.locator('#session-recovery')).to_be_visible()
                expect(page.locator('#login-form')).to_be_hidden()
                expect(page.locator('#login-message')).to_contain_text('acceso sigue guardado')
                assert_saved(page)
                auth.rpc_error=False
                page.click('#retry-session')
                private(page)
                assert auth.password_calls == 1
                print('PASS fallo RPC 400 y reconexión sin PIN', flush=True)
                # Error de refresh temporal y reintento sin PIN.
                auth.auth_error='unexpected_failure'
                page.reload()
                expect(page.locator('#login-message')).to_contain_text('acceso sigue guardado')
                expect(page.locator('#login-form')).to_be_hidden()
                assert_saved(page)
                auth.auth_error=None
                page.click('#retry-session')
                private(page)
                print('PASS error de Auth no concluyente y recuperación', flush=True)
                # Dos pestañas en la misma instalación, renovaciones serializadas.
                one=ctx.new_page()
                two=ctx.new_page()
                one.goto(url,wait_until='domcontentloaded')
                two.goto(url,wait_until='domcontentloaded')
                private(one)
                private(two)
                assert_saved(two)
                assert auth.password_calls == 1
                page.click('#logout-button')
                expect(page.locator('#login-form')).to_be_visible()
                expect(one.locator('#private-view')).to_be_hidden()
                expect(two.locator('#private-view')).to_be_hidden()
                expect(page.locator('#manager-select')).to_have_value(EMAIL)
                assert page.evaluate(f'localStorage.getItem("{KEY}")') is None
                page.reload()
                expect(page.locator('#login-form')).to_be_visible()
                assert auth.password_calls == 1
                print('PASS dos pestañas, salida explícita y reapertura con PIN requerido', flush=True)
                one.close()
                two.close()
                login(page,remember=False)
                assert page.evaluate(f'localStorage.getItem("{KEY}")') is None
                page.locator('[data-view="market"]').first.click()
                private(page)
                page.reload()
                expect(page.locator('#login-form')).to_be_visible()
                print('PASS modo sin recordar: navegación funciona y el cierre no persiste', flush=True)
                login(page)
                auth.current=None
                page.reload()
                expect(page.locator('#login-message')).to_contain_text('caducado')
                expect(page.locator('#login-form')).to_be_visible()
                assert page.evaluate(f'localStorage.getItem("{KEY}")') is None
                print('PASS sesión revocada: solicita PIN y no muestra datos privados', flush=True)
                ctx.close()
        finally:
            server.shutdown()
            server.server_close()

if __name__=='__main__':
    ap=argparse.ArgumentParser()
    ap.add_argument('--source',type=Path,default=Path(__file__).resolve().parents[1])
    run(ap.parse_args().source)
