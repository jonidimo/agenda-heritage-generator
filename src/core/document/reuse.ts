/**
 * Qué se puede reutilizar de un documento anterior cuando el diseño cambia un poco (un color, un
 * deslizador, un elemento movido). Los diseños del editor son inmutables (immer): lo que no se
 * tocó es el mismo objeto, así que basta comparar por identidad.
 *
 * Hay dos niveles, y los dos «fallan hacia lo seguro»: ante la duda se vuelve a calcular.
 *  - El plan de páginas solo lee unas pocas partes del diseño (lista explícita abajo).
 *  - La maquetación de una página lee casi todo el diseño; por eso aquí la lista es la inversa:
 *    únicamente las claves que se sabe que no la afectan (metadatos) o que se miden por página
 *    (`PageInputs` en `layout.ts`) pueden cambiar; cualquier otra clave, incluso una que se agregue
 *    mañana, tiene que ser idéntica.
 * Las pruebas (`tests/document-reuse.test.ts`) arman el documento con y sin reutilización tras una
 * batería de cambios y exigen el mismo resultado.
 */
import type { Design } from '../design/schema';

/** Partes del diseño que lee la planificación (`plan.ts` y el `plan()` de cada sección). */
function planInputs(d: Design): readonly unknown[] {
  return [d.sections, d.customPages, d.binding, d.calendar, d.methods, d.pageTemplates, d.theme.comfort, d.persona.dedication, d.locale];
}

/** ¿El plan del documento anterior sigue valiendo? (El calendario y los textos se comparan aparte, por identidad.) */
export function samePlanInputs(a: Design, b: Design): boolean {
  const x = planInputs(a);
  const y = planInputs(b);
  return x.every((v, i) => v === y[i]);
}

/** Datos de la agenda que no cambian ninguna página (se actualizan al guardar). */
const METADATA = ['id', 'name', 'createdAt', 'updatedAt', 'schemaVersion'] as const satisfies ReadonlyArray<keyof Design>;

/** Lo que se mide por página: ver `PageInputs`. Los estilos de página están dentro de `pageStyles`. */
const PAGE_SCOPED = ['customBlocks', 'watermarks', 'overrides', 'pageStyles'] as const satisfies ReadonlyArray<keyof Design>;

/** Partes del diseño que solo cambian la tapa (se dibuja aparte, no es una página del libro). */
const COVER_ONLY = ['cover'] as const satisfies ReadonlyArray<keyof Design>;

/**
 * Los enlaces del PDF se resuelven al dibujar, no al maquetar: solo `links.pageNumber` entra en la
 * maquetación (como entrada de página). El resto de `links` (qué familias de enlaces, los
 * elegidos a mano) no cambia el modelo de página.
 */
const SPECIAL = ['theme', 'links'] as const satisfies ReadonlyArray<keyof Design>;

const IGNORED: ReadonlySet<string> = new Set<string>([...METADATA, ...PAGE_SCOPED, ...COVER_ONLY, ...SPECIAL]);

/**
 * ¿Las páginas maquetadas con el diseño `a` valen para el diseño `b`? Todas las claves salvo las
 * de arriba tienen que ser idénticas. El tema se compara aparte (por el tema ya resuelto del
 * contexto) y los datos por página, con `samePageInputs`.
 */
export function samePageDesign(a: Design, b: Design): boolean {
  for (const key of Object.keys(b) as Array<keyof Design>) {
    if (!IGNORED.has(key) && a[key] !== b[key]) return false;
  }
  return Object.keys(a).every((key) => key in b);
}
