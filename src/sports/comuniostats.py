"""Parser de la búsqueda pública estándar de ComunioStats.
No realiza peticiones, almacena datos, autoriza fuentes ni escribe en Supabase.
Separa explícitamente puntos acumulados de puntos por jornada.
"""
import re
from collections import Counter
from urllib.parse import urlsplit, parse_qs
from bs4 import BeautifulSoup

POSITIONS = {"Torwart": "GK", "Abwehr": "DEF", "Mittelfeld": "MID", "Sturm": "FWD",
             "Keeper": "GK", "Defender": "DEF", "Midfielder": "MID", "Striker": "FWD"}
PAGE_SIZE = 25


def _one(items, message):
    if len(items) != 1:
        raise ValueError(message)
    return items[0]


def _integer(value):
    if not re.fullmatch(r"[+-]?\d+", value):
        raise ValueError("Puntuación ausente o no entera")
    n = int(value)
    if not -(2**31) <= n < 2**31:
        raise ValueError("Puntuación fuera de rango")
    return n


def parse_search_page(html, *, season, matchday=None, offset=0):
    """Lee una página de una búsqueda ya obtenida por un operador legítimo.
    El rango se comprueba contra los controles de la propia respuesta.
    La evidencia de cierre de jornada se verifica fuera de este parser.
    """
    if not isinstance(season, int) or not 2000 <= season <= 2100:
        raise ValueError("Temporada inválida")
    if matchday is not None and (not isinstance(matchday, int) or not 1 <= matchday <= 38):
        raise ValueError("Jornada inválida")
    if not isinstance(offset, int) or offset < 0 or offset % PAGE_SIZE:
        raise ValueError("Página inválida")
    soup = BeautifulSoup(html, 'html.parser')
    form = _one(soup.select('form[action="/search.php"]'), 'Formulario de búsqueda ausente o ambiguo')
    def selected(name):
        return _one(form.select(f'select[name="{name}"] option[selected]'), 'Filtro sin valor explícito').get('value')
    if selected('season') != str(season):
        raise ValueError('La temporada de la respuesta no coincide')
    if form.select('input[name="inclInactive"][checked]'):
        raise ValueError('La búsqueda incluye inactivos')
    if {i.get('value') for i in form.select('input[name="pos[]"][checked]')} != {'t','a','m','s'}:
        raise ValueError('Faltan posiciones en la búsqueda')
    for field in ('name','minValue','maxValue','minPts','maxPts'):
        control = _one(form.select(f'input[name="{field}"]'), 'Filtro de búsqueda ausente')
        if (control.get('value') or '').strip(): raise ValueError('La búsqueda limita resultados')
    mode = _one(form.select('input[name="chkGd"][checked]'), 'Rango de puntos ambiguo').get('value')
    if matchday is None:
        if mode != 'all':
            raise ValueError('Se esperaban puntos acumulados')
    elif mode != 'sel' or selected('startGd') != str(matchday) or selected('endGd') != str(matchday):
        raise ValueError('La jornada de la respuesta no coincide')
    totals = []
    for tag in soup.select('td.center'):
        m = re.fullmatch(r'(?:gefundene Spieler|players found|jugadores encontrados)\s*:\s*(\d+)', tag.get_text(' ', strip=True), re.I)
        if m: totals.append(int(m[1]))
    total = _one(totals, 'Total de resultados no verificable')
    if not 490 <= total <= 800 or offset >= total:
        raise ValueError('Cobertura de búsqueda inválida')
    # Identidad de la página: los enlaces de paginación incluyen todos los offsets
    # excepto el de la página seleccionada. El total por sí solo no basta.
    offsets = {0}
    for anchor in soup.select('a[href]'):
        link = urlsplit(anchor['href'])
        if link.scheme or link.netloc or link.path != '/search.php':
            continue
        q = parse_qs(link.query)
        if 'startLimit' in q:
            try: offsets.add(int(q['startLimit'][0]))
            except (ValueError, IndexError): raise ValueError('Paginación inválida') from None
    expected = set(range(0, total, PAGE_SIZE))
    if not offsets <= expected or expected - offsets not in (set(), {offset}):
        raise ValueError('Paginación incongruente')
    table = _one(soup.select('table.zoomable'), 'Tabla de resultados ausente o ambigua')
    headers = [th.get_text(' ', strip=True) for th in table.select('th')]
    if len(headers) != 9 or headers[1:4] not in (['Name','Club','Marktwert / Trend'], ['Name','Club','Market value / Trend']) or headers[6] not in ('Punkte','Points'):
        raise ValueError('Cabecera de resultados desconocida')
    rows = []
    footers = 0
    for tr in table.select('tr'):
        cells = tr.find_all('td', recursive=False)
        if not cells: continue
        player = tr.select('a.playerName[href^="/csprofile/"]')
        if not player:
            # El pie de paginación no es un jugador; ninguna otra fila se ignora.
            if (len(cells)==2 and cells[0].get('colspan')=='3' and cells[1].get('colspan')=='9'
                    and cells[0].get_text(' ',strip=True).endswith(': '+str(total))
                    and cells[1].select('a[href*="startLimit="]')):
                current = _one(cells[1].select('span.bold'), 'Página seleccionada ambigua')
                if current.get_text(strip=True)!=str(offset//PAGE_SIZE+1): raise ValueError('Página inesperada')
                footers += 1
                continue
            raise ValueError('Fila sin identidad de futbolista')
        player = _one(player, 'Identidad de futbolista ambigua')
        if len(cells) != 10: raise ValueError('Fila deportiva incompleta')
        pid = re.fullmatch(r'/csprofile/(\d+)-[^/?#]+', player['href'])
        pos = _one(cells[0].select('img[alt]'), 'Posición desconocida').get('alt')
        club = _one(cells[2].select('img[alt]'), 'Club desconocido').get('alt')
        name = player.get_text(' ',strip=True)
        price = cells[3].get_text(strip=True)
        if not pid or not name or not club or pos not in POSITIONS or not re.fullmatch(r'(?:\d+|\d{1,3}(?:\.\d{3})+)', price):
            raise ValueError('Identidad, posición, club o valor inválidos')
        cents = int(price.replace('.',''))*100
        if cents > 2**63-1: raise ValueError('Valor fuera de rango')
        app = re.fullmatch(r'(\d+)\s*\((\d+)\)', cells[5].get_text(' ',strip=True))
        if not app or int(app[2]) > int(app[1]): raise ValueError('Participación no verificable')
        rows.append({'externalId':pid[1], 'name':name,'club':club,'position':POSITIONS[pos], 'marketValueCents':str(cents), 'points':_integer(cells[7].get_text(strip=True)), 'appearances':int(app[1]), 'ratedAppearances':int(app[2])})
    if footers != 1 or len(rows) != min(PAGE_SIZE,total-offset) or len({r['externalId'] for r in rows}) != len(rows):
        raise ValueError('Página incompleta o duplicada')
    return {'season':season,'matchday':matchday,'offset':offset,'total':total,'rows':rows}


def combine_search_pages(pages, *, season, matchday=None):
    """Exige cobertura de todas las páginas, clubes y posiciones activas."""
    if not pages: raise ValueError('Sin páginas')
    totals = {p['total'] for p in pages}
    if len(totals) != 1: raise ValueError('El total cambió durante la consulta')
    total = next(iter(totals))
    offsets = [p['offset'] for p in pages]
    if sorted(offsets) != list(range(0,total,PAGE_SIZE)) or any(p['season'] != season or p['matchday'] != matchday for p in pages):
        raise ValueError('Faltan páginas o se mezclan jornadas')
    rows = [r for p in pages for r in p['rows']]
    clubs = Counter(r['club'] for r in rows)
    if len(rows) != total or len({r['externalId'] for r in rows}) != total or len(clubs) != 20 or min(clubs.values()) < 15 or max(clubs.values()) > 80 or {r['position'] for r in rows} != set(POSITIONS.values()):
        raise ValueError('Cobertura de jugadores, clubes o posiciones incompleta')
    return {r['externalId']:r for r in rows}


def join_season_and_matchday(accumulated, day, *, matchday, matchday_final=False):
    """Nunca usa acumulados como puntos de jornada ni da por cerrado un partido.
    Muestra puntos observados por jornada; solo autoriza finalizarlos cuando el
    operador aporta una verificación externa de cierre de todos los partidos.
    """
    if not isinstance(matchday,int) or not 1 <= matchday <= 38 or type(matchday_final) is not bool:
        raise ValueError('Jornada o estado inválido')
    if not accumulated or set(accumulated) != set(day): raise ValueError('Identidades inconsistentes entre consultas')
    result=[]
    for key in sorted(accumulated):
        a,b=accumulated[key],day[key]
        if any(a[k] != b[k] for k in ('externalId','name','club','position','marketValueCents')): raise ValueError('Cambió la fotografía deportiva entre consultas')
        if b['appearances'] > 1: raise ValueError('La búsqueda de jornada contiene más de un partido')
        result.append({k:a[k] for k in ('externalId','name','club','position','marketValueCents')} | {'active':True,'seasonPoints':a['points'],'matchday':matchday,'observedMatchdayPoints':b['points'],'matchdayPoints':b['points'] if matchday_final else None,'ratedAppearances':b['ratedAppearances']})
    return result
