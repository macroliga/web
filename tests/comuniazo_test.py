"""Pruebas de HTML sintético. No usa red, Laviana ni datos de jugadores reales."""
from datetime import datetime, timezone
import json
from pathlib import Path
import subprocess
import sys
import unittest
import importlib.util
import tempfile
import contextlib
import io
from unittest.mock import patch
from bs4 import BeautifulSoup
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from src.sports import comuniazo as cz

def soup(html):
    return BeautifulSoup(html,"html.parser")

def fixture():
    clubs=sorted(cz.CLUBS)
    pages={}
    active_ids=[]
    rows={}
    positions={p:[] for p in cz.POSITIONS}
    for i,path in enumerate(clubs,1):
        links=[]
        for j in range(25):
            key=f"ficticio-{i}-{j}"
            active_ids.append(key)
            position="porteros" if j<3 else "defensas" if j<10 else "centrocampistas" if j<18 else "delanteros"
            # Los nombres nunca deben servir para derivar un ID. Incluye acentos,
            # cero puntos y jugadores con el mismo nombre en clubes distintos.
            name="Álex de prueba" if j==0 else f"Jugador ficticio {i} {j}"
            price=0 if (i==1 and j==0) else 300000+(i*128971+j*759831)%5200000
            point=0 if j==1 else j*3
            row=f'<tr><td><a href="{cz.LIST}/{key}">{name}</a></td><td>{point}</td><td>0,0</td><td>0</td><td>0,0</td><td>0</td><td>0,0</td><td>{price:,}</td><td>-</td></tr>'.replace(f"{price:,}",f"{price:,}".replace(",","."))
            rows[key]=row
            positions[position].append(key)
            links.append(f'<a href="{cz.LIST}/{key}">{name} 0,0 / 0 / 1.000.000</a>')
        pages[path]=f'<h1>Club ficticio {i}</h1><h2>Jugadores</h2>{"".join(links)}<h2>Lesionados</h2><a href="{cz.LIST}/ficticio-{i}-1">Lesión temporal</a><h2>Noticias</h2><a href="{cz.LIST}/historico-0">Antiguo fichaje</a>'
    for j in range(50):
        key=f"historico-{j}"
        rows[key]=f'<tr><td><a href="{cz.LIST}/{key}">Histórico {j}</a></td><td>900</td><td>0,0</td><td>0</td><td>0,0</td><td>0</td><td>0,0</td><td>90.000.000</td><td>-</td></tr>'
        positions[list(positions)[j%4]].append(key)
    def table(keys):
        return '<table><tr><th>Jugador</th><th>Puntos</th></tr>'+''.join(rows[k] for k in keys)+'</table>'
    pages[cz.INDEX]=''.join(f'<a href="{path}">Club</a>' for path in clubs)
    pages[cz.list_path()]=table(rows)
    for pos,keys in positions.items(): pages[cz.list_path(pos)]=table(keys)
    return pages,active_ids

