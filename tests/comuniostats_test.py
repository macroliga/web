"""Pruebas del parser de ComunioStats con datos completamente ficticios."""
import sys
import unittest
from pathlib import Path
from html import escape
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from src.sports.comuniostats import parse_search_page,combine_search_pages,join_season_and_matchday

TOTAL=551
SEASON=2027
DAY=13

def fixture(offset=0,day=None,include_inactive=False,season=SEASON,total=TOTAL):
    mode='all' if day is None else 'sel'
    selected_day=day if day is not None else 1
    form='<form action="/search.php">'+''.join(f'<input name="{k}" value="">' for k in ('name','minValue','maxValue','minPts','maxPts'))
    form+='<input name="inclInactive" type="checkbox"'+(' checked' if include_inactive else '')+'>'
    form+=''.join(f'<input name="pos[]" value="{p}" checked>' for p in 'tams')
    form+=f'<input name="chkGd" value="{mode}" checked>'
    form+=''.join(f'<select name="{key}"><option value="{val}" selected>{val}</option></select>' for key,val in [('season',season),('startGd',selected_day),('endGd',selected_day)])+'</form>'
    headers=['','Name','Club','Marktwert / Trend','Einsätze (bewertet)','Tore','Punkte','Punkte pro Spiel','Eff.']
    rows=[]
    for i in range(offset,min(offset+25,total)):
        # Same name in two teams; stable numeric identifiers still distinct.
        name='Álex ficticio' if i in (1,2) else f'Ficticio {i}'
        club=f'Club ficticio {i%20+1}'
        pos=['Torwart','Abwehr','Mittelfeld','Sturm'][(i//20)%4]
        points=(i%9-2) if day is not None else i%100
        apps='1 (1)' if day is not None else '10 (9)'
        values=[f'<img alt="{pos}">',f'<a class="playerName" href="/csprofile/{i+1}-Ficticio">{escape(name)}</a>',f'<img alt="{club}">',f'{(100000+i*10000):,}'.replace(',','.'),'',apps,'0',str(points),'0','0']
        rows.append('<tr>'+''.join(f'<td>{x}</td>' for x in values)+'</tr>')
    pages=' '.join(f'<span class="bold">{n//25+1}</span>' if n==offset else f'<a href="/search.php?startLimit={n}">{n//25+1}</a>' for n in range(0,total,25))
    footer=f'<tr><td class="center" colspan="3">gefundene Spieler: {total}</td><td colspan="9">Seite {pages}</td></tr>'
    return form+'<table class="zoomable"><tr>'+''.join(f'<th>{h}</th>' for h in headers)+'</tr>'+''.join(rows)+footer+'</table>'

def load(day=None):
    pages=[parse_search_page(fixture(i,day),season=SEASON,matchday=day,offset=i) for i in range(0,TOTAL,25)]
    return combine_search_pages(pages,season=SEASON,matchday=day)

class StatsTests(unittest.TestCase):
    def test_real_shape_and_full_pagination(self):
        a=load(); b=load(DAY); joined=join_season_and_matchday(a,b,matchday=DAY)
        self.assertEqual(len(joined),TOTAL)
        self.assertEqual(len({p['club'] for p in joined}),20)
        self.assertEqual(len([p for p in joined if p['name']=='Álex ficticio']),2)
        self.assertTrue(any(p['seasonPoints']!=p['observedMatchdayPoints'] for p in joined))
        self.assertTrue(all(p['matchdayPoints'] is None for p in joined))
        final=join_season_and_matchday(a,b,matchday=DAY,matchday_final=True)
        self.assertTrue(all(p['matchdayPoints']==p['observedMatchdayPoints'] for p in final))
        self.assertTrue(any(p['matchdayPoints']<0 for p in final))
    def test_active_only(self):
        with self.assertRaisesRegex(ValueError,'inactivos'): parse_search_page(fixture(include_inactive=True),season=SEASON)
    def test_jornada_incorrecta(self):
        with self.assertRaisesRegex(ValueError,'jornada'): parse_search_page(fixture(day=12),season=SEASON,matchday=DAY)
    def test_acumulado_no_es_jornada(self):
        with self.assertRaisesRegex(ValueError,'jornada'): parse_search_page(fixture(),season=SEASON,matchday=DAY)
        with self.assertRaisesRegex(ValueError,'acumulados'): parse_search_page(fixture(day=DAY),season=SEASON)
    def test_temporada(self):
        with self.assertRaisesRegex(ValueError,'temporada'): parse_search_page(fixture(season=2026),season=SEASON)
    def test_filtro_limitante(self):
        with self.assertRaisesRegex(ValueError,'limita'): parse_search_page(fixture().replace('name="name" value=""','name="name" value="A"'),season=SEASON)
    def test_pagina_erronea(self):
        with self.assertRaises(ValueError): parse_search_page(fixture(offset=25),season=SEASON,offset=0)
    def test_faltan_paginas(self):
        p=parse_search_page(fixture(),season=SEASON)
        with self.assertRaisesRegex(ValueError,'Faltan páginas'): combine_search_pages([p],season=SEASON)
    def test_change_across_snapshots(self):
        a=load(); b=load(DAY); b['1']['marketValueCents']='100'
        with self.assertRaisesRegex(ValueError,'fotografía'): join_season_and_matchday(a,b,matchday=DAY)
    def test_missing_player_across_snapshots(self):
        a=load();b=load(DAY);del b['1']
        with self.assertRaisesRegex(ValueError,'Identidades'):join_season_and_matchday(a,b,matchday=DAY)
    def test_corrupt_points(self):
        with self.assertRaisesRegex(ValueError,'Puntuación'):parse_search_page(fixture().replace('<td>0</td><td>0</td><td>0</td><td>0</td>','<td>0</td><td>NO</td><td>0</td><td>0</td>',1),season=SEASON)

if __name__=='__main__': unittest.main(verbosity=2)
