/**
 * ============================================================
 * Semana 2, §3.2 — Patrones de consulta seleccionados
 * ============================================================
 *
 * Consulta A — "Top municipios por semana"
 *   Pregunta: ¿qué municipios muestran mayor incidencia de casos
 *             confirmados en una semana epidemiológica dada?
 *   Campos de igualdad: semana_epidemiologica.anio, semana_epidemiologica.semana
 *   Ordenamiento: casos_confirmados descendente
 *   ¿Consulta arreglo?: no
 *   Frecuencia esperada: alta — vista principal para brigadas de
 *                         control, se ejecuta cada semana epidemiológica.
 *
 * Consulta B — "Serie temporal de un municipio"
 *   Pregunta: ¿cómo ha evolucionado la incidencia semanal de un
 *             municipio a lo largo de un rango de semanas/años?
 *   Campos de igualdad: clave_municipio
 *   Campos de rango: semana_epidemiologica.anio
 *   Ordenamiento: fecha_inicio_semana ascendente
 *   ¿Consulta arreglo?: no
 *   Frecuencia esperada: alta — base de cualquier gráfica de tendencia
 *                         o detección de estacionalidad (semana 4).
 *
 * Consulta C — "Casos por entidad federativa en un rango de fechas"
 *   Pregunta: ¿cuántos casos confirmados y probables hay por entidad
 *             federativa en un periodo dado?
 *   Campos de igualdad: entidad_federativa
 *   Campos de rango: fecha_inicio_semana
 *   Ordenamiento: fecha_inicio_semana ascendente
 *   ¿Consulta arreglo?: no
 *   Frecuencia esperada: media-alta — apoya reportes estatales agregados.
 *
 * Se conservaron estas tres consultas SIN CAMBIOS durante toda la
 * comparación antes/después de indexar.
 */

// ============================================================
// Diseño de índices (regla ESR: Equality, Sort, Range)
// ============================================================
/**
 * idx_semana_casos  (apoya Consulta A)
 *   Patrón: { "semana_epidemiologica.anio": 1, "semana_epidemiologica.semana": 1, "casos_confirmados": -1 }
 *   Igualdad primero (anio, semana), luego el campo de orden
 *   (casos_confirmados desc) al final, coincidiendo con el sort.
 *
 * idx_municipio_fecha_anio  (apoya Consulta B)
 *   Patrón: { clave_municipio: 1, fecha_inicio_semana: 1, "semana_epidemiologica.anio": 1 }
 *   Igualdad (clave_municipio) → Orden (fecha_inicio_semana, coincide
 *   con el sort) → Rango (anio) al final. Este orden ESR es lo que
 *   permite que Mongo entregue resultados ya ordenados sin SORT en
 *   memoria, incluso con un filtro de rango encima.
 *
 * idx_entidad_fecha  (apoya Consulta C)
 *   Patrón: { entidad_federativa: 1, fecha_inicio_semana: 1 }
 *   Igualdad primero; rango y orden coinciden en el mismo campo
 *   (fecha_inicio_semana), así que resuelve ambos a la vez.
 *
 * Se proponen solo 3 índices (uno por consulta), no uno por campo:
 * cada uno se deriva de un patrón de consulta real documentado
 * arriba, no de la sola aparición de un campo en un filtro.
 */

function crearIndices(db) {
  db.casos_semanales.createIndex(
    { "semana_epidemiologica.anio": 1, "semana_epidemiologica.semana": 1, "casos_confirmados": -1 },
    { name: "idx_semana_casos" }
  );

  db.casos_semanales.createIndex(
    { clave_municipio: 1, fecha_inicio_semana: 1, "semana_epidemiologica.anio": 1 },
    { name: "idx_municipio_fecha_anio" }
  );

  db.casos_semanales.createIndex(
    { entidad_federativa: 1, fecha_inicio_semana: 1 },
    { name: "idx_entidad_fecha" }
  );
}

// Ejecutar y comprobar:
//   crearIndices(db)
//   printjson(db.casos_semanales.getIndexes())

// ============================================================
// Re-medición — usar explainConsultaA/B/C de consultas_reales.js
// ============================================================
/**
 *   printjson(explainConsultaA(db, 2026, 25))
 *   printjson(explainConsultaB(db, "07009", 2026, 2026))
 *   printjson(explainConsultaC(db, "CHIAPAS", "2026-01-01", "2026-07-01"))
 */

/**
 * ============================================================
 * RESULTADOS REALES — tabla comparativa antes/después
 * (10,353 documentos reales, DGE/SINAVE 2026, semanas 1-32)
 * ============================================================
 *
 * | Consulta                    | Plan antes       | Plan después              | SORT indep. después | keysExamined | docsExamined | nReturned |
 * |------------------------------|------------------|----------------------------|----------------------|--------------|--------------|-----------|
 * | A: top semana 25, 2026       | COLLSCAN→SORT    | IXSCAN (idx_semana_casos)  | No                   | 419          | 419          | 419       |
 * | B: serie municipio 07009     | COLLSCAN→SORT    | IXSCAN (idx_municipio_...) | No                   | 33           | 32           | 32        |
 * | C: CHIAPAS, ene–jul 2026     | COLLSCAN→SORT    | IXSCAN (idx_entidad_fecha) | No                   | 527          | 527          | 527       |
 *
 * Antes de indexar, totalDocsExamined = 10,353 (colección completa)
 * en los tres casos, con COLLSCAN seguido de una etapa SORT en
 * memoria. En los tres casos nReturned se mantuvo idéntico antes y
 * después de indexar, confirmando que la comparación es válida (el
 * índice no alteró qué documentos califican).
 *
 * Caso más limpio: la consulta A quedó con
 * keysExamined = docsExamined = nReturned = 419 — cero trabajo
 * desperdiciado. El índice resolvió el filtro de igualdad y el orden
 * simultáneamente, sin tocar un documento de más.
 *
 * Costo esperado: 3 índices compuestos adicionales sobre 10,353
 * documentos (y creciendo con cada carga semanal) es razonable para
 * el volumen del proyecto. Cada insert/actualización semanal escribe
 * en 3 B-trees adicionales — costo de mantenimiento aceptado a
 * cambio de eliminar el COLLSCAN en las tres consultas más
 * frecuentes del sistema.
 *
 * Reutilización de prefijo: idx_municipio_fecha_anio (empieza en
 * clave_municipio) también serviría, sin crear un cuarto índice, para
 * una consulta futura que solo filtre por clave_municipio sin rango
 * de fecha.
 */
