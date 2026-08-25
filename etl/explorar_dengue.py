"""
Exploración inicial del dataset real de dengue (DGE / DengueMX).
Correr LOCALMENTE después de descargar y descomprimir uno de:
  - datos_abiertos_dengue.zip (DGE, datos crudos por caso)
  - dengue_2016_2022_mx.csv   (DengueMX, ya agregado/tidy)

Uso:
    python explorar_dengue.py ruta/al/archivo.csv
"""

import sys
import pandas as pd

def explorar(path):
    
    try:
        df = pd.read_csv(path, encoding="utf-8", low_memory=False, nrows=50000)
    except UnicodeDecodeError:
        df = pd.read_csv(path, encoding="latin-1", low_memory=False, nrows=50000)

    print(f"\n=== Archivo: {path} ===")
    print(f"Filas leídas (muestra): {len(df)}")
    print(f"Columnas ({len(df.columns)}):\n")
    for col in df.columns:
        print(f"  - {col}  (dtype: {df[col].dtype})")

    print("\n=== Primeras 3 filas ===")
    print(df.head(3).to_string())

    print("\n=== Nulos por columna (top 15) ===")
    print(df.isnull().sum().sort_values(ascending=False).head(15))

    print("\n=== Columnas candidatas para el mapeo a nuestro esquema ===")
    pistas = ["municip", "entidad", "fecha", "semana", "clave", "edad",
              "sexo", "sintoma", "confirm", "probable", "defunc", "resultado"]
    for col in df.columns:
        col_lower = col.lower()
        for pista in pistas:
            if pista in col_lower:
                print(f"  - {col}  →  posible mapeo relacionado con '{pista}'")
                break

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Uso: python explorar_dengue.py ruta/al/archivo.csv")
        sys.exit(1)
    explorar(sys.argv[1])
