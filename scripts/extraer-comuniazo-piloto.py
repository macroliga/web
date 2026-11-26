"""Preparación privada del lote MACROLIGA. No escribe Supabase ni Git.
Uso exclusivo del operador: stdout contiene datos deportivos normalizados.
No ejecutar con tracing ni publicar el resultado.
"""
import json
import subprocess
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from src.sports.comuniazo import extract_catalog,_public_fetcher,PUBLIC_HTML_REF

def main():
    # Sin credenciales, cuentas, API, ni copia de contenidos editoriales.
    snapshot,info=extract_catalog(_public_fetcher(),permission_ref=PUBLIC_HTML_REF,public_html=True)
    result=subprocess.run(["node",str(ROOT/"scripts/validar-lote-html-piloto.mjs")],input=json.dumps({"catalogo":snapshot,"puntos":info["points"]}),text=True,cwd=ROOT,capture_output=True,check=True)
    # Salida solo para el operador autorizado, no logs ni terminal pública.
    sys.stdout.write(result.stdout)
    return 0

if __name__=="__main__":
    try:sys.exit(main())
    except Exception:
        print("No se pudo preparar la descarga pública; conservar el catálogo anterior",file=sys.stderr)
        sys.exit(1)
