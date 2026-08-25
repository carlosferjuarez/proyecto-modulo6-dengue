/**
 * ============================================================
 * Diccionario de campos — colección: casos_semanales
 * ============================================================
 *
 * Campo/ruta                     | Tipo BSON | Presencia   | Restricción y justificación
 * --------------------------------|-----------|-------------|--------------------------------------------------
 * clave_municipio                 | string    | obligatorio | 5 dígitos (clave INEGI). Llave de cruce con geo y
 *                                  |           |             | eje del índice compuesto de consulta principal.
 * municipio                       | string    | obligatorio | No vacío. Nombre legible para reportes/UI.
 * entidad_federativa              | string    | obligatorio | No vacío. Usado para agregaciones estatales.
 * semana_epidemiologica.anio      | int       | obligatorio | 2000–2100. Evita años capturados por error.
 * semana_epidemiologica.semana    | int       | obligatorio | 1–53. Rango válido de semana epidemiológica SINAVE.
 * fecha_inicio_semana             | date      | obligatorio | BSON Date real (no string). Base de rangos [inicio,fin)
 *                                  |           |             | y de $geoNear con filtro temporal (semana 4).
 * casos_confirmados               | int       | obligatorio | ≥ 0. Núcleo del indicador de incidencia.
 * casos_probables                 | int       | obligatorio | ≥ 0. Se reporta aparte de confirmados (SINAVE).
 * defunciones                     | int       | opcional    | ≥ 0. No todos los reportes lo desglosan por semana.
 * poblacion                       | int       | obligatorio | ≥ 1. Denominador de incidencia por 100,000 hab.
 * geometry.type                   | string    | obligatorio | Debe ser exactamente "Point".
 * geometry.coordinates            | array     | obligatorio | [longitud, latitud]. lon ∈ [-180,180], lat ∈ [-90,90].
 *                                  |           |             | Orden long-lat (requisito GeoJSON/Mongo, no lat-long).
 * fuente                          | string    | opcional    | Trazabilidad de procedencia (ej. "SINAVE/DGE").
 * fecha_carga                     | date      | opcional    | Auditoría de cuándo se cargó el documento.
 *
 * Nota: "presencia obligatoria" aquí = aparece tanto en properties como en required.
 * Definir un campo en properties no lo vuelve obligatorio por sí solo.
 */

const casosSemanalesSchema = {
  $jsonSchema: {
    bsonType: "object",
    title: "casos_semanales validator",
    required: [
      "clave_municipio",
      "municipio",
      "entidad_federativa",
      "semana_epidemiologica",
      "fecha_inicio_semana",
      "casos_confirmados",
      "casos_probables",
      "poblacion",
      "geometry"
    ],
    properties: {
      clave_municipio: {
        bsonType: "string",
        pattern: "^[0-9]{5}$",
        description: "Clave INEGI de 5 dígitos. Obligatorio."
      },
      municipio: {
        bsonType: "string",
        minLength: 1,
        description: "Nombre del municipio. Obligatorio, no vacío."
      },
      entidad_federativa: {
        bsonType: "string",
        minLength: 1,
        description: "Nombre del estado. Obligatorio, no vacío."
      },
      semana_epidemiologica: {
        bsonType: "object",
        required: ["anio", "semana"],
        properties: {
          anio: {
            bsonType: "int",
            minimum: 2000,
            maximum: 2100,
            description: "Año calendario. Obligatorio."
          },
          semana: {
            bsonType: "int",
            minimum: 1,
            maximum: 53,
            description: "Semana epidemiológica (1-53). Obligatorio."
          }
        }
      },
      fecha_inicio_semana: {
        bsonType: "date",
        description: "Fecha BSON del inicio de la semana epidemiológica. Obligatorio."
      },
      casos_confirmados: {
        bsonType: "int",
        minimum: 0,
        description: "Conteo de casos confirmados. Obligatorio, no negativo."
      },
      casos_probables: {
        bsonType: "int",
        minimum: 0,
        description: "Conteo de casos probables. Obligatorio, no negativo."
      },
      defunciones: {
        bsonType: "int",
        minimum: 0,
        description: "Conteo de defunciones. Opcional, no negativo."
      },
      poblacion: {
        bsonType: "int",
        minimum: 1,
        description: "Población del municipio (denominador de incidencia). Obligatorio."
      },
      geometry: {
        bsonType: "object",
        required: ["type", "coordinates"],
        properties: {
          type: {
            enum: ["Point"],
            description: "Debe ser 'Point'. Obligatorio."
          },
          coordinates: {
            bsonType: "array",
            minItems: 2,
            maxItems: 2,
            items: { bsonType: ["double", "int"] },
            description: "[longitud, latitud]. Obligatorio, exactamente 2 elementos numéricos."
          }
        }
      },
      fuente: {
        bsonType: "string",
        description: "Procedencia del dato. Opcional."
      },
      fecha_carga: {
        bsonType: "date",
        description: "Fecha de carga del documento. Opcional."
      }
    }
  }
};

