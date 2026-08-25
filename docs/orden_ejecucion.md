# Proyecto de Vigilancia Epidemiológica de Dengue
## M6-NOSQL · Orden de ejecución

Este documento permite reproducir el proyecto completo desde un estado
conocido (base de datos vacía) hasta la colección final lista para
consultas geoespaciales, temporales y de seguridad.

## Requisitos previos

- MongoDB Community (probado en 7.0.37) accesible vía `mongosh`
- Python 3 con `pandas` y `epiweeks` (`pip install pandas epiweeks --break-system-packages`)
- Los siguientes archivos de datos crudos (no incluidos, ver procedencia):
  - `dengue_abierto.csv` — Dirección General de Epidemiología (DGE), datos
    abiertos por caso individual. Fuente: datosabiertos.salud.gob.mx
  - `catalogo_municipio.csv`, `catalogo_entidad.csv` — extraídos de
    `Catalogos_Dengue.xlsx` (diccionario de datos de la DGE)
  - `poblacion.csv` — INEGI 2020, latitud/longitud/población por
    municipio (fuente: gist de lapanquecita, github.com/lapanquecita)

## 1. ETL (fuera de mongosh, en terminal)

```bash
# 1.1 Agregar casos crudos por municipio + semana epidemiológica
python etl_dengue.py dengue_abierto.csv casos_semanales.json

# 1.2 Cruzar con catálogo oficial de nombres (municipio, entidad)
python cruzar_catalogos.py casos_semanales.json catalogo_municipio.csv \
    catalogo_entidad.csv casos_semanales_con_nombres.json

# 1.3 Cruzar con geometría (centroide) y población INEGI
python cruzar_geometria_poblacion.py casos_semanales_con_nombres.json \
    poblacion.csv casos_semanales_final.json

# 1.4 Convertir a Extended JSON para que mongoimport respete BSON Date
python preparar_para_mongoimport.py casos_semanales_final.json \
    casos_semanales_mongoimport.json
```

**Nota de mapeo de catálogos** (verificado contra `Catalogos_Dengue.xlsx`,
no asumido de memoria):
- `ESTATUS_CASO`: 1=Probable, 2=Confirmado, 3=Descartado
- `DEFUNCION`: catálogo SI_NO compartido, 1=Sí, 2=No
- Excluidos del análisis: `MUNICIPIO_RES=999` (no especificado) y
  `ENTIDAD_RES` en {33,34,35,97,98,99} (extranjero/no aplica/se ignora)

## 2. Carga y validación (mongosh + terminal)

```javascript
// 2.1 Crear la colección con el validador $jsonSchema activo
load("validador_casos_semanales.js")
```

```bash
# 2.2 Cargar los datos reales (fuera de mongosh)
mongoimport --uri "<connection_string>" --collection casos_semanales \
    --file casos_semanales_mongoimport.json --jsonArray
```

```javascript
// 2.3 Confirmar carga
db.casos_semanales.countDocuments({})   // 10,353 esperados
```

## 3. Índices y medición de rendimiento (semana 2)

```javascript
load("consultas_reales.js")
descubrirParametros(db)   // para elegir parámetros de prueba vigentes

// Medir ANTES de indexar con los parámetros reales del paso anterior
printjson(explainConsultaA(db, <anio>, <semana>))
printjson(explainConsultaB(db, <clave_municipio>, <anio>, <anio>))
printjson(explainConsultaC(db, <entidad>, <fecha_inicio>, <fecha_fin>))

load("indices_semana2.js")
crearIndices(db)
printjson(db.casos_semanales.getIndexes())

// Volver a medir DESPUÉS con los mismos parámetros — comparar
```

## 4. Componente geoespacial (semana 3)

```javascript
load("geoespacial_semana3.js")
crearIndiceGeoespacial(db)
const hotspot = encontrarHotspot(db, <anio>, <semana>)
const [lon, lat] = hotspot.geometry.coordinates
printjson(municipiosCercanos(db, lon, lat, 150000))
printjson(brotesRegionalesCercanos(db, lon, lat, 150000, <anio>, <semana>, 3))
```

## 5. Componente temporal (semana 4)

```javascript
load("temporal_semana4.js")
crearIndiceTemporal(db)
printjson(explainConsultaIntervalo(db, "<fecha_inicio>", "<fecha_fin>"))
printjson(serieNacionalPorMes(db))
pruebaEstacionalidad(db)
```

## 6. Búsqueda y seguridad (semana 5)

```javascript
load("seguridad_busqueda_semana5.js")
crearIndiceBusquedaMunicipio(db)
pruebaBusquedaMunicipio(db)
crearVistaGeneralizada(db)
crearRoles(db)

// Crear usuario de prueba con privilegio mínimo y validar la
// restricción desde una sesión aparte (ver evidencia en el reporte)
db.createUser({
  user: "test_brigada",
  pwd: passwordPrompt(),
  roles: [{ role: "brigada_campo", db: db.getName() }]
})
```

## 7. Casos de prueba del validador (evidencia reproducible)

```javascript
load("validador_casos_semanales.js")
// valido1, valido2, invalido1_conteoNegativo, invalido2_faltaClave,
// invalido3_tipoGeometriaIncorrecto, invalido4_coordenadasFueraDeRango
// ya quedan definidos por el load anterior
db.casos_semanales.insertOne(valido1)
db.casos_semanales.insertOne(invalido2_faltaClave)   // debe rechazar
// etc.
```

## Limitaciones conocidas (declaradas, no descubiertas tarde)

- Cobertura temporal: solo semanas 1-32 de 2026 (dataset a la fecha de
  descarga); agosto está incompleto (hasta el 9 de agosto).
- `$jsonSchema` no valida rangos numéricos por posición dentro de un
  array (`geometry.coordinates`); esa validación se aplica en el ETL,
  no en el servidor.
- Geometría a nivel de centroide de municipio, no polígono — suficiente
  para `$near`/`$geoNear`, insuficiente para `$geoWithin`/`$geoIntersects`
  sobre regiones reales (pendiente si se consigue el Marco Geoestadístico
  completo).
- TLS deshabilitado en el entorno de desarrollo local (aceptado para
  este contexto; requeriría habilitarse para cualquier despliegue que
  no sea localhost).
- Los umbrales de generalización de celdas pequeñas (población < 5,000,
  conteo < 3) son una decisión de diseño propia, no un estándar externo
  verificado.
