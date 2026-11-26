"""MACROLIGA: extractor independiente de páginas deportivas de Comuniazo.
Sin dependencias de Laviana, sin credenciales y sin escrituras en Supabase.
La exportación persistente exige documentar la base legítima de reutilización;
la autorización del operador no se presenta como licencia del proveedor.
"""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import re
import unicodedata
from urllib.parse import urljoin, urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler
from bs4 import BeautifulSoup

ORIGIN = "https://www.comuniazo.com"
INDEX = "/laliga"
LIST = "/comunio-apuestas/jugadores"
TEAMS = "/comunio-apuestas/equipos/"
SEASON = "2026_27"
# Rutas públicas de los clubes de la temporada. Se comprueban EN VIVO;
# no se copia ninguna plantilla ni dato de la comunidad de Laviana.
CLUBS = frozenset(TEAMS + slug for slug in (
    "alaves", "athletic", "atletico", "barcelona", "betis", "celta",
    "deportivo", "elche", "espanyol", "getafe", "levante", "malaga",
    "osasuna", "racing", "rayo-vallecano", "real-madrid", "real-sociedad",
    "sevilla", "valencia", "villarreal",
))
POSITIONS = {"porteros": "GK", "defensas": "DEF", "centrocampistas": "MID", "delanteros": "FWD"}
MAX_BYTES = 8 * 1024 * 1024
# Procedencia, no licencia de la web. Solo para uso privado de MACROLIGA.
PUBLIC_HTML_REF = "Operador MACROLIGA: uso privado de campos factuales HTML públicos; licencia del proveedor no acreditada."

def norm(s):
    return "".join(c for c in unicodedata.normalize("NFD", s.casefold()) if unicodedata.category(c) != "Mn").strip()

def list_path(position="todos"):
    if position not in (*POSITIONS, "todos"):
        raise ValueError("Filtro incorrecto")
    return LIST + "?orden=puntos&posicion=" + position + "&valor=todos"

def path_from_link(href):
    try:
        url = urlsplit(urljoin(ORIGIN, href or ""))
        if url.scheme != "https" or url.netloc != "www.comuniazo.com" or url.query or url.fragment:
            return ""
        return url.path.rstrip("/")
    except ValueError:
        return ""

def slug_from_link(href):
    p = path_from_link(href)
    match = re.fullmatch(re.escape(LIST) + r"/([a-z0-9-]{1,150})", p)
    return match.group(1) if match else None

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise RuntimeError("Redirección rechazada")

def validate_permission(permission):
    if not isinstance(permission,dict) or permission.get("authorized") is not True or permission.get("provider") != "comuniazo" or permission.get("competition") != "LALIGA" or permission.get("season") != SEASON:
        raise ValueError("Hace falta autorización o una base legítima de uso documentada para Comuniazo/MACROLIGA")
    ref = permission.get("permissionRef")
    if not isinstance(ref,str) or not ref or ref != ref.strip() or len(ref)>500 or any(ord(c)<32 or ord(c)==127 for c in ref):
        raise ValueError("Referencia verificable de autorización o base legítima de uso obligatoria")
    return ref

def _public_fetcher():
    """Transporte de lectura pública. No usa sesión ni tokens de Laviana."""
    allowed = {INDEX, *CLUBS, *(list_path(p) for p in ("todos", *POSITIONS))}
    def fetch(path):
        if path not in allowed:
            raise ValueError("Ruta no permitida")
        req = Request(ORIGIN+path, headers={"User-Agent":"MACROLIGA/1.0 (consulta de datos deportivos públicos)", "Accept":"text/html,application/xhtml+xml", "Accept-Language":"es-ES,es;q=0.9"})
        # No seguir redirecciones (incluidas las del mismo dominio).
        with build_opener(NoRedirect()).open(req, timeout=40) as response:
            if response.status != 200 or response.geturl() != ORIGIN+path or response.headers.get_content_type() not in ("text/html","application/xhtml+xml"):
                raise RuntimeError("Respuesta HTML no válida de Comuniazo")
            size = response.headers.get("Content-Length")
            if size is not None and (not size.isdecimal() or int(size)>MAX_BYTES):
                raise RuntimeError("Respuesta demasiado grande")
            data = response.read(MAX_BYTES+1)
            if len(data)>MAX_BYTES: raise RuntimeError("Respuesta demasiado grande")
        return BeautifulSoup(data, "html.parser")
    return fetch

def fetcher(permission):
    """Transporte para preparar y persistir un catálogo autorizado."""
    validate_permission(permission)
    return _public_fetcher()

