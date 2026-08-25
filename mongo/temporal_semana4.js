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


// --- Pipeline por periodo: indicador mensual nacional ---
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

/**
 * ============================================================
 * RESULTADOS REALES
 * ============================================================
 *
 * Consulta por intervalo (2026-06-01 a 2026-07-01): antes de indexar,
 * COLLSCAN→SORT, 10,353 docsExamined, 1,614 nReturned. Después de
 * crear idx_fecha_inicio_semana: IXSCAN puro, sin SORT independiente,
 * keysExamined = docsExamined = nReturned = 1,614.
 *
 * Serie mensual nacional real (dataset DGE/SINAVE 2026, casos
 * confirmados / municipios con casos):
 *
 * | Mes 2026    | Casos confirmados | Municipios con casos |
 * |-------------|--------------------|------------------------|
 * | Enero       | 719                | 267                    |
 * | Febrero     | 352                | 183                    |
 * | Marzo       | 447                | 215                    |
 * | Abril       | 395                | 179                    |
 * | Mayo        | 682                | 286                    |
 * | Junio       | 614                | 263                    |
 * | Julio       | 730                | 334                    |
 * | Agosto*     | 213                | 107                    |
 *
 * *Agosto incompleto: el dataset cubre hasta el 9 de agosto de 2026
 * (~9 de 31 días), no un mes completo — no comparable directamente
 * contra los demás meses sin esa aclaración.
 *
 * pruebaEstacionalidad(db) -> enero: 719, jun-jul: 1,344.
 * "Consistente con la estacionalidad esperada" — pero con una
 * matización importante: enero, tomado individualmente, está casi al
 * nivel del pico de mayo-julio, rompiendo el patrón de curva simple
 * ascendente que se esperaría de una estacionalidad limpia. Posible
 * explicación: cifras preliminares que la DGE ajusta en boletines
 * posteriores (los sistemas de vigilancia epidemiológica mexicanos
 * revisan y corrigen semanas anteriores en cada actualización). No
 * se fuerza una narrativa estacional que los datos no sostienen del
 * todo — se documenta como límite de interpretación.
 */