class TestComuniazo(unittest.TestCase):
    def setUp(self):
        self.pages,self.ids=fixture()
        self.calls=[]
    def fetch(self,path):
        self.calls.append(path)
        return soup(self.pages[path])
    def extract(self,previous=None):
        return cz.extract_catalog(self.fetch,permission_ref="Prueba ficticia local; sin autorización real",now=datetime(2026,11,26,8,tzinfo=timezone.utc),previous=previous)
    def test_diagnostico_solo_contadores(self):
        report=cz.diagnostico_publico(self.fetch)
        self.assertEqual(report["active"],500)
        self.assertEqual(report["excluded"],50)
        self.assertNotIn("points",report)
        self.assertNotIn("excludedRows",report)
        self.assertNotIn("players",report)
        self.assertEqual(len(self.calls),26)
    def test_completo(self):
        snap,info=self.extract()
        self.assertEqual((info["clubs"],info["downloaded"],info["active"],info["excluded"]),(20,550,500,50))
        self.assertEqual(set(p["externalId"] for p in snap["players"]),set(self.ids))
        self.assertEqual(len(self.calls),26)
        self.assertTrue(all(p["active"] for p in snap["players"]))
        self.assertEqual(len([p for p in snap["players"] if p["name"]=="Álex de prueba"]),20)
        self.assertEqual(next(p for p in snap["players"] if p["externalId"]=="ficticio-1-0")["marketValueCents"],"0")
        self.assertIn("ficticio-1-1",{p["externalId"] for p in snap["players"]})  # lesionado/0 puntos
        self.assertNotIn("excludedRows",info)
        self.assertNotIn("historico-0",json.dumps(info))
        self.assertEqual(len(info["points"]),500)
    def test_indice_denegado_no_intenta_otras_rutas(self):
        from urllib.error import HTTPError
        calls=[]
        def denied(path):
            calls.append(path)
            raise HTTPError(cz.ORIGIN+path,429,"Too Many Requests",None,None)
        with self.assertRaises(HTTPError):
            cz.diagnostico_publico(denied)
        self.assertEqual(calls,[cz.INDEX])

    def test_fallback_indice_vacio(self):
        self.pages[cz.INDEX]="<h1>LaLiga</h1>"
        self.assertEqual(self.extract()[1]["active"],500)
    def test_indice_parcial(self):
        self.pages[cz.INDEX]=self.pages[cz.INDEX].replace(f'<a href="{sorted(cz.CLUBS)[-1]}">Club</a>',"")
        with self.assertRaisesRegex(ValueError,"20 de la temporada"): self.extract()
    def test_club_incompleto(self):
        self.pages[sorted(cz.CLUBS)[0]]="<h1>Club</h1><h2>Jugadores</h2>"
        with self.assertRaisesRegex(ValueError,"Plantilla incompleta"):self.extract()
    def test_conflicto_clubes(self):
        path=sorted(cz.CLUBS)[1]
        self.pages[path]=self.pages[path].replace("<h2>Lesionados</h2>",f'<a href="{cz.LIST}/ficticio-1-1">Conflicto</a><h2>Lesionados</h2>')
        with self.assertRaisesRegex(ValueError,"dos clubes"): self.extract()
    def test_activo_sin_valor(self):
        self.pages[cz.list_path()]=self.pages[cz.list_path()].replace(f'{cz.LIST}/ficticio-1-1',f'{cz.LIST}/historico-nuevo')
        with self.assertRaisesRegex(ValueError,"activos sin valor"):self.extract()
    def test_activo_sin_posicion(self):
        self.pages[cz.list_path("porteros")]=self.pages[cz.list_path("porteros")].replace(f'{cz.LIST}/ficticio-1-1',f'{cz.LIST}/sin-posicion')
        with self.assertRaisesRegex(ValueError,"sin posición"):self.extract()
    def test_anuncios_tabla_real(self):
        # Estructura comprobada contra la página pública (sin datos reales).
        ads='<tr><td colspan="9"><div class="axd-desktop axd-content"></div></td></tr><tr><td colspan="9"></td></tr>'
        self.pages[cz.list_path()]=self.pages[cz.list_path()].replace('</table>',ads+'</table>')
        self.assertEqual(self.extract()[1]["downloaded"],550)
        # Una fila deportiva perdida no se puede disfrazar de espacio de anuncios.
        self.pages[cz.list_path()]=self.pages[cz.list_path()].replace('</table>','<tr><td colspan="9">Jugador sin ficha</td></tr></table>')
        with self.assertRaisesRegex(ValueError,"Tabla con filas"): self.extract()
    def test_fila_invalida(self):
        self.pages[cz.list_path()]=self.pages[cz.list_path()].replace(f'<a href="{cz.LIST}/historico-1">Histórico 1</a>',"Histórico 1")
        # La tabla cae por debajo del mínimo o contiene fila sin ficha.
        with self.assertRaisesRegex(ValueError,"Tabla"):self.extract()
    def test_conflicto_posicion(self):
        self.pages[cz.list_path("porteros")]=self.pages[cz.list_path("porteros")].replace(f'{cz.LIST}/ficticio-1-1',f'{cz.LIST}/ficticio-1-4')
        with self.assertRaisesRegex(ValueError,"dos posiciones"):self.extract()
    def test_baja_y_regreso(self):
        snap,_=self.extract()
        path=sorted(cz.CLUBS)[0]
        original=self.pages[path]
        self.pages[path]=original.replace(f'href="{cz.LIST}/ficticio-1-1"',f'href="{cz.LIST}/historico-0"',1)
        # El histórico ya estaba en la tabla y posición; pasa a activo.
        daily,info=self.extract(snap)
        by_id={p["externalId"]:p for p in daily["players"]}
        self.assertFalse(by_id["ficticio-1-1"]["active"])
        self.assertTrue(by_id["historico-0"]["active"])
        self.assertEqual(info["historicalRetained"],1)
        self.assertEqual(info["changes"]["deactivated"],1)
        self.assertEqual(info["changes"]["newPlayers"],1)
        self.assertEqual(by_id["ficticio-1-1"]["marketValueCents"],next(p["marketValueCents"] for p in snap["players"] if p["externalId"]=="ficticio-1-1"))
        self.pages[path]=original
        again,_=self.extract(daily)
        self.assertTrue(next(p["active"] for p in again["players"] if p["externalId"]=="ficticio-1-1"))
    def test_demasiadas_bajas(self):
        snap,_=self.extract()
        previous={**snap,"players":[*snap["players"],*[{**snap["players"][0],"externalId":f"baja-{i}"} for i in range(31)]]}
        with self.assertRaisesRegex(ValueError,"Demasiadas bajas"): self.extract(previous)
    def test_valores_and_links(self):
        for value in ["-10","1,5M","100 €","1.000.00",""]:
            with self.assertRaises(ValueError):cz.parse_euros(value)
        self.assertEqual(cz.parse_euros("1.234.567"),"123456700")
        for url in ["https://www.comuniazo.com.evil.test"+cz.LIST+"/id","http://www.comuniazo.com"+cz.LIST+"/id",cz.LIST+"/id?secret=1"]:
            self.assertIsNone(cz.slug_from_link(url))
    def test_permiso_y_rutas(self):
        with self.assertRaisesRegex(ValueError,"autorización"):cz.fetcher({})
        valid={"authorized":True,"provider":"comuniazo","competition":"LALIGA","season":cz.SEASON,"permissionRef":"Prueba local"}
        fn=cz.fetcher(valid)
        with self.assertRaisesRegex(ValueError,"Ruta no permitida"):fn("https://otraweb.test")
    def test_contrato_y_reparto(self):
        snap,info=self.extract()
        # Caso de regresión histórico: se conserva sin poder repartirse.
        old={**snap,"players":[*snap["players"],{**snap["players"][0],"externalId":"baja-confirmada","marketValueCents":"80000000","active":True}]}
        next_snapshot,_=self.extract(old)
        result=subprocess.run(["node","--input-type=module","-e",'''
          import {readFileSync} from 'node:fs';
          import {normalizarCatalogo,verificarCatalogo} from './src/domain/catalogo-deportivo.mjs';
          import {planificarReparto} from './src/domain/reparto-inicial.mjs';
          import {divisionFicticia} from './src/demo/catalogo-ficticio.mjs';
          const snap=normalizarCatalogo(JSON.parse(readFileSync(0,'utf8')));
          verificarCatalogo(snap);
          const plan=planificarReparto(snap,divisionFicticia(),{seed:'comuniazo-html'});
          const assigned=plan.allocations.flatMap(x=>x.players);
          if(assigned.length!==240||assigned.some(p=>p.externalId==='baja-confirmada'||p.externalId.startsWith('historico-')))throw Error('Asignación indebida');
          console.log(JSON.stringify({teams:plan.allocations.length,assigned:assigned.length,unassigned:plan.unassignedActive}));
        '''],input=json.dumps(next_snapshot),text=True,cwd=ROOT,capture_output=True,check=True)
        self.assertEqual(json.loads(result.stdout),{"teams":16,"assigned":240,"unassigned":260})

    def test_vista_previa_publica_sin_credenciales_ni_archivos(self):
        spec=importlib.util.spec_from_file_location("cz_cli",ROOT/"scripts/descargar-comuniazo.py")
        cli=importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cli)
        base=ROOT/".macroliga-local"
        base.mkdir(exist_ok=True)
        before=set(base.iterdir())
        output=io.StringIO()
        with patch.object(cli,"_public_fetcher",return_value=self.fetch),patch.object(sys,"argv",["cli","--vista-previa"]),contextlib.redirect_stdout(output):
            self.assertEqual(cli.main(),0)
        info=json.loads(output.getvalue())
        self.assertEqual(info["teams"],16)
        self.assertEqual(info["assigned"],240)
        self.assertEqual(info["marketFeasible"],15)
        self.assertEqual(info["marketSlots"],{"GK":2,"DEF":5,"MID":5,"FWD":3})
        self.assertEqual(info["wealthCents"],"7000000000")
        self.assertNotIn("players",info)
        self.assertEqual(len(self.calls),26)
        self.assertEqual(set(base.iterdir()),before)

    def test_cli_atomicidad_y_una_descarga(self):
        spec=importlib.util.spec_from_file_location("cz_cli",ROOT/"scripts/descargar-comuniazo.py")
        cli=importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cli)
        base=ROOT/".macroliga-local"
        base.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="test-comuniazo-",dir=base) as tmp:
            tmp=Path(tmp)
            permiso=tmp/"permiso.json"
            permiso.write_text(json.dumps({"authorized":True,"provider":"comuniazo","competition":"LALIGA","season":cz.SEASON,"permissionRef":"Solo fixture local de prueba"}))
            out=tmp/"salida"
            with patch.object(cli,"fetcher",return_value=self.fetch),patch.object(sys,"argv",["cli","--permiso",str(permiso),"--directorio",str(out)]),contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(cli.main(),0)
                with self.assertRaisesRegex(ValueError,"Ya existe una descarga"):cli.main()
            days=list(out.iterdir())
            self.assertEqual(len(days),1)
            snapshot=json.loads((days[0]/"catalogo.json").read_text())
            report=json.loads((days[0]/"informe-deportivo.json").read_text())
            self.assertEqual(snapshot["snapshotHash"],report["snapshotHash"])
            self.assertEqual(len(snapshot["players"]),500)
            self.assertNotIn("excludedRows",report)
            self.assertNotIn("historico-0",json.dumps(report))
            self.assertEqual(len(self.calls),26)
            bad=tmp/"mal"
            self.pages[sorted(cz.CLUBS)[0]]="<h1>Club</h1>"
            with patch.object(cli,"fetcher",return_value=self.fetch),patch.object(sys,"argv",["cli","--permiso",str(permiso),"--directorio",str(bad)]):
                with self.assertRaises(ValueError):cli.main()
            self.assertEqual(list(bad.iterdir()),[])
if __name__=="__main__":unittest.main(verbosity=2)
