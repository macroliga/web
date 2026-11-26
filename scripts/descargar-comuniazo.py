"""CLI de operador: solo salida local; no toca Supabase ni Laviana.
Un lote por fecha de Madrid; la exportación exige una base de uso documentada.
"""
import argparse
import re
from datetime import datetime, timezone
import json
from pathlib import Path
import subprocess
import sys
import tempfile
from zoneinfo import ZoneInfo

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from src.sports.comuniazo import extract_catalog, fetcher, validate_permission

def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--permiso",type=Path,required=True)
    p.add_argument("--directorio",type=Path,required=True)
    args=p.parse_args()
    permission=read_json(args.permiso)
    ref=validate_permission(permission)
    # No publicar archivos deportivos fuera del directorio privado ignorado.
    base=(ROOT/".macroliga-local").resolve()
    out=args.directorio.resolve()
    if not out.is_relative_to(base): raise ValueError("Utilizar un directorio bajo .macroliga-local/")
    out.mkdir(mode=0o700,parents=True,exist_ok=True)
    now=datetime.now(timezone.utc)
    day=now.astimezone(ZoneInfo("Europe/Madrid")).date().isoformat()
    dest=out/day
    if dest.exists(): raise ValueError("Ya existe una descarga para esa fecha")
    # Cerrojo por O_EXCL: evita dos descargas diarias simultáneas.
    lock=out/(day+".lock")
    with lock.open("x",encoding="utf-8"):
        pass
    try:
        previous_days=sorted(p for p in out.iterdir() if p.is_dir() and re.fullmatch(r"\d{4}-\d{2}-\d{2}",p.name) and p.name<day and (p/"catalogo.json").is_file())
        previous=read_json(previous_days[-1]/"catalogo.json") if previous_days else None
        if previous:
            # Validación independiente con el contrato JS, sin sobrescribir.
            subprocess.run(["node","--input-type=module","-e","import {readFileSync} from 'node:fs';import {verificarCatalogo} from './src/domain/catalogo-deportivo.mjs';verificarCatalogo(JSON.parse(readFileSync(process.argv[1])));",str(previous_days[-1]/"catalogo.json")],cwd=ROOT,check=True,capture_output=True)
            if previous["provider"]!="comuniazo" or previous["season"]!="2026_27": raise ValueError("Historial incompatible")
        snapshot,info=extract_catalog(fetcher(permission),permission_ref=ref,now=now,previous=previous)
        # Publicación atómica del directorio, después de validar JSON y huella.
        with tempfile.TemporaryDirectory(prefix=".comuniazo-",dir=out) as temp:
            staging=Path(temp)
            raw=staging/"raw.json"
            raw.write_text(json.dumps(snapshot,ensure_ascii=False),encoding="utf-8")
            subprocess.run(["node",str(ROOT/"scripts/preparar-catalogo.mjs"),"--catalogo",str(raw),"--salida",str(staging/"catalogo.json")],cwd=ROOT,check=True,capture_output=True)
            raw.unlink()
            info["snapshotHash"]=read_json(staging/"catalogo.json")["snapshotHash"]
            (staging/"informe-deportivo.json").write_text(json.dumps(info,ensure_ascii=False),encoding="utf-8")
            # La descarga no se guarda hasta terminar correctamente todas las comprobaciones.
            if dest.exists(): raise ValueError("Descarga ya publicada localmente")
            staging.rename(dest)
        print(json.dumps({**{k:v for k,v in info.items() if k not in ("points",)},"mode":"PREPARADO LOCALMENTE; NO IMPORTADO A SUPABASE"},ensure_ascii=False))
    finally:
        lock.unlink(missing_ok=True)
    return 0

if __name__=="__main__":
    try: sys.exit(main())
    except Exception as error:
        # No incluir respuestas HTML, credenciales ni datos privados.
        print("Descarga rechazada: "+str(error),file=sys.stderr)
        sys.exit(1)
