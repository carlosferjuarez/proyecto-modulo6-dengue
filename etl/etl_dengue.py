"""
ETL: dengue_abierto.csv (crudo, por caso individual, DGE)
     -> casos_semanales.json (agregado por municipio + semana epidemiológica,
        listo para insertar en MongoDB con nuestro esquema)

Uso:
    python etl_dengue.py dengue_abierto.csv casos_semanales.json
"""

import sys
import json
import pandas as pd
from epiweeks import Week

# ============================================================
# Mapeos de catálogo — VERIFICAR contra Catalogos_Dengue.xlsx
# ============================================================

# Catalogos_Dengue.xlsx, tab "CATÁLOGO ESTATUS_CASO":
#   1 = PROBABLE, 2 = CONFIRMADO, 3 = DESCARTADO
ESTATUS_PROBABLE = {1}
ESTATUS_CONFIRMADO = {2}
# 3 = Descartado -> no cuenta como caso (ni confirmado ni probable)

# Catalogos_Dengue.xlsx, tab "CATÁLOGO SI_NO"
# (compartido por DEFUNCION, DIABETES, HIPERTENSION, EMBARAZO, etc.):
#   1 = SI, 2 = NO  (solo estos dos códigos, sin "no aplica"/"se ignora")
DEFUNCION_SI = {1}
DEFUNCION_NO = {2}

# Código usado por la DGE para "no especificado" en MUNICIPIO_RES
MUNICIPIO_NO_ESPECIFICADO = {999}

# Códigos de ENTIDAD_RES que NO son estados mexicanos
# Catalogos_Dengue.xlsx tab "CATÁLOGO ENTIDAD":
#   33 = EUA, 34 = Otros países Latam, 35 = Otros países,
#   97 = No aplica, 98 = Se ignora, 99 = No especificado
# Estos registros no tienen municipio ni geometría mexicana real que
# asignarles, así que se excluyen (igual que MUNICIPIO_RES=999).
ENTIDAD_NO_MEXICANA = {33, 34, 35, 97, 98, 99}


def calcular_semana_epidemiologica(fecha_str):
    """Convierte una fecha (YYYY-MM-DD) a (anio, semana) epidemiológica
    usando la convención CDC/MMWR (semana inicia en domingo), que es la
    que sigue el sistema de vigilancia epidemiológica mexicano (SINAVE)."""
    fecha = pd.to_datetime(fecha_str)
    w = Week.fromdate(fecha)
    return w.year, w.week


def fecha_inicio_de_semana(anio, semana):
    """Regresa el domingo de inicio de una semana epidemiológica dada,
    como fecha ISO, para usar como BSON Date."""
    w = Week(anio, semana)
    return w.startdate().isoformat()


def procesar(path_entrada, path_salida):
    try:
        df = pd.read_csv(path_entrada, encoding="utf-8", low_memory=False)
    except UnicodeDecodeError:
        df = pd.read_csv(path_entrada, encoding="latin-1", low_memory=False)

    n_total = len(df)

    # --- Excluir municipio no especificado y entidades no mexicanas ---
    mask_sucio = (
        df["MUNICIPIO_RES"].isin(MUNICIPIO_NO_ESPECIFICADO)
        | df["ENTIDAD_RES"].isin(ENTIDAD_NO_MEXICANA)
    )
    df_sucio = df[mask_sucio]
    df = df[~mask_sucio].copy()
    print(f"Registros totales: {n_total}")
    print(f"Excluidos (municipio no especificado o entidad no mexicana): {len(df_sucio)}")
    print(f"Registros a procesar: {len(df)}")

    # --- Construir clave_municipio de 5 dígitos ---
    df["clave_municipio"] = (
        df["ENTIDAD_RES"].astype(int).astype(str).str.zfill(2)
        + df["MUNICIPIO_RES"].astype(int).astype(str).str.zfill(3)
    )

    # --- Semana epidemiológica a partir de fecha de inicio de síntomas ---
    semanas = df["FECHA_SIGN_SINTOMAS"].apply(calcular_semana_epidemiologica)
    df["anio_epi"] = semanas.apply(lambda t: t[0])
    df["semana_epi"] = semanas.apply(lambda t: t[1])

    # --- Clasificación de caso (VERIFICAR mapeo arriba) ---
    df["es_confirmado"] = df["ESTATUS_CASO"].isin(ESTATUS_CONFIRMADO)
    df["es_probable"] = df["ESTATUS_CASO"].isin(ESTATUS_PROBABLE)
    df["es_defuncion"] = df["DEFUNCION"].isin(DEFUNCION_SI)

    # --- Agregación por municipio + semana epidemiológica ---
    agg = df.groupby(["clave_municipio", "anio_epi", "semana_epi"]).agg(
        casos_confirmados=("es_confirmado", "sum"),
        casos_probables=("es_probable", "sum"),
        defunciones=("es_defuncion", "sum"),
    ).reset_index()

    documentos = []
    for _, row in agg.iterrows():
        anio, semana = int(row["anio_epi"]), int(row["semana_epi"])
        documentos.append({
            "clave_municipio": row["clave_municipio"],
            # municipio, entidad_federativa, poblacion y geometry se
            # completan en el paso de cruce con el catálogo INEGI
            "semana_epidemiologica": {"anio": anio, "semana": semana},
            "fecha_inicio_semana": fecha_inicio_de_semana(anio, semana),
            "casos_confirmados": int(row["casos_confirmados"]),
            "casos_probables": int(row["casos_probables"]),
            "defunciones": int(row["defunciones"]),
            "fuente": "DGE/SINAVE - datos_abiertos_dengue",
        })

    with open(path_salida, "w", encoding="utf-8") as f:
        json.dump(documentos, f, ensure_ascii=False, indent=2)

    print(f"\nDocumentos agregados generados: {len(documentos)}")
    print(f"Guardado en: {path_salida}")
    print("\nPendiente antes de insertar en Mongo:")
    print("  1. Confirmar ESTATUS_CASO/DEFUNCION contra el diccionario real")
    print("  2. Cruzar clave_municipio con INEGI para agregar municipio,")
    print("     entidad_federativa, geometry (centroide) y poblacion")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Uso: python etl_dengue.py dengue_abierto.csv casos_semanales.json")
        sys.exit(1)
    procesar(sys.argv[1], sys.argv[2])
