/**
 * ============================================================
 * Semana 4 — Componente temporal
 * ============================================================
 */

// --- Índice para consultas de rango temporal puro (sin entidad/municipio) ---
function crearIndiceTemporal(db) {
  db.casos_semanales.createIndex(
    { fecha_inicio_semana: 1 },
    { name: "idx_fecha_inicio_semana" }
  );
}
// Ejecutar y confirmar:
//   crearIndiceTemporal(db)
//   printjson(db.casos_semanales.getIndexes())


// --- Consulta por intervalo [inicio, fin) a nivel nacional ---
function explainConsultaIntervalo(db, fechaInicioISO, fechaFinISO) {
  return db.casos_semanales.find({
    fecha_inicio_semana: {
      $gte: new Date(fechaInicioISO),
      $lt: new Date(fechaFinISO)
    }
  }).sort({ fecha_inicio_semana: 1 }).explain("executionStats");
}
// Uso: printjson(explainConsultaIntervalo(db, "2026-06-01", "2026-07-01"))
// Verificar: debe usar IXSCAN sobre idx_fecha_inicio_semana, sin SORT
// independiente (el índice ya entrega el orden).


// --- Pipeline por periodo: indicador mensual nacional ---
// Suma de casos confirmados/probables/defunciones por mes calendario,
// más el número de municipios distintos que reportaron algún caso ese
// mes (para distinguir "más casos" de "más dispersión geográfica").
function serieNacionalPorMes(db) {
  return db.casos_semanales.aggregate([
    {
      $group: {
        _id: { $dateTrunc: { date: "$fecha_inicio_semana", unit: "month" } },
        casos_confirmados: { $sum: "$casos_confirmados" },
        casos_probables: { $sum: "$casos_probables" },
        defunciones: { $sum: "$defunciones" },
        municipios_con_casos: {
          $sum: { $cond: [{ $gt: ["$casos_confirmados", 0] }, 1, 0] }
        }
      }
    },
    { $sort: { _id: 1 } },
    {
      $project: {
        _id: 0,
        mes: "$_id",
        casos_confirmados: 1,
        casos_probables: 1,
        defunciones: 1,
        municipios_con_casos: 1
      }
    }
  ]).toArray();
}
// Uso: printjson(serieNacionalPorMes(db))


// --- Prueba con fechas conocidas: ¿hay estacionalidad reconocible? ---
// Compara el inicio del año (antes de temporada de lluvias, normalmente
// baja transmisión) contra el periodo de pico esperado (jun-ago, cuando
// las lluvias favorecen la reproducción del vector).
function pruebaEstacionalidad(db) {
  const enero = db.casos_semanales.aggregate([
    { $match: { fecha_inicio_semana: { $gte: new Date("2026-01-01"), $lt: new Date("2026-02-01") } } },
    { $group: { _id: null, total: { $sum: "$casos_confirmados" } } }
  ]).toArray();

  const veranoLluvias = db.casos_semanales.aggregate([
    { $match: { fecha_inicio_semana: { $gte: new Date("2026-06-01"), $lt: new Date("2026-08-01") } } },
    { $group: { _id: null, total: { $sum: "$casos_confirmados" } } }
  ]).toArray();

  const totalEnero = enero.length ? enero[0].total : 0;
  const totalVerano = veranoLluvias.length ? veranoLluvias[0].total : 0;

  print(`Casos confirmados en enero 2026: ${totalEnero}`);
  print(`Casos confirmados en jun-jul 2026: ${totalVerano}`);
  print(totalVerano > totalEnero
    ? "-> Consistente con la estacionalidad esperada (mayor transmisión en temporada de lluvias)."
    : "-> NO consistente con la estacionalidad esperada. Revisar antes de concluir.");

  return { enero: totalEnero, veranoLluvias: totalVerano };
}
// Uso: pruebaEstacionalidad(db)
