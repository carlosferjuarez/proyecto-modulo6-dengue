/**
 * ============================================================
 * Semana 3 — Componente geoespacial
 * ============================================================
 *
 * Tabla de decisión (§3.2 de la guía):
 *
 * | Pregunta                                                        | Entidad y geometría        | Relación espacial | Decisión                                                                 |
 * |------------------------------------------------------------------|-----------------------------|--------------------|---------------------------------------------------------------------------|
 * | ¿Qué municipios cercanos a un municipio con brote también       | Municipio (centroide, Point)| Proximidad         | Integrar — cambia qué municipios se consideran en riesgo de contagio     |
 * | muestran incidencia elevada en la misma semana?                  |                             |                    | regional, no solo cuáles tienen más casos aislados                       |
 * | ¿Cuántos casos hay dentro de un radio de un punto de referencia? | Municipio (centroide, Point)| Proximidad (radio) | Integrar — apoya despliegue operativo de brigadas de control vectorial   |
 * | ¿Los casos coinciden con una región poligonal (ej. franja        | Requeriría polígonos, no   | Pertenencia        | Posponer — solo se cuenta con centroides puntuales, no con polígonos     |
 * | costera, área metropolitana)?                                    | solo centroides            | ($geoWithin)       | de región en el dataset actual                                           |
 */

// --- Índice geoespacial ---
function crearIndiceGeoespacial(db) {
  db.casos_semanales.createIndex(
    { geometry: "2dsphere" },
    { name: "idx_geometry_2dsphere" }
  );
}
// Ejecutar y confirmar:
//   crearIndiceGeoespacial(db)
//   printjson(db.casos_semanales.getIndexes())


// --- Encontrar el hotspot real de una semana dada (sin asumir cuál es) ---
function encontrarHotspot(db, anio, semana) {
  return db.casos_semanales.find({
    "semana_epidemiologica.anio": anio,
    "semana_epidemiologica.semana": semana
  }).sort({ casos_confirmados: -1 }).limit(1).toArray()[0];
}
// Uso: const hotspot = encontrarHotspot(db, <anio>, <semana>)
//      printjson(hotspot)
// El hotspot se calcula dinámicamente a partir de los datos cargados;
// no se hardcodea ningún municipio específico en esta función, para
// que el script siga siendo válido si el dataset se actualiza.


// --- Consulta espacial simple con $near ---
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
// Uso: const [lon, lat] = hotspot.geometry.coordinates
//      printjson(municipiosCercanos(db, lon, lat, 150000))  // 150 km


// --- Integrar selección espacial con análisis temático ($geoNear primero) ---
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
// Uso: printjson(brotesRegionalesCercanos(db, lon, lat, 150000, <anio>, <semana>, 3))

/**
 * ============================================================
 * §3.8 — Casos de control (verificados con datos reales)
 * ============================================================
 * Ejecución real documentada del proyecto:
 *
 *   const hotspot = encontrarHotspot(db, 2026, 25)
 *   // -> Hermosillo, Sonora (clave_municipio "26030"),
 *   //    coordinates: [-110.5730469, 29.042961],
 *   //    casos_confirmados: 16 (el mayor de esa semana)
 *
 *   const [lon, lat] = hotspot.geometry.coordinates
 *   printjson(municipiosCercanos(db, lon, lat, 150000))
 *   printjson(brotesRegionalesCercanos(db, lon, lat, 150000, 2026, 25, 3))
 *
 * RESULTADOS:
 *
 * 1. municipiosCercanos(db, -110.5730469, 29.042961, 150000) devolvió
 *    30 municipios, TODOS de Sonora (San Miguel de Horcasitas, Ures,
 *    Magdalena, Arizpe, Carbó, Soyopa, San Javier, Onavas, entre
 *    otros) — ninguno de otro estado. Confirma que el índice
 *    2dsphere y las coordenadas están bien construidos.
 *
 * 2. brotesRegionalesCercanos(db, -110.5730469, 29.042961, 150000,
 *    2026, 25, 3) devolvió un único resultado:
 *      { municipio: "HERMOSILLO", entidad_federativa: "SONORA",
 *        casos_confirmados: 16, distancia_km: 0 }
 *    Ningún municipio vecino alcanzó el umbral de 3 casos
 *    confirmados esa semana — sin señal de propagación regional
 *    visible en la semana 25 de 2026.
 *
 * 3. Caso de control #4 (filtro temático aplicado después de la
 *    selección espacial): San Miguel de Horcasitas, Sonora
 *    (clave "26056"), semana 25, con casos_confirmados: 0 —
 *    apareció en municipiosCercanos() pero NO en
 *    brotesRegionalesCercanos(). Confirma el orden correcto de
 *    operaciones en el pipeline.
 *
 * 4. Caso de control #3 (¿$maxDistance acota de verdad?): se probó
 *    con Tapachula, Chiapas (clave_municipio "07089",
 *    coordinates: [-92.1551552, 14.5439857], casos_confirmados: 2
 *    esa misma semana), a ~2,000 km de Hermosillo. NO apareció en
 *    ninguno de los dos resultados anteriores — confirma que
 *    $maxDistance realmente acota la búsqueda.
 *
 * LIMITACIÓN DOCUMENTADA: la comparación usa conteos absolutos de
 * casos confirmados, no tasas de incidencia por población. Hermosillo
 * (936,263 hab.) y San Javier (537 hab.) no son comparables con el
 * mismo umbral de "casos confirmados" — un municipio pequeño con 1-2
 * casos puede tener una incidencia por 100,000 habitantes mayor que
 * Hermosillo con 16. Un conteo no es una tasa si no existe un
 * denominador de exposición (población) en el cálculo — aquí no se
 * incluyó, y es una mejora pendiente señalada explícitamente.
 */
