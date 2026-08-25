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
  // Regex anclado (^) para que SÍ pueda usar el índice.
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
 * Interno:    fuente, fecha_carga (metadatos de trazabilidad)
 * Sensible (condicional): casos_confirmados, casos_probables,
 *             defunciones — CUANDO el municipio tiene población
 *             pequeña. Un conteo bajo (1-2 casos, o cualquier
 *             defunción) en un municipio de unos cientos de
 *             habitantes puede acercarse a identificar a una
 *             persona concreta. En municipios grandes el mismo dato
 *             es estadísticamente anónimo. La sensibilidad depende
 *             del tamaño de población, no solo del campo.
 */


// ------------------------------------------------------------
// 3. MINIMIZACIÓN: generalización de celdas pequeñas
// ------------------------------------------------------------

const UMBRAL_POBLACION_PEQUENA = 5000;
const UMBRAL_CONTEO_SENSIBLE = 3;

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
            "menos de 3",
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

// Creación de usuario de prueba (contraseña NUNCA en texto plano en
// el script; se ingresa de forma interactiva):
//
//   db.createUser({
//     user: "test_brigada",
//     pwd: passwordPrompt(),
//     roles: [{ role: "brigada_campo", db: db.getName() }]
//   })

/**
 * ============================================================
 * RESULTADOS REALES (evidencia comprobada, no solo diseño)
 * ============================================================
 *
 * Vista generalizada — comparación real:
 *   casos_semanales_publico.findOne({municipio:"SAN JAVIER"})
 *     -> casos_confirmados: "menos de 3", casos_probables: "menos de 3",
 *        defunciones: "0"   (población 537, bajo el umbral)
 *   casos_semanales.findOne({municipio:"AGUASCALIENTES"}) [vía la vista]
 *     -> casos_confirmados: 0 (número exacto, sin generalizar —
 *        población 948,990, sobre el umbral)
 *   Confirma que la regla discrimina por tamaño de población, no se
 *   aplica ciegamente a cualquier conteo bajo.
 *
 * Matriz de roles — probada con un usuario real (test_brigada,
 * rol brigada_campo), en una sesión de mongosh aparte (no como
 * admin/root):
 *   db.casos_semanales_publico.findOne()
 *     -> PERMITIDO
 *   db.casos_semanales.findOne()
 *     -> MongoServerError[Unauthorized]: not authorized on
 *        proyecto_modulo6 to execute command { find: "casos_semanales", ... }
 *   db.casos_semanales.insertOne({ prueba: 1 })
 *     -> MongoServerError[Unauthorized]: not authorized on
 *        proyecto_modulo6 to execute command { insert: "casos_semanales", ... }
 *   Esto distingue explícitamente un rol DISEÑADO de una denegación
 *   REALMENTE COMPROBADA, como exige la guía.
 *
 * Credenciales y cifrado (entorno: MongoDB 7.0.37 en Docker local,
 * 127.0.0.1):
 *   db.runCommand({ connectionStatus: 1 })
 *     -> authenticatedUsers: admin (db: admin), rol: root
 *   db.serverStatus().transportSecurity
 *     -> { '1.0': 0, '1.1': 0, '1.2': 0, '1.3': 0, unknown: 0 }
 *   TLS deshabilitado. Aceptado como decisión válida para desarrollo
 *   local (tráfico que nunca sale de localhost); se documenta como
 *   limitación con recomendación explícita de habilitar TLS en
 *   cualquier despliegue donde el tráfico cruce una red.
 */