def extract_clubs(soup):
    actual = {path_from_link(a.get("href")) for a in soup.select("a[href]")}
    actual = {p for p in actual if re.fullmatch(re.escape(TEAMS)+r"[a-z0-9-]+",p)}
    if not actual: return sorted(CLUBS)
    if actual != CLUBS: raise ValueError("El índice de clubes no coincide con los 20 de la temporada")
    return sorted(actual)

def extract_roster(soup, club_path):
    title = soup.find("h1")
    name = title.get_text(" ",strip=True) if title else ""
    if not name or len(name)>200: raise ValueError("Club sin cabecera")
    headings = [h for h in soup.find_all("h2") if norm(h.get_text(" ",strip=True))=="jugadores"]
    if len(headings)!=1: raise ValueError("Sección Jugadores ausente o ambigua")
    roster = set()
    for item in headings[0].next_elements:
        if getattr(item,"name",None)=="h2": break
        if getattr(item,"name",None)=="a":
            key=slug_from_link(item.get("href"))
            if key: roster.add(key)
    if len(roster)<15 or len(roster)>80: raise ValueError("Plantilla incompleta o excesiva: "+club_path)
    return name,roster

def parse_euros(s):
    # Nunca quitar signos o separadores desconocidos (p.ej. -10 o 1,5 M).
    if not re.fullmatch(r"(?:[0-9]+|[0-9]{1,3}(?:\.[0-9]{3})+)",s):
        raise ValueError("Valor EUR inválido")
    euros = int(s.replace(".",""))
    if euros*100>9223372036854775807: raise ValueError("Valor fuera de BIGINT")
    return str(euros*100)

def table_rows(soup, minimum):
    candidates = []
    for table in soup.find_all("table"):
        rows = [tr.find_all("td",recursive=False) for tr in table.find_all("tr")]
        # El listado público real intercala espacios de anuncios entre
        # futbolistas: una sola celda colspan=9, vacía o con contenedor
        # axd-desktop/axd-content. No son fichas ni filas deportivas fallidas.
        def ads_row(cells):
            if len(cells)!=1 or cells[0].get("colspan")!="9" or cells[0].find("a",href=True):
                return False
            cell=cells[0]
            children=cell.find_all(recursive=False)
            return (not children and not cell.get_text(strip=True)) or (
                len(children)==1 and children[0].name=="div" and
                {"axd-desktop","axd-content"}.issubset(children[0].get("class",[])))
        rows = [cells for cells in rows if not ads_row(cells)]
        potential = [cells for cells in rows if cells and any(slug_from_link(a.get("href")) for a in cells[0].find_all("a",href=True))]
        if len(potential)>=minimum:
            # No aceptar una tabla suficientemente grande ocultando filas
            # sin ficha o incompletas. Una fila vacía de cabecera se excluye.
            data_rows=[cells for cells in rows if cells]
            if len(potential)!=len(data_rows) or any(len(cells)<9 for cells in potential):
                raise ValueError("Tabla con filas sin ficha o incompletas")
            candidates.append(potential)
    if len(candidates)!=1: raise ValueError("Tabla deportiva ausente, incompleta o ambigua")
    return candidates[0]

def extract_table(soup, minimum):
    data = {}
    for cells in table_rows(soup,minimum):
        anchor_ids={slug_from_link(a.get("href")) for a in cells[0].find_all("a",href=True)}-{None}
        if len(anchor_ids)!=1: raise ValueError("Identificador de jugador ambiguo")
        key=next(iter(anchor_ids))
        name=cells[0].get_text(" ",strip=True)
        points=cells[1].get_text(" ",strip=True)
        if key in data or not name or len(name)>200 or not re.fullmatch(r"-?\d+",points):
            raise ValueError("Fila duplicada o inválida en listado")
        try: value=parse_euros(cells[7].get_text(" ",strip=True))
        except ValueError: raise ValueError("Precio inválido del jugador "+key) from None
        data[key]={"name":name,"marketValueCents":value,"points":int(points)}
    return data

