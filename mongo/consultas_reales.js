/**
 * Descubrimiento de parámetros reales antes de medir, y las tres
 * funciones explain() parametrizadas, listas para usarse contra
 * cualquier corte de datos (no solo el usado durante el desarrollo).
 */

function descubrirParametros(db) {
  print("=== Años/semanas disponibles ===");
  printjson(db.casos_semanales.aggregate([
    { $group: { _id: "$semana_epidemiologica.anio", n: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ]).toArray());

  print("\n=== Top 5 semanas con más documentos (para elegir una con volumen) ===");
  printjson(db.casos_semanales.aggregate([
    { $group: { _id: "$semana_epidemiologica", n: { $sum: 1 } } },
    { $sort: { n: -1 } },
    { $limit: 5 }
  ]).toArray());

  print("\n=== Un clave_municipio real con varios documentos ===");
  printjson(db.casos_semanales.aggregate([
    { $group: { _id: "$clave_municipio", n: { $sum: 1 } } },
    { $sort: { n: -1 } },
    { $limit: 3 }
  ]).toArray());

  print("\n=== Entidades federativas disponibles ===");
  printjson(db.casos_semanales.distinct("entidad_federativa"));

  print("\n=== Rango real de fecha_inicio_semana ===");
  printjson(db.casos_semanales.aggregate([
    { $group: { _id: null, min: { $min: "$fecha_inicio_semana" }, max: { $max: "$fecha_inicio_semana" } } }
  ]).toArray());
}

// --- Consulta A: top municipios por semana ---
function explainConsultaA(db, anio, semana) {
  return db.casos_semanales.find({
    "semana_epidemiologica.anio": anio,
    "semana_epidemiologica.semana": semana
  }).sort({ casos_confirmados: -1 }).explain("executionStats");
}

// --- Consulta B: serie temporal de un municipio ---
function explainConsultaB(db, claveMunicipio, anioInicio, anioFin) {
  return db.casos_semanales.find({
    clave_municipio: claveMunicipio,
    "semana_epidemiologica.anio": { $gte: anioInicio, $lte: anioFin }
  }).sort({ fecha_inicio_semana: 1 }).explain("executionStats");
}

// --- Consulta C: casos por entidad en rango de fechas ---
function explainConsultaC(db, entidad, fechaInicio, fechaFin) {
  return db.casos_semanales.find({
    entidad_federativa: entidad,
    fecha_inicio_semana: { $gte: new Date(fechaInicio), $lt: new Date(fechaFin) }
  }).sort({ fecha_inicio_semana: 1 }).explain("executionStats");
}

/**
 * ============================================================
 * PARÁMETROS REALES usados en la medición documentada del proyecto
 * (dataset DGE/SINAVE 2026, semanas 1-32, 10,353 documentos)
 * ============================================================
 *
 *   printjson(explainConsultaA(db, 2026, 25))
 *   printjson(explainConsultaB(db, "07009", 2026, 2026))
 *   printjson(explainConsultaC(db, "CHIAPAS", "2026-01-01", "2026-07-01"))
 *
 * Se eligió la semana 25 por tener el mayor volumen de documentos
 * (419) entre las candidatas exploradas con descubrirParametros(db).
 * Se eligió el municipio 07009 (Chiapas) por ser uno de los estados
 * de mayor incidencia histórica de dengue en México. Nota: el
 * catálogo real usa nombres oficiales completos en mayúsculas
 * (ej. "VERACRUZ DE IGNACIO DE LA LLAVE", no "Veracruz").
 *
 * Resultados obtenidos con estos parámetros, antes/después de crear
 * los índices de indices_semana2.js: ver la tabla comparativa al
 * final de ese archivo.
 */
