"""
Último cruce: agrega geometry (centroide) y poblacion a cada documento
de casos_semanales_con_nombres.json, usando el catálogo INEGI 2020
(clave_entidad, clave_municipio, longitud, latitud, poblacion).

Uso:
    python cruzar_geometria_poblacion.py casos_semanales_con_nombres.json \
        poblacion.csv casos_semanales_final.json
"""

import sys
import json
import pandas as pd


def construir_lookup(path_poblacion):
    df = pd.read_csv(path_poblacion, encoding="utf-8-sig", dtype=str)
    df.columns = [c.strip() for c in df.columns]

    df["clave_entidad"] = df["clave_entidad"].str.zfill(2)
    df["clave_municipio"] = df["clave_municipio"].str.zfill(3)
    df["clave_municipio_completa"] = df["clave_entidad"] + df["clave_municipio"]

    lookup = {}
    for _, row in df.iterrows():
        lookup[row["clave_municipio_completa"]] = {
            "longitud": float(row["longitud"]),
            "latitud": float(row["latitud"]),
            "poblacion": int(row["poblacion"]),
        }
    return lookup


def validar_coordenadas(lon, lat):
    """Replica la validación del $jsonSchema (semana 2) que NO cubre
    rangos por posición de array — la aplicamos aquí, en el ETL, tal
    como quedó documentado como limitación conocida."""
    if not (-180 <= lon <= 180):
        return False
    if not (-90 <= lat <= 90):
        return False
    return True


def cruzar(path_casos, path_poblacion, path_salida):
    lookup = construir_lookup(path_poblacion)
    print(f"Catálogo de geometría/población cargado: {len(lookup)} municipios")

    with open(path_casos, "r", encoding="utf-8") as f:
        casos = json.load(f)

    no_encontrados = set()
    coords_invalidas = []
    finales = []

    for doc in casos:
        clave = doc["clave_municipio"]
        info = lookup.get(clave)
        if info is None:
            no_encontrados.add(clave)
            continue  # documentar y excluir, no insertar geometría inventada

        if not validar_coordenadas(info["longitud"], info["latitud"]):
            coords_invalidas.append(clave)
            continue

        doc["geometry"] = {
            "type": "Point",
            "coordinates": [info["longitud"], info["latitud"]],
        }
        doc["poblacion"] = info["poblacion"]
        finales.append(doc)

    with open(path_salida, "w", encoding="utf-8") as f:
        json.dump(finales, f, ensure_ascii=False, indent=2)

    print(f"Documentos de entrada: {len(casos)}")
    print(f"Documentos finales (con geometry + poblacion): {len(finales)}")
    print(f"Excluidos por clave sin match en catálogo INEGI: {len(no_encontrados)}")
    if no_encontrados:
        print("  Ejemplos:", list(no_encontrados)[:10])
    print(f"Excluidos por coordenadas fuera de rango: {len(coords_invalidas)}")
    print(f"Guardado en: {path_salida}")


if __name__ == "__main__":
    if len(sys.argv) != 4:
        print("Uso: python cruzar_geometria_poblacion.py "
              "casos_semanales_con_nombres.json poblacion.csv "
              "casos_semanales_final.json")
        sys.exit(1)
    cruzar(sys.argv[1], sys.argv[2], sys.argv[3])
