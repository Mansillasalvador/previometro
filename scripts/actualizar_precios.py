"""Baja el paquete SEPA más reciente y escribe data/precios.json con medianas de CABA."""
import csv
import io
import json
import shutil
import statistics
import sys
import tempfile
import urllib.request
import zipfile
from pathlib import Path

API = "https://datos.produccion.gob.ar/api/3/action/package_show?id=sepa-precios"
MAX_BYTES = 6 * 1024**3  # el paquete real pesa ~320 MB; más de esto es anormal
DATA = Path(__file__).resolve().parent.parent / "data"
csv.field_size_limit(10**7)


def recurso_mas_reciente():
    with urllib.request.urlopen(API, timeout=60) as r:
        recursos = json.load(r)["result"]["resources"]
    zips = [x for x in recursos if x["url"].endswith(".zip") and "sepa_" in x["url"]]
    return max(zips, key=lambda x: x["last_modified"])


def descargar(recurso, destino):
    if int(recurso.get("size") or 0) > MAX_BYTES:
        sys.exit(f"El paquete declara {recurso['size']} bytes: frenado, revisar a mano.")
    for intento in (1, 2):
        try:
            with urllib.request.urlopen(recurso["url"], timeout=120) as r, open(destino, "wb") as f:
                shutil.copyfileobj(r, f, 1024 * 1024)
            return
        except OSError as e:
            print(f"Descarga falló (intento {intento}): {e}", file=sys.stderr)
    sys.exit("La descarga falló 2 veces: precios.json queda sin cambios.")


def filas(zip_comercio, nombre):
    with zip_comercio.open(nombre) as b:
        texto = io.TextIOWrapper(b, encoding="utf-8-sig", errors="replace", newline="")
        yield from csv.DictReader(texto, delimiter="|")


def es_caba(fila):
    # Hay sucursales de CABA con provincia vacía: ahí se mira la localidad.
    provincia = (fila.get("sucursales_provincia") or "").strip().upper()
    localidad = (fila.get("sucursales_localidad") or "").upper()
    return provincia == "AR-C" or (not provincia and localidad.startswith("CIUDAD AUT"))


def precios_caba(paquete, eans, tmp):
    """Devuelve {ean: {sucursal: precio}}, procesando un comercio por vez."""
    encontrados = {e: {} for e in eans}
    with zipfile.ZipFile(paquete) as z:
        for info in z.infolist():
            if info.is_dir() or info.file_size == 0:
                continue
            ruta = Path(tmp) / "comercio.zip"
            with z.open(info) as origen, open(ruta, "wb") as f:
                shutil.copyfileobj(origen, f, 1024 * 1024)
            try:
                comercio = zipfile.ZipFile(ruta)
            except zipfile.BadZipFile:
                print(f"Aviso: ZIP dañado, se saltea {info.filename}", file=sys.stderr)
                continue
            with comercio:
                caba = {
                    (s["id_comercio"], s["id_bandera"], s["id_sucursal"])
                    for s in filas(comercio, "sucursales.csv")
                    if es_caba(s)
                }
                if not caba:
                    continue
                for p in filas(comercio, "productos.csv"):
                    ean = (p.get("id_producto") or "").lstrip("0")
                    sucursal = (p.get("id_comercio"), p.get("id_bandera"), p.get("id_sucursal"))
                    if ean not in encontrados or sucursal not in caba:
                        continue
                    try:
                        precio = float(p["productos_precio_lista"])
                    except (TypeError, ValueError):
                        continue
                    if precio > 0:
                        encontrados[ean][sucursal] = precio
    return encontrados


def main():
    ingredientes = json.loads((DATA / "ingredientes.json").read_text(encoding="utf-8"))
    salida = DATA / "precios.json"
    previo = json.loads(salida.read_text(encoding="utf-8"))["precios"] if salida.exists() else {}
    recurso = recurso_mas_reciente()
    fecha = recurso["last_modified"][:10]
    print(f"Paquete: {recurso['description']} ({int(recurso['size']) // 1024**2} MB)")

    with tempfile.TemporaryDirectory(prefix="sepa_") as tmp:
        paquete = Path(tmp) / "sepa.zip"
        descargar(recurso, paquete)
        eans = {i["ean"].lstrip("0") for i in ingredientes}
        encontrados = precios_caba(paquete, eans, tmp)

    precios = {}
    for i in ingredientes:
        valores = encontrados[i["ean"].lstrip("0")]
        if valores:
            precios[i["id"]] = {
                "ean": i["ean"],
                "ml_envase": i["ml_envase"],
                "precio": round(statistics.median(valores.values()), 2),
                "sucursales": len(valores),
                "fecha": fecha,
                "desactualizado": False,
            }
        elif i["id"] in previo:
            precios[i["id"]] = {**previo[i["id"]], "desactualizado": True}
            print(f"Sin precio hoy: {i['id']} (queda el último conocido)", file=sys.stderr)
        else:
            print(f"Sin precio y sin historial: {i['id']}", file=sys.stderr)

    resultado = {"fecha_actualizacion": fecha, "precios": precios}
    temporal = salida.with_suffix(".tmp")
    temporal.write_text(json.dumps(resultado, ensure_ascii=False, indent=2), encoding="utf-8")
    temporal.replace(salida)
    print(f"Listo: {len(precios)}/{len(ingredientes)} ingredientes en {salida}")


if __name__ == "__main__":
    main()