// ============================================================
// Aplicación del validador
// ============================================================

// Si la colección todavía no existe:
db.createCollection("casos_semanales", {
  validator: casosSemanalesSchema,
  validationLevel: "strict",   // aplica a inserts y updates
  validationAction: "error"    // rechaza documentos inválidos
});

// Si la colección ya existe y solo se está actualizando la regla:
// db.runCommand({
//   collMod: "casos_semanales",
//   validator: casosSemanalesSchema,
//   validationLevel: "strict",
//   validationAction: "error"
// });

// ============================================================
// Casos de prueba — 2 válidos, 4 inválidos (cada uno aísla 1 falla)
// ============================================================

// --- Válido 1 ---
const valido1 = {
  clave_municipio: "14039",
  municipio: "Guadalajara",
  entidad_federativa: "Jalisco",
  semana_epidemiologica: { anio: 2024, semana: 33 },
  fecha_inicio_semana: new Date("2024-08-11T00:00:00Z"),
  casos_confirmados: 187,
  casos_probables: 94,
  defunciones: 1,
  poblacion: 1495182,
  geometry: { type: "Point", coordinates: [-103.3496, 20.6597] },
  fuente: "SINAVE/DGE",
  fecha_carga: new Date()
};

// --- Válido 2 (sin campos opcionales, para probar que sí son opcionales) ---
const valido2 = {
  clave_municipio: "25006",
  municipio: "Culiacán",
  entidad_federativa: "Sinaloa",
  semana_epidemiologica: { anio: 2024, semana: 33 },
  fecha_inicio_semana: new Date("2024-08-11T00:00:00Z"),
  casos_confirmados: 412,
  casos_probables: 208,
  poblacion: 962871,
  geometry: { type: "Point", coordinates: [-107.3940, 24.7999] }
};

// --- Inválido 1: casos_confirmados negativo (viola minimum) ---
const invalido1_conteoNegativo = {
  ...valido1,
  casos_confirmados: -5
};

// --- Inválido 2: falta clave_municipio (viola required) ---
const invalido2_faltaClave = (() => {
  const { clave_municipio, ...resto } = valido1;
  return resto;
})();

// --- Inválido 3: geometry.type incorrecto (viola enum) ---
const invalido3_tipoGeometriaIncorrecto = {
  ...valido1,
  geometry: { type: "Polygon", coordinates: [-103.3496, 20.6597] }
};

// --- Inválido 4: coordenadas fuera de rango / mal ordenadas
//     (longitud puesta como 200, fuera de [-180,180];
//      además simula el error común de invertir lat/long)
const invalido4_coordenadasFueraDeRango = {
  ...valido1,
  geometry: { type: "Point", coordinates: [200, 20.6597] }
};

/*
 * Nota: el validador $jsonSchema NO impone el rango numérico de lon/lat
 * dentro del array (MongoDB no ofrece minimum/maximum por posición de un
 * array así de simple sin usar $expr adicional). Para exigir ese rango
 * de forma estricta hay que añadir una regla con $expr o validarlo en la
 * capa de aplicación/ETL antes de insertar. Documentar esto como
 * limitación conocida del validador es parte de la evidencia esperada
 * en la semana 2 (no atribuir al índice o al validador una corrección
 * que no garantizan).
 */
