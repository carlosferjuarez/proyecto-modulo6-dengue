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
 *   Frecuencia esperada: alta — es la vista principal para brigadas
 *                         de control, se ejecuta cada semana epidemiológica.
 *
 * Consulta B — "Serie temporal de un municipio"
 *   Pregunta: ¿cómo ha evolucionado la incidencia semanal de un
 *             municipio a lo largo de un rango de semanas/años?
 *   Campos de igualdad: clave_municipio
 *   Campos de rango: semana_epidemiologica.anio, semana_epidemiologica.semana
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
 *   Ordenamiento: fecha_inicio_semana ascendente (o ninguno si se agrega)
 *   ¿Consulta arreglo?: no
 *   Frecuencia esperada: media-alta — apoya reportes estatales agregados.
 *
 * Se conservan estas tres consultas SIN CAMBIOS durante toda la
 * comparación antes/después de indexar (§3.2 de la guía).
 */

// ============================================================
// Generador de datos sintéticos a escala
// (correr UNA vez contra tu base de Learner Lab antes de medir)
// ============================================================

function generarDatosSinteticos(db) {
  const estados = [
    "Jalisco", "Sinaloa", "Guerrero", "Veracruz", "Yucatán",
    "Quintana Roo", "Tabasco", "Chiapas", "Oaxaca", "Michoacán"
  ];

  const municipiosPorEstado = 20; // 10 estados x 20 municipios = 200 municipios
  const anios = [2022, 2023, 2024];
  const semanasPorAnio = 52;

  const docs = [];
  let contadorClave = 1;

  for (const estado of estados) {
    for (let m = 0; m < municipiosPorEstado; m++) {
      const clave = String(contadorClave).padStart(5, "0");
      const poblacion = 20000 + Math.floor(Math.random() * 1200000);
      // Coordenadas aproximadas dentro del territorio mexicano, solo para
      // pruebas de rendimiento (NO representan ubicaciones reales exactas).
      const lon = -110 + Math.random() * 20; // aprox -110 a -90
      const lat = 16 + Math.random() * 14;   // aprox 16 a 30

      for (const anio of anios) {
        for (let semana = 1; semana <= semanasPorAnio; semana++) {
          const base = new Date(`${anio}-01-01T00:00:00Z`);
          base.setDate(base.getDate() + (semana - 1) * 7);

          docs.push({
            clave_municipio: clave,
            municipio: `Municipio ${clave}`,
            entidad_federativa: estado,
            semana_epidemiologica: { anio, semana },
            fecha_inicio_semana: base,
            casos_confirmados: Math.floor(Math.random() * 300),
            casos_probables: Math.floor(Math.random() * 150),
            defunciones: Math.random() < 0.05 ? 1 : 0,
            poblacion,
            geometry: { type: "Point", coordinates: [lon, lat] },
            fuente: "sintetico_prueba_rendimiento"
          });
        }
      }
      contadorClave++;
    }
  }

  // 200 municipios x 3 años x 52 semanas ≈ 31,200 documentos
  print(`Insertando ${docs.length} documentos sintéticos...`);
  const batchSize = 5000;
  for (let i = 0; i < docs.length; i += batchSize) {
    db.casos_semanales.insertMany(docs.slice(i, i + batchSize), { ordered: false });
  }
  print("Carga completa.");
}

// Ejecutar en mongosh:
// use tu_base_de_datos
// load("consultas_y_medicion.js")
// generarDatosSinteticos(db)

// ============================================================
// Medición inicial — ANTES de crear índices secundarios
// ============================================================

// --- Consulta A: top municipios por semana ---
function explainConsultaA(db) {
  return db.casos_semanales.find({
    "semana_epidemiologica.anio": 2024,
    "semana_epidemiologica.semana": 33
  }).sort({ casos_confirmados: -1 }).explain("executionStats");
}

// --- Consulta B: serie temporal de un municipio ---
function explainConsultaB(db) {
  return db.casos_semanales.find({
    clave_municipio: "00050",
    "semana_epidemiologica.anio": { $gte: 2023, $lte: 2024 }
  }).sort({ fecha_inicio_semana: 1 }).explain("executionStats");
}

// --- Consulta C: casos por entidad en rango de fechas ---
function explainConsultaC(db) {
  return db.casos_semanales.find({
    entidad_federativa: "Veracruz",
    fecha_inicio_semana: {
      $gte: new Date("2024-01-01T00:00:00Z"),
      $lt: new Date("2024-07-01T00:00:00Z")
    }
  }).sort({ fecha_inicio_semana: 1 }).explain("executionStats");
}

/**
 * En mongosh, corran cada una y registren de la salida:
 *   - executionStats.executionStages.stage (o el de nivel superior)
 *     -> esperar COLLSCAN antes de indexar
 *   - ¿aparece una etapa SORT independiente? (sí, antes de indexar,
 *     porque no hay índice que provea el orden ya resuelto)
 *   - executionStats.nReturned
 *   - executionStats.totalKeysExamined  (0 sin índice)
 *   - executionStats.totalDocsExamined  (≈ tamaño de la colección)
 *
 * Ejemplo de invocación:
 *   printjson(explainConsultaA(db))
 *   printjson(explainConsultaB(db))
 *   printjson(explainConsultaC(db))
 */

// ============================================================
// Plantilla para registrar resultados (llenar con la salida real)
// ============================================================
/*
| Consulta | Plan (antes) | SORT indep. | nReturned | totalKeysExamined | totalDocsExamined |
|----------|--------------|-------------|-----------|--------------------|--------------------|
| A        | COLLSCAN     |             |           |                    |                    |
| B        | COLLSCAN     |             |           |                    |                    |
| C        | COLLSCAN     |             |           |                    |                    |
*/
