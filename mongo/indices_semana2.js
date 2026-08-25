/**
 * ============================================================
 * Semana 2, §3.4 — Diseño de índices (regla ESR: Equality, Sort, Range)
 * ============================================================
 *
 * Índice 1 — idx_semana_casos  (apoya Consulta A)
 *   Patrón: { "semana_epidemiologica.anio": 1, "semana_epidemiologica.semana": 1, "casos_confirmados": -1 }
 *   Igualdad: anio, semana  →  van primero (ESR: Equality)
 *   Orden:    casos_confirmados desc → va al final, coincide con el sort de la consulta
 *   Multikey: no (ningún campo es arreglo)
 *   Costo: cada insert añade una entrada al B-tree; poco impacto porque
 *          es la escritura semanal esperada del sistema, no un hot-path
 *          de escritura masiva continua.
 *
 * Índice 2 — idx_municipio_fecha_anio  (apoya Consulta B)
 *   Patrón: { clave_municipio: 1, fecha_inicio_semana: 1, "semana_epidemiologica.anio": 1 }
 *   Igualdad: clave_municipio → primero (ESR: Equality)
 *   Orden:    fecha_inicio_semana asc → segundo, coincide con el sort de la consulta
 *   Rango:    semana_epidemiologica.anio → al final (ESR: Range)
 *   Nota: el orden Equality-Sort-Range (no Equality-Range-Sort) es lo que
 *         permite que Mongo entregue los resultados ya ordenados sin una
 *         etapa SORT en memoria, incluso con un filtro de rango encima.
 *
 * Índice 3 — idx_entidad_fecha  (apoya Consulta C)
 *   Patrón: { entidad_federativa: 1, fecha_inicio_semana: 1 }
 *   Igualdad: entidad_federativa → primero
 *   Rango y orden coinciden en el mismo campo (fecha_inicio_semana),
 *   así que va al final y resuelve ambas cosas a la vez.
 *
 * Se proponen solo 3 índices (uno por consulta), no uno por campo:
 * cada uno se deriva de un patrón de consulta real documentado arriba,
 * no de la sola aparición de un campo en un filtro.
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
// Re-medición — DESPUÉS de indexar (mismas consultas, sin cambios)
// ============================================================
// Reutiliza explainConsultaA/B/C de consultas_y_medicion.js si sigues
// en la misma sesión de mongosh (load ya las dejó definidas), o pega
// de nuevo su definición aquí si es una sesión nueva.

/**
 * printjson(explainConsultaA(db))
 * printjson(explainConsultaB(db))
 * printjson(explainConsultaC(db))
 *
 * Verificar en la salida:
 *   - stage principal ahora debe ser IXSCAN (o FETCH sobre IXSCAN),
 *     sin una etapa SORT independiente si el índice cubre el orden
 *   - totalKeysExamined ≈ nReturned (o algo mayor si hay filtro extra)
 *   - totalDocsExamined debería bajar drásticamente frente a 31,203
 *   - nReturned debe ser EXACTAMENTE el mismo que antes de indexar
 *     (203 / 104 / 520) — si cambia, algo en la consulta se alteró
 *     y la comparación ya no es válida
 */

// ============================================================
// Plantilla de comparación antes/después (llenar con la salida real)
// ============================================================
/*
| Consulta | Plan antes | Plan después | SORT indep. después | totalKeysExamined después | totalDocsExamined después |
|----------|-----------|--------------|----------------------|-----------------------------|-----------------------------|
| A        | COLLSCAN  |              |                      |                             |                             |
| B        | COLLSCAN  |              |                      |                             |                             |
| C        | COLLSCAN  |              |                      |                             |                             |
*/
