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
        self.empty = True
        self.admin_allowed = False
        self.initialized = False
        self.market_open = False
        self.bid = None
        self.lineup_version = 0
        self.official_version = 0
        self.official_slots = [None]*11
        self.confirmed_round = False
        self.lineup_open = True
        self.lineup_slots = [None]*11
        self.listing = None

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
            return respond([{'jugador_id':'p1','nombre_jugador':'Futbolista ficticio','posicion':'DEL','club':'Prueba',
                             'valor_mercado_centimos':1000000}])
        if path.endswith('macroliga_mercado_visible'):
            assert body == {'p_division_id':'division-prueba'}
            if self.empty: return respond([])
            return respond([{'jugador_id':f'm{i}','nombre_jugador':f'Ficticio {i}','posicion':pos,'club':'Club ficticio','valor_mercado_centimos':'1000000','puntos_acumulados':i,'estado':'open' if self.market_open else 'draft'} for i,pos in enumerate(['GK']*2+['DEF']*5+['MID']*5+['FWD']*3)])
        if path.endswith('macroliga_operaciones_mercado'):
            assert body == {'p_division_id':'division-prueba'}
            return respond({'pujas_abiertas':self.market_open,'ventas_abiertas':self.market_open,
                'lotes':[{'jugador_id':'m0','lote_id':'lot1','minimo':'1000000','puja_id':'bid1' if self.bid else None,'importe':self.bid}],
                'plantilla':[{'id':'p1','nombre':'Portero ficticio','minimo':'130000000'}],
                'anuncios':[{'id':'listing1','jugador':'Portero ficticio','vendedor':'Equipo ficticio','posicion':'GK','propia':True,'precio':self.listing,'minimo':'130000000'}] if self.listing else [],
                'ofertas':[]})
        if path.endswith('macroliga_presentar_puja'):
            assert self.market_open and body == {'p_lote_id':'lot1','p_importe_centimos':'1000000'}
            self.bid=body['p_importe_centimos'];return respond('bid1')
        if path.endswith('macroliga_retirar_puja'):
            assert body=={'p_puja_id':'bid1'} and self.bid
            self.bid=None;return respond(True)
        if path.endswith('macroliga_operar_venta'):
            assert self.market_open and body['p_division_id']=='division-prueba'
            if body['p_accion']=='listar':
                assert body['p_objeto']=='p1' and body['p_importe_centimos']=='130000000'
                self.listing=body['p_importe_centimos']
            elif body['p_accion']=='cancelar':
                assert body['p_objeto']=='listing1';self.listing=None
            else: raise AssertionError('Acción inesperada')
            return respond('listing1')
        if path.endswith('macroliga_estado_alineacion'):
            assert body == {'p_division_id':'division-prueba'}
            return respond({'jornada_id':'round14' if self.confirmed_round else None,'numero':14 if self.confirmed_round else None,'limite':'2026-11-27T20:00:00Z' if self.confirmed_round else None,'editable':self.confirmed_round and self.lineup_open,'plantilla':[{'id':'p1','nombre':'Portero ficticio','posicion':'GK','club':'Prueba','activo':True}] + [{'id':f'{pos}{i}','nombre':f'{pos} ficticio {i}','posicion':pos,'club':'Prueba','activo':True} for pos,n in [('GK',1),('DEF',5),('MID',5),('FWD',3)] for i in range(n)],
                'partidos':[{'local':'Club A','visitante':'Club B','inicio':'2026-11-27T20:00:00Z','estado':'TIMED'}] if self.confirmed_round else [],'slots':self.official_slots,'version':self.official_version,'borrador':{'version':self.lineup_version,'slots':self.lineup_slots} if self.lineup_version else None})
        if path.endswith('macroliga_guardar_alineacion'):
            assert body['p_division_id']=='division-prueba'
            if body['p_jornada_id']=='round14':
                assert body['p_slots']==['p1']+[f'DEF{i}' for i in range(3)]+[f'MID{i}' for i in range(5)]+[f'FWD{i}' for i in range(2)]
                assert self.lineup_open and body['p_version']==self.official_version
                self.official_slots=body['p_slots'];self.official_version+=1;return respond(self.official_version)
            assert body['p_jornada_id'] is None and body['p_version']==self.lineup_version
            assert body['p_slots']==['p1']+[None]*10
            self.lineup_slots=body['p_slots'];self.lineup_version+=1;return respond(self.lineup_version)
        if path.endswith('macroliga_catalogo_division'):
            assert body['p_division_id']=='division-prueba' and body['p_despues'] is None and body['p_limite'] in (1,250)
            if self.empty:return respond([])
            return respond([
                {'jugador_id':'01','nombre_jugador':'Álvaro ficticio','club':'Club A','propietario_equipo':'Computer','propietario_tipo':'computer','activo':True,'posicion':'GK','valor_mercado_centimos':'10000','puntos_acumulados':0},
                {'jugador_id':'02','nombre_jugador':'Baja ficticia','club':'Club B','propietario_equipo':'Equipo A','propietario_manager':'Manager ficticio','propietario_equipo_id':'t1','propietario_tipo':'team','activo':False,'posicion':'DEF','valor_mercado_centimos':'810050','puntos_acumulados':50}
            ][:body['p_limite']])
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
            def do_GET(self):
                # HTML obsoleto en primera navegación, módulo actual; el
                # parámetro de versión devuelve el HTML vigente.
                if self.path.startswith('/app/?stale=1') and 'release=22' not in self.path:
                    old=(web/'app/index.html').read_text().replace('data-release="22"','data-release="18"').replace('app.js?v=22','app.js?v=18')
                    old=old.replace('id="lineup-formation"','id="old-lineup-formation"')
                    body=old.encode()
                    self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
                    return
                super().do_GET()
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
                expect(page.locator('#home-view .league-status-card')).to_have_count(0)
                expect(page.locator('#home-view .features .tile')).to_have_count(4)
                expect(page.locator('#admin-nav')).to_be_hidden()
                auth.empty=False
                page.evaluate("window.dispatchEvent(new Event('online'))")
                expect(page.locator('#home-view .league-status-card')).to_have_count(0)
                private(page)
                print('PASS Inicio sin estado duplicado, accesos y sesión intactos',flush=True)
                page.locator('[data-view="market"]').first.click()
                expect(page.locator('#market-current-list li')).to_have_count(15)
                expect(page.locator('#market-current-status')).to_contain_text('2 POR · 5 DEF · 5 MED · 3 DEL')
                expect(page.get_by_role('button',name='Pujar',exact=True)).to_be_disabled()
                page.click('#market-sales-tab')
                expect(page.get_by_role('button',name='Poner en venta',exact=True)).to_be_disabled()
                page.locator('.bottom-nav [data-view="home"]').click()
                page.locator('[data-view="team"]').first.click()
                page.locator('.roster-market-button').first.click()
                expect(page.locator('#market-sales-view')).to_be_visible()
                expect(page.get_by_role('button',name='Poner en venta',exact=True)).to_be_disabled()
                auth.market_open=True
                page.locator('.bottom-nav [data-view="home"]').click()
                page.locator('[data-view="market"]').first.click()
                page.get_by_role('button',name='Pujar',exact=True).click()
                expect(page.get_by_role('button',name='Retirar mi puja')).to_be_visible()
                page.get_by_role('button',name='Retirar mi puja').click()
                expect(page.get_by_role('button',name='Pujar',exact=True)).to_be_enabled()
                page.click('#market-sales-tab')
                page.get_by_role('button',name='Poner en venta',exact=True).click()
                expect(page.get_by_role('button',name='Retirar anuncio',exact=True)).to_be_visible()
                page.get_by_role('button',name='Retirar anuncio',exact=True).click()
                expect(page.locator('#market-sales-list')).to_contain_text('Todavía no hay jugadores')
                auth.market_open=False
                page.locator('.bottom-nav [data-view="home"]').click()
                page.locator('[data-view="lineup"]').first.click()
                expect(page.locator('#lineup-slots select')).to_have_count(11)
                page.locator('#lineup-slots select[data-position=GK]').first.select_option('p1')
                expect(page.locator('#lineup-count')).to_contain_text('1 / 11')
                page.click('#lineup-save')
                expect(page.locator('#lineup-message')).to_contain_text('Borrador guardado')
                page.locator('.bottom-nav [data-view="home"]').click()
                page.locator('[data-view="lineup"]').first.click()
                expect(page.locator('#lineup-slots select[data-position=GK]').first).to_have_value('p1')
                private(page)
                assert auth.password_calls == 1
                auth.confirmed_round=True
                page.click('#lineup-reload')
                expect(page.locator('#lineup-status')).to_contain_text('Jornada 14')
                expect(page.locator('#lineup-fixtures')).to_contain_text('Club A')
                expect(page.locator('#lineup-slots select[data-position=GK]').first).to_have_value('p1')
                expect(page.locator('#lineup-save')).to_be_disabled()
                page.select_option('#lineup-formation','3-5-2')
                expect(page.locator('#lineup-slots select[data-position=DEF]')).to_have_count(3)
                expect(page.locator('#lineup-slots select[data-position=MID]')).to_have_count(5)
                expect(page.locator('#lineup-slots select[data-position=FWD]')).to_have_count(2)
                for pos,n in [('DEF',3),('MID',5),('FWD',2)]:
                    for i in range(n):
                        page.locator(f'#lineup-slots select[data-position={pos}]').nth(i).select_option(f'{pos}{i}')
                expect(page.locator('#lineup-count')).to_contain_text('11 / 11')
                expect(page.locator('#lineup-save')).to_be_enabled()
                # Cambiar a un esquema incompatible no borra los jugadores.
                page.select_option('#lineup-formation','4-4-2')
                expect(page.locator('#lineup-formation')).to_have_value('4-4-2')
                expect(page.locator('#lineup-extras')).to_contain_text('MID ficticio 4')
                expect(page.locator('#lineup-save')).to_be_disabled()
                page.select_option('#lineup-formation','3-5-2')
                expect(page.locator('#lineup-extras')).to_be_hidden()
                expect(page.locator('#lineup-count')).to_contain_text('11 / 11')
                page.click('#lineup-save')
                expect(page.locator('#lineup-message')).to_contain_text('Alineación guardada para la jornada 14')
                auth.lineup_open=False
                page.click('#lineup-reload')
                expect(page.locator('#lineup-save')).to_be_disabled()
                private(page)
                assert auth.password_calls == 1
                print('PASS puja, retirada, venta, retirada de anuncio, borrador y alineación oficial cerrada con RPC ficticias',flush=True)
                page.locator('.bottom-nav [data-view="home"]').click()
                page.locator('[data-view="market"]').first.click()
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
                expect(page.locator('#admin-home')).to_have_count(0)
                page.click('#admin-nav')
                expect(page.locator('#admin-state')).to_contain_text('16 equipos')
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
                assert cache_keys == ['macroliga-pwa-estatica-v22'], cache_keys
                cached_urls=page.evaluate('caches.open("macroliga-pwa-estatica-v22").then(c=>c.keys()).then(k=>k.map(r=>r.url))')
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
                calls=auth.password_calls
                page.click('#app-refresh')
                private(page)
                assert auth.password_calls==calls and 'release=22' in page.url
                assert_saved(page)
                print('PASS actualización manual v22 conserva acceso y sesión',flush=True)
                before_refresh=auth.refresh_calls
                page.goto(url+'?stale=1',wait_until='domcontentloaded')
                page.wait_for_url('**release=22')
                private(page)
                assert auth.password_calls==calls and auth.refresh_calls==before_refresh+1
                assert_saved(page)
                print('PASS HTML antiguo y módulo nuevo: actualización única, sin rotación doble ni PIN',flush=True)
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