def extract_catalog(fetch, *, permission_ref, now=None, previous=None, diagnostic=False, public_html=False):
    """Un único lote diario consolidado: índice, 20 clubes, general, 4 filtros.
    Rechaza el lote entero si falta un club, precio, ficha o posición de un activo.
    """
    if not isinstance(permission_ref,str) or not permission_ref.strip(): raise ValueError("Referencia de procedencia obligatoria")
    if public_html and (diagnostic or permission_ref != PUBLIC_HTML_REF):
        raise ValueError("Procedencia HTML pública incompatible")
    # No usar rutas alternativas para eludir errores de acceso, límites o
    # indisponibilidad del servidor. El fallback se limita a HTML válido
    # cuyo índice no trae enlaces, comprobando las 20 fichas públicas.
    index=fetch(INDEX)
    paths=extract_clubs(index)
    membership={}; names=set()
    with ThreadPoolExecutor(max_workers=5) as pool:
        for path,(club,ids) in zip(paths,pool.map(lambda p:extract_roster(fetch(p),p),paths)):
            if norm(club) in names: raise ValueError("Nombre de club duplicado")
            names.add(norm(club))
            for key in ids:
                if key in membership: raise ValueError("Jugador en dos clubes: "+key)
                membership[key]=club
    if len(names)!=20 or len(membership)<490: raise ValueError("Cobertura insuficiente de plantillas")
    overall=extract_table(fetch(list_path()),550)
    positions={}
    for filter_name,pos in POSITIONS.items():
        for key in extract_table(fetch(list_path(filter_name)),15):
            if key in positions: raise ValueError("Jugador en dos posiciones: "+key)
            positions[key]=pos
    missing_values=sorted(set(membership)-overall.keys())
    missing_positions=sorted(set(membership)-positions.keys())
    if missing_values or missing_positions:
        raise ValueError(f"Lote incompleto: {len(missing_values)} activos sin valor/listado; {len(missing_positions)} sin posición")
    if previous:
        if previous.get("provider")!="comuniazo" or previous.get("season")!=SEASON or previous.get("competition")!="LALIGA": raise ValueError("Historial incompatible")
        previous_ids={p["externalId"] for p in previous["players"] if p["active"]}
        lost=previous_ids-membership.keys()
        if len(lost)>30 or len(lost)*10>len(previous_ids):
            raise ValueError("Demasiadas bajas respecto a la última descarga: revisión necesaria")
    seen=datetime.now(timezone.utc) if now is None else now
    if seen.utcoffset() is None: raise ValueError("Fecha sin zona horaria")
    stamp=seen.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00","Z")
    active=[]; excluded=0
    for key,row in sorted(overall.items()):
        if key in membership:
            active.append({"externalId":key,"name":row["name"],"club":membership[key],"position":positions[key],"active":True,"marketValueCents":row["marketValueCents"]})
        else:
            # Histórico desconocido: descartar identidad, precio y puntos.
            # Solo conservar el recuento de exclusiones; los futbolistas ya
            # pertenecientes al catálogo se tratan abajo con su última ficha.
            excluded+=1
    # No eliminar futbolistas ya conocidos ni sus activos económicos. Si
    # desaparecen de las plantillas, conservar su última identidad y valor
    # verificable marcados como inactivos, con el club anterior en el historial.
    previous_by_id={p["externalId"]:p for p in previous["players"]} if previous else {}
    for key,p in previous_by_id.items():
        if key not in membership:
            active.append({**p,"active":False})
    snapshot={"schemaVersion":1,"kind":"diagnostic" if diagnostic else "public-html" if public_html else "authorized","provider":"comuniazo","competition":"LALIGA","season":SEASON,"currency":"EUR","asOf":stamp,"permissionRef":permission_ref,"players":sorted(active,key=lambda p:p["externalId"])}
    new_by_id={p["externalId"]:p for p in active}
    diff={"previousAsOf":previous.get("asOf") if previous else None,
        "newPlayers":sum(k not in previous_by_id for k in membership),
        "reactivated":sum(k in previous_by_id and not previous_by_id[k]["active"] for k in membership),
        "deactivated":sum(p["active"] and k not in membership for k,p in previous_by_id.items()),
        "priceChanges":sum(k in previous_by_id and previous_by_id[k]["marketValueCents"]!=new_by_id[k]["marketValueCents"] for k in membership),
        "clubChanges":sum(k in previous_by_id and previous_by_id[k]["club"]!=new_by_id[k]["club"] for k in membership),
        "positionChanges":sum(k in previous_by_id and previous_by_id[k]["position"]!=new_by_id[k]["position"] for k in membership)}
    info={"asOf":stamp,"clubs":len(names),"downloaded":len(overall),"active":len(membership),"excluded":excluded,"historicalRetained":len(active)-len(membership),"changes":diff,"points":[{"externalId":key,"points":overall[key]["points"]} for key in sorted(membership)]}
    return snapshot,info


def diagnostico_publico(fetch=None):
    """Comprueba el HTML público y la cobertura. Solo devuelve contadores.
    No exporta fichas, no produce un catálogo importable ni escribe archivos.
    No equivale a autorización para reutilizar o automatizar la publicación.
    """
    _,info=extract_catalog(fetch if fetch is not None else _public_fetcher(),permission_ref="Diagnóstico no persistente; no acredita autorización",diagnostic=True)
    return {k:v for k,v in info.items() if k not in ("points","changes")}
