/**
 * Migraciones del formato `.agenda.json`. Mientras los cambios solo agregan campos con un valor por
 * defecto que reproduce lo anterior, el formato no cambia de versión (un archivo viejo se completa
 * solo al validarlo). Cuando un cambio no pueda ser así (un campo que cambia de significado o de
 * forma), se sube `SCHEMA_VERSION` y se agrega acá el paso que lleva un archivo de la versión anterior
 * a la nueva: así un archivo de cualquier versión anterior se sigue abriendo igual.
 *
 * Un archivo de una versión del formato más nueva que la de este programa no se adivina: se rechaza
 * con un mensaje claro (abrirlo descartaría lo que no se entiende y lo perdería al guardar).
 */
/** Versión actual del formato (el campo `schemaVersion` de cada archivo). */
export const SCHEMA_VERSION = 1;

export interface Migration {
  /** Versión del archivo que este paso lee. El resultado es de la versión `from + 1`. */
  from: number;
  /** Qué cambia, para quien lee el código (y para la prueba que exige que esté). */
  describe: string;
  up(raw: Record<string, unknown>): Record<string, unknown>;
}

/** Los pasos, en orden. Vacía mientras el formato siga en la versión 1. */
export const MIGRATIONS: readonly Migration[] = [];

/** El archivo es de una versión del formato que este programa no conoce. */
export class FormatVersionError extends Error {
  constructor(
    readonly found: number,
    readonly supported: number,
  ) {
    super(
      found > supported
        ? `Este archivo usa la versión ${found} del formato de agenda y este programa entiende hasta la ${supported}: actualizá la aplicación para abrirlo.`
        : `Este archivo dice usar la versión ${found} del formato de agenda, que no existe.`,
    );
    this.name = 'FormatVersionError';
  }
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Lleva los datos leídos de un archivo a la versión actual del formato, antes de validarlos. Lo que no
 * es un objeto se devuelve igual (el validador dirá qué tiene de malo). Sin `schemaVersion`, el archivo
 * es de la versión 1 (la única que existía cuando el campo era optativo). Pura: no cambia `raw`.
 */
export function migrateDesignInput(raw: unknown, migrations: readonly Migration[] = MIGRATIONS, current: number = SCHEMA_VERSION): unknown {
  if (!isPlainObject(raw)) return raw;
  const declared = raw.schemaVersion;
  if (declared === undefined) return raw;
  if (typeof declared !== 'number' || !Number.isInteger(declared) || declared < 1) throw new FormatVersionError(typeof declared === 'number' ? declared : Number.NaN, current);
  if (declared > current) throw new FormatVersionError(declared, current);
  let out: Record<string, unknown> = raw;
  for (let v = declared; v < current; v++) {
    const step = migrations.find((m) => m.from === v);
    if (!step) throw new Error(`Falta la migración del formato de agenda de la versión ${v} a la ${v + 1}.`);
    out = { ...step.up(structuredClone(out)), schemaVersion: v + 1 };
  }
  return out;
}
