/**
 * ============================================================
 * Semana 3 — Componente geoespacial
 * ============================================================
 */

// --- §3.5: crear y verificar el índice geoespacial ---
function crearIndiceGeoespacial(db) {
  db.casos_semanales.createIndex(
    { geometry: "2dsphere" },
    { name: "idx_geometry_2dsphere" }
  );
}
// Ejecutar y confirmar:
//   crearIndiceGeoespacial(db)
//   printjson(db.casos_semanales.getIndexes())
//   db.casos_semanales.countDocuments({ geometry: { $exists: true } })


// --- Paso previo: encontrar un hotspot real para usar como referencia ---
function encontrarHotspot(db, anio, semana) {
  return db.casos_semanales.find({
    "semana_epidemiologica.anio": anio,
    "semana_epidemiologica.semana": semana
  }).sort({ casos_confirmados: -1 }).limit(1).toArray()[0];
}
// Uso: const hotspot = encontrarHotspot(db, 2026, 25)
//      printjson(hotspot)


// --- §3.6: consulta espacial simple con $near ---
// Municipios ordenados por cercanía a un punto de referencia, dentro de
// un radio máximo (en metros).
function municipiosCercanos(db, lon, lat, radioMetros) {
  return db.casos_semanales.find({
    geometry: {
      $near: {
        $geometry: { type: "Point", coordinates: [lon, lat] },
        $maxDistance: radioMetros
      }
    }
  }).toArray();
}
// Uso: printjson(municipiosCercanos(db, -92.45, 16.75, 100000))  // 100 km


// --- §3.7: integrar selección espacial con análisis temático ---
// Pipeline: $geoNear (debe ir primero) + filtro de semana + proyección
// de distancia + casos, para responder "¿qué municipios cercanos al
// hotspot también tienen incidencia elevada esa semana?"
function brotesRegionalesCercanos(db, lon, lat, radioMetros, anio, semana, minCasos) {
  return db.casos_semanales.aggregate([
    {
      $geoNear: {
        near: { type: "Point", coordinates: [lon, lat] },
        distanceField: "distancia_metros",
        maxDistance: radioMetros,
        spherical: true
      }
    },
    {
      $match: {
        "semana_epidemiologica.anio": anio,
        "semana_epidemiologica.semana": semana,
        casos_confirmados: { $gte: minCasos }
      }
    },
    {
      $project: {
        _id: 0,
        municipio: 1,
        entidad_federativa: 1,
        casos_confirmados: 1,
        distancia_km: { $round: [{ $divide: ["$distancia_metros", 1000] }, 1] }
      }
    },
    { $sort: { casos_confirmados: -1 } }
  ]).toArray();
}
// Uso, con el hotspot ya encontrado:
//   const hotspot = encontrarHotspot(db, 2026, 25)
//   const [lon, lat] = hotspot.geometry.coordinates
//   printjson(brotesRegionalesCercanos(db, lon, lat, 150000, 2026, 25, 5))
//   // municipios dentro de 150km del hotspot, misma semana, con >=5 casos confirmados

/**
 * ============================================================
 * §3.8 — Casos de control sugeridos
 * ============================================================
 * 1. El propio hotspot: debe aparecer en el resultado con distancia ~0.
 * 2. Un municipio del mismo estado, cercano: debe aparecer si supera
 *    minCasos.
 * 3. Un municipio en la otra punta del país (ej. Baja California si el
 *    hotspot es Chiapas): NO debe aparecer — confirma que $maxDistance
 *    realmente está acotando.
 * 4. Un municipio cercano pero con pocos casos esa semana: debe
 *    aparecer en municipiosCercanos() (sin filtro de casos) pero NO en
 *    brotesRegionalesCercanos() si no alcanza minCasos — confirma que
 *    el filtro temático se aplicó después de la selección espacial,
 *    como pide la guía.
 */
