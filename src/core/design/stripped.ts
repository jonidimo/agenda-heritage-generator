/**
 * Claves que el validador descarta: zod ignora en silencio lo que no conoce, y en el navegador no hay
 * otro validador que lo diga (Ajv necesita evaluar código, cosa que la política de seguridad prohíbe).
 * Comparando lo que entró con lo que quedó se sabe qué claves se perdieron, para avisarle a quien
 * escribió el cambio (una persona o un modelo de lenguaje) en lugar de que desaparezcan sin más.
 */
import { escapePointerKey } from '../util/jsonPatch';

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Más que esto no ayuda a nadie: alcanza para entender qué pasó. */
const MAX_KEYS = 50;

/**
 * Punteros JSON (RFC 6901) de las claves que están en `input` y no en `parsed`. Recorre los dos a la
 * par: objetos por clave y listas por posición (solo si las dos tienen el mismo largo, porque si el
 * validador filtró elementos las posiciones ya no se corresponden). Un valor que cambió de forma (un
 * objeto inválido reemplazado por su valor por defecto) no se recorre: no se perdió una clave, se
 * corrigió el valor entero.
 */
export function strippedKeys(input: unknown, parsed: unknown, limit = MAX_KEYS): string[] {
  const out: string[] = [];
  const walk = (a: unknown, b: unknown, at: string): void => {
    if (out.length >= limit) return;
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return;
      a.forEach((item, i) => walk(item, b[i], `${at}/${i}`));
      return;
    }
    if (!isPlainObject(a) || !isPlainObject(b)) return;
    for (const key of Object.keys(a)) {
      if (out.length >= limit) return;
      const here = `${at}/${escapePointerKey(key)}`;
      // Un valor `undefined` no viaja en JSON: no es una clave que se haya perdido.
      if (!Object.hasOwn(b, key)) {
        if (a[key] !== undefined) out.push(here);
      } else walk(a[key], b[key], here);
    }
  };
  walk(input, parsed, '');
  return out;
}
