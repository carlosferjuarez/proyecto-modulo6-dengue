/**
 * ============================================================
 * Semana 5 — Búsqueda, seguridad y privacidad
 * ============================================================
 */

// ------------------------------------------------------------
// 1. BÚSQUEDA: nombre de municipio por prefijo (no $text — no hay
//    texto libre en el esquema; esto es un patrón estructurado).
// ------------------------------------------------------------

function crearIndiceBusquedaMunicipio(db) {
  db.casos_semanales.createIndex(
    { municipio: 1 },
    { name: "idx_municipio_busqueda" }
  );
}

function buscarMunicipioPorPrefijo(db, prefijo) {
  // Regex anclado (^) para que SÍ pueda usar el índice (un regex sin
  // ancla al inicio no puede aprovechar un índice B-tree ordinario).
  return db.casos_semanales.distinct("municipio", {
    municipio: { $regex: "^" + prefijo, $options: "i" }
  });
}

function pruebaBusquedaMunicipio(db) {
  print("=== Coincidencia esperada: 'HERM' -> HERMOSILLO ===");
  printjson(buscarMunicipioPorPrefijo(db, "HERM"));

  print("\n=== Exclusión esperada: 'ZZZ' -> ninguno ===");
  printjson(buscarMunicipioPorPrefijo(db, "ZZZ"));

  print("\n=== Coincidencia múltiple esperada: 'SAN ' -> varios municipios ===");
  printjson(buscarMunicipioPorPrefijo(db, "SAN "));
}
// Uso: pruebaBusquedaMunicipio(db)


// ------------------------------------------------------------
// 2. CLASIFICACIÓN DE DATOS
// ------------------------------------------------------------
/**
 * Público:    clave_municipio, municipio, entidad_federativa,
 *             semana_epidemiologica, fecha_inicio_semana, poblacion
 *             (censo INEGI, ya público de origen)
 * Interno:    fuente, fecha_carga (metadatos de trazabilidad,
 *             sin valor sensible pero tampoco necesarios para
 *             consumo público)
 * Sensible (condicional): casos_confirmados, casos_probables,
 *             defunciones — CUANDO el municipio tiene población
 *             pequeña. Un conteo bajo (1-2 casos, o cualquier
 *             defunción) en un municipio de unos cientos de
 *             habitantes puede acercarse a identificar a una
 *             persona concreta. En municipios grandes (ej.
 *             Hermosillo, 936k hab.) el mismo dato es
 *             estadísticamente anónimo. La sensibilidad depende
 *             del tamaño de población, no solo del campo.
 */


// ------------------------------------------------------------
// 3. MINIMIZACIÓN: generalización de celdas pequeñas
// ------------------------------------------------------------
// Para cualquier rol que NO necesite el conteo exacto (ej. un
// dashboard público o una brigada sin necesidad de precisión),
// se generaliza a un rango cuando la población es pequeña y el
// conteo es bajo, en vez de exponer el número exacto.

const UMBRAL_POBLACION_PEQUENA = 5000;   // municipios pequeños
const UMBRAL_CONTEO_SENSIBLE = 3;        // conteos bajos a generalizar

function crearVistaGeneralizada(db) {
  db.createView("casos_semanales_publico", "casos_semanales", [
    {
      $project: {
        clave_municipio: 1,
        municipio: 1,
        entidad_federativa: 1,
        semana_epidemiologica: 1,
        fecha_inicio_semana: 1,
        poblacion: 1,
        geometry: 1,
        casos_confirmados: {
          $cond: [
            {
              $and: [
                { $lt: ["$poblacion", UMBRAL_POBLACION_PEQUENA] },
                { $lt: ["$casos_confirmados", UMBRAL_CONTEO_SENSIBLE] }
              ]
            },
            "menos de 3",  // generalizado, no el número exacto
            "$casos_confirmados"
          ]
        },
        casos_probables: {
          $cond: [
            {
              $and: [
                { $lt: ["$poblacion", UMBRAL_POBLACION_PEQUENA] },
                { $lt: ["$casos_probables", UMBRAL_CONTEO_SENSIBLE] }
              ]
            },
            "menos de 3",
            "$casos_probables"
          ]
        },
        // defunciones: la más sensible de las tres -> se generaliza
        // a presencia/ausencia en municipios pequeños, nunca el
        // conteo exacto (1 defunción en un pueblo de 365 habitantes
        // es prácticamente un identificador).
        defunciones: {
          $cond: [
            { $lt: ["$poblacion", UMBRAL_POBLACION_PEQUENA] },
            { $cond: [{ $gt: ["$defunciones", 0] }, "reportada(s)", "0"] },
            "$defunciones"
          ]
        }
      }
    }
  ]);
}
// Uso: crearVistaGeneralizada(db)
//      db.casos_semanales_publico.findOne({ municipio: "SAN JAVIER" })
//      -> debe mostrar defunciones como "reportada(s)" o "0", no el
//         número exacto; casos_semanales_publico.findOne({municipio:"HERMOSILLO"})
//         -> debe mostrar los números exactos (población grande)


// ------------------------------------------------------------
// 4. MATRIZ DE ROLES — privilegio mínimo
// ------------------------------------------------------------
/**
 * Rol                  | Colección/vista            | Operación | Alcance
 * ---------------------|-----------------------------|-----------|-----------------
 * brigada_campo        | casos_semanales_publico     | find      | Solo su entidad
 * epidemiologo_estatal | casos_semanales (completa)  | find      | Solo su entidad
 * director_nacional    | casos_semanales (completa)  | find      | Todas las entidades
 * etl_loader           | casos_semanales             | insert    | Sin lectura de detalle
 *                      |                              | update    | (solo carga de datos)
 */

function crearRoles(db) {
  // brigada_campo: solo la vista generalizada, y solo su propia entidad
  // (el filtro por entidad se aplicaría a nivel de aplicación o con un
  // usuario por entidad + una vista parametrizada; aquí se muestra el
  // rol base sin el filtro por entidad, que requiere una vista por
  // entidad o lógica en la capa de aplicación).
  db.createRole({
    role: "brigada_campo",
    privileges: [
      {
        resource: { db: db.getName(), collection: "casos_semanales_publico" },
        actions: ["find"]
      }
    ],
    roles: []
  });

  db.createRole({
    role: "epidemiologo_estatal",
    privileges: [
      {
        resource: { db: db.getName(), collection: "casos_semanales" },
        actions: ["find"]
      }
    ],
    roles: []
  });

  db.createRole({
    role: "director_nacional",
    privileges: [
      {
        resource: { db: db.getName(), collection: "casos_semanales" },
        actions: ["find"]
      },
      {
        resource: { db: db.getName(), collection: "casos_semanales_publico" },
        actions: ["find"]
      }
    ],
    roles: []
  });

  db.createRole({
    role: "etl_loader",
    privileges: [
      {
        resource: { db: db.getName(), collection: "casos_semanales" },
        actions: ["insert", "update", "createIndex"]
      }
    ],
    roles: []
  });
}
// Uso: crearRoles(db)
//      printjson(db.getRoles({ showPrivileges: true }))
//
// Creación de usuarios (NUNCA con contraseña en texto plano en un
// script versionado -- esto es solo ejemplo de sintaxis, la
// contraseña real se pasa por variable de entorno o gestor de
// secretos, nunca hardcodeada ni committeada):
//
//   db.createUser({
//     user: "brigada_sonora",
//     pwd: passwordPrompt(),  // mongosh pide la contraseña interactivamente
//     roles: [{ role: "brigada_campo", db: db.getName() }]
//   })
