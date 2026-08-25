"""
Convierte casos_semanales_final.json a MongoDB Extended JSON, para que
mongoimport interprete fecha_inicio_semana como BSON Date (no string) y
así pase el validador $jsonSchema (que exige bsonType: "date").

Uso:
    python preparar_para_mongoimport.py casos_semanales_final.json \
        casos_semanales_mongoimport.json
"""

import sys
import json


def convertir(path_entrada, path_salida):
    with open(path_entrada, "r", encoding="utf-8") as f:
        docs = json.load(f)

    for doc in docs:
        fecha = doc["fecha_inicio_semana"]
        # Extended JSON relaxed mode: {"$date": "ISO-8601 con hora y Z"}
        if "T" not in fecha:
            fecha = fecha + "T00:00:00.000Z"
        doc["fecha_inicio_semana"] = {"$date": fecha}

    with open(path_salida, "w", encoding="utf-8") as f:
        json.dump(docs, f, ensure_ascii=False, indent=2)

    print(f"Documentos convertidos: {len(docs)}")
    print(f"Guardado en: {path_salida}")
    print("\nCargar con:")
    print(f'  mongoimport --uri "<tu_connection_string>" '
          f'--collection casos_semanales --file {path_salida} --jsonArray')


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Uso: python preparar_para_mongoimport.py "
              "casos_semanales_final.json casos_semanales_mongoimport.json")
        sys.exit(1)
    convertir(sys.argv[1], sys.argv[2])
