# Vigilancia Epidemiológica de Dengue en México

Proyecto final — Diplomado Manejo de Bases de Datos SQL y NoSQL en un
Entorno de Nube, Módulo 6 (Conceptos Avanzados de Bases de Datos NoSQL).

**Autor**: Carlos Fernando Juárez Pacheco

## Objetivo

Apoyar la vigilancia epidemiológica de dengue en México mediante un
modelo documental que permita identificar municipios con incidencia
elevada, detectar posibles señales de propagación regional y
caracterizar la evolución temporal de la enfermedad, a partir de datos
abiertos oficiales.

Reporte completo: [`docs/reporte_dengue_mongodb.pdf`](docs/reporte_dengue_mongodb.pdf)
Guía de reproducción paso a paso: [`docs/orden_ejecucion.md`](docs/orden_ejecucion.md)

## Datos

- **42,219** casos individuales (DGE/SINAVE, datos abiertos) agregados en
  **10,353** documentos municipio-semana.
- Cobertura: semanas epidemiológicas 1-32 de 2026 (agosto parcial, hasta
  el 9 de agosto).
- Geometría: centroide de municipio (Point GeoJSON), población: censo
  INEGI 2020.

## Hallazgos principales

**Rendimiento (índices ESR)**: tres índices compuestos eliminaron el
`COLLSCAN` y la etapa `SORT` en memoria en las tres consultas principales.
La consulta de "top municipios por semana" pasó de examinar 10,353
documentos a examinar exactamente los 419 que devolvió — cero trabajo
desperdiciado.

**Geoespacial**: el hotspot de la semana 25 de 2026 fue Hermosillo,
Sonora (16 casos confirmados). Ningún municipio dentro de 150 km alcanzó
el umbral de 3 casos confirmados esa misma semana — sin señal de
propagación regional visible en ese corte de datos.

**Temporal**: la curva mensual nacional muestra mayor actividad en
mayo-julio (682-730 casos confirmados/mes) frente al valle de
febrero-abril (352-447) — consistente con temporada de lluvias. Enero
rompe el patrón simple (719 casos), posiblemente por ajustes tardíos de
cifras preliminares de la DGE.

**Seguridad**: se detectó riesgo de re-identificación por celda pequeña
en municipios de baja población (ej. San Javier, Sonora: 537 hab.) y se
implementó una vista con generalización de conteos bajos. La matriz de
roles con privilegio mínimo se **comprobó con un usuario real**, no solo
se diseñó: acceso permitido a la vista generalizada, rechazado
(`Unauthorized`) a la colección completa y a escritura.

## Estructura del repositorio

```
docs/
  reporte_dengue_mongodb.tex   Reporte completo (compilar con pdflatex)
  orden_ejecucion.md           Guía de reproducción paso a paso
datos/
  crudos/                      dengue_abierto.csv + diccionario oficial DGE
  catalogos/                   Catálogos de municipio, entidad, población/geometría (INEGI)
  procesados/                  Salidas intermedias y finales del ETL
etl/
  explorar_dengue.py           Inspección inicial de columnas del CSV crudo
  etl_dengue.py                Agregación por municipio + semana epidemiológica
  cruzar_catalogos.py          Cruce con nombres oficiales de municipio/entidad
  cruzar_geometria_poblacion.py Cruce con centroide y población (INEGI)
  preparar_para_mongoimport.py Conversión a Extended JSON (BSON Date)
mongo/
  validador_casos_semanales.js Esquema $jsonSchema + casos de prueba
  indices_semana2.js           Índices ESR + medición antes/después
  consultas_reales.js          Funciones explain() parametrizadas
  geoespacial_semana3.js       Índice 2dsphere + $geoNear + casos de control
  temporal_semana4.js          Índice temporal + serie mensual + estacionalidad
  seguridad_busqueda_semana5.js Búsqueda, clasificación, minimización, roles
  metodologia_inicial/         Medición inicial con datos sintéticos (previa a
                                tener el dataset real, conservada como evidencia
                                de proceso)
```

## Fuentes de datos

- **Dirección General de Epidemiología (DGE/SINAVE)** — datos abiertos de
  dengue por caso individual. `datosabiertos.salud.gob.mx`. Descargado el
  25 de agosto de 2026.
- **INEGI** — Censo de Población y Vivienda 2020 (población municipal) y
  Marco Geoestadístico (referencia de claves). Centroides y población
  obtenidos vía [gist de lapanquecita](https://gist.github.com/lapanquecita/1b819ec5373f9304efc52149e96a91b7).
- **DengueMX** ([RodrigoZepeda/DengueMX](https://github.com/RodrigoZepeda/DengueMX)) —
  consultado como referencia durante la exploración inicial de fuentes.

## Limitaciones conocidas

- Cobertura de un solo año (parcial), sin comparación interanual.
- Geometría a nivel de centroide, no polígono — limita el análisis
  espacial a proximidad, no a pertenencia territorial (`$geoWithin`).
- `$jsonSchema` no valida rangos numéricos por posición dentro de un
  arreglo (`geometry.coordinates`); esa validación se aplica en el ETL.
- TLS deshabilitado en el entorno de desarrollo local (Docker, localhost).
- Los umbrales de generalización de celdas pequeñas (población < 5,000,
  conteo < 3) son una decisión de diseño propia, no un estándar externo.
