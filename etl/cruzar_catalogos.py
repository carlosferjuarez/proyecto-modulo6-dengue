"""
Cruza casos_semanales.json (salida de etl_dengue.py) con los catálogos
oficiales CLAVE_MUNICIPIO / CLAVE_ENTIDAD para agregar los campos
'municipio' y 'entidad_federativa' a cada documento.

Uso:
    python cruzar_catalogos.py casos_semanales.json catalogo_municipio.csv \
        catalogo_entidad.csv casos_semanales_con_nombres.json
"""

import sys
import json
import pandas as pd


def construir_lookup(path_municipio, path_entidad):
    mun = pd.read_csv(path_municipio, encoding="utf-8-sig", dtype=str)
    ent = pd.read_csv(path_entidad, encoding="utf-8-sig", dtype=str)

    mun.columns = [c.strip() for c in mun.columns]
    ent.columns = [c.strip() for c in ent.columns]

    # Normalizar claves a ancho fijo (municipio=3 dígitos, entidad=2)
    mun["CLAVE_MUNICIPIO"] = mun["CLAVE_MUNICIPIO"].str.zfill(3)
    mun["CLAVE_ENTIDAD"] = mun["CLAVE_ENTIDAD"].str.zfill(2)
    ent["CLAVE_ENTIDAD"] = ent["CLAVE_ENTIDAD"].str.zfill(2)

    merged = mun.merge(ent, on="CLAVE_ENTIDAD", how="left")
    merged["clave_municipio"] = merged["CLAVE_ENTIDAD"] + merged["CLAVE_MUNICIPIO"]

    lookup = {}
    for _, row in merged.iterrows():
        lookup[row["clave_municipio"]] = {
            "municipio": row["MUNICIPIO"],
            "entidad_federativa": row["ENTIDAD_FEDERATIVA"],
        }
    return lookup


def cruzar(path_casos, path_municipio, path_entidad, path_salida):
    lookup = construir_lookup(path_municipio, path_entidad)
    print(f"Catálogo cargado: {len(lookup)} municipios")

    with open(path_casos, "r", encoding="utf-8") as f:
        casos = json.load(f)

    no_encontrados = set()
    for doc in casos:
        clave = doc["clave_municipio"]
        info = lookup.get(clave)
        if info is None:
            no_encontrados.add(clave)
            doc["municipio"] = None
            doc["entidad_federativa"] = None
        else:
            doc["municipio"] = info["municipio"]
            doc["entidad_federativa"] = info["entidad_federativa"]

    with open(path_salida, "w", encoding="utf-8") as f:
        json.dump(casos, f, ensure_ascii=False, indent=2)

    print(f"Documentos procesados: {len(casos)}")
    print(f"Claves sin match en el catálogo: {len(no_encontrados)}")
    if no_encontrados:
        print("  Ejemplos:", list(no_encontrados)[:10])
        print("  -> Revisar: posible clave_municipio mal formada, o")
        print("     municipio de creación reciente no incluido en el")
        print("     catálogo. Documentar como limitación de cobertura.")
    print(f"Guardado en: {path_salida}")


if __name__ == "__main__":
    if len(sys.argv) != 5:
        print("Uso: python cruzar_catalogos.py casos_semanales.json "
              "catalogo_municipio.csv catalogo_entidad.csv "
              "casos_semanales_con_nombres.json")
        sys.exit(1)
    cruzar(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4])
