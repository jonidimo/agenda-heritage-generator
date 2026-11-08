/**
 * Recorte de una fuente a las letras que se usan, con HarfBuzz compilado a WebAssembly (el mismo módulo
 * de `harfbuzzjs` que usa `subset-font`): se conservan el kerning, las ligaduras y las cifras tabulares
 * de las letras que quedan, y la licencia y el copyright de la fuente. El módulo lo aporta quien lo
 * usa, como con resvg (del disco al desarrollar, incrustado en el paquete de la aplicación).
 */

/** De dónde salen los bytes del `.wasm` de recorte. */
export type SubsetWasmSource = () => Promise<Uint8Array>;

/** Recorta una fuente (TrueType u OpenType) a estos caracteres; devuelve la nueva, o `null` si no es de ese formato. */
export type FontSubsetter = (font: Uint8Array, text: string) => Promise<Uint8Array | null>;

/**
 * Lo que alcanza para escribir en las lenguas de la aplicación: latín básico y suplemento, latín extendido A,
 * puntuación general, comillas, monedas, flechas y símbolos de uso común.
 */
export const LATIN_SUBSET: string = (() => {
  const ranges: Array<[number, number]> = [
    [0x20, 0x7e], [0xa0, 0xff], [0x100, 0x17f], [0x192, 0x192], [0x2c6, 0x2c7], [0x2d8, 0x2dd], [0x2013, 0x2014], [0x2018, 0x201e], [0x2020, 0x2022],
    [0x2026, 0x2026], [0x2030, 0x2030], [0x2039, 0x203a], [0x20a0, 0x20bf], [0x2116, 0x2116], [0x2122, 0x2122], [0x2190, 0x2193], [0x2212, 0x2212],
    [0x2215, 0x2215], [0x2260, 0x2260], [0x2264, 0x2265], [0x25cf, 0x25cf], [0x2605, 0x2606], [0x2713, 0x2714], [0xfb01, 0xfb02],
  ];
  return ranges.map(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => String.fromCodePoint(a + i)).join('')).join('');
})();

const HB_MEMORY_MODE_WRITABLE = 2;
const HB_SUBSET_SETS_NAME_ID = 4;
const HB_SUBSET_SETS_LAYOUT_FEATURE_TAG = 6;
/** Los textos de la tabla `name` que se conservan: derechos de autor, licencia, diseñador, fabricante… */
const NAME_IDS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 18, 19];

/** ¿Empieza como una fuente TrueType u OpenType sin comprimir? (WOFF y WOFF2 no se recortan.) */
export function isSfnt(b: Uint8Array): boolean {
  const tag = String.fromCharCode(b[0] ?? 0, b[1] ?? 0, b[2] ?? 0, b[3] ?? 0);
  return (b[0] === 0 && b[1] === 1 && b[2] === 0 && b[3] === 0) || tag === 'OTTO' || tag === 'true';
}

/** Lo que se usa de WebAssembly (el entorno de Node no trae esos tipos). */
interface WasmApi {
  instantiate(bytes: Uint8Array, imports: object): Promise<{ instance: { exports: unknown } }>;
}

interface HbExports {
  memory: { buffer: ArrayBuffer };
  malloc(n: number): number;
  free(p: number): void;
  hb_blob_create(data: number, length: number, mode: number, userData: number, destroy: number): number;
  hb_blob_destroy(blob: number): void;
  hb_blob_get_data(blob: number, length: number): number;
  hb_blob_get_length(blob: number): number;
  hb_face_create(blob: number, index: number): number;
  hb_face_destroy(face: number): void;
  hb_face_reference_blob(face: number): number;
  hb_set_add(set: number, value: number): void;
  hb_set_clear(set: number): void;
  hb_set_invert(set: number): void;
  hb_subset_input_create_or_fail(): number;
  hb_subset_input_destroy(input: number): void;
  hb_subset_input_set(input: number, which: number): number;
  hb_subset_input_unicode_set(input: number): number;
  hb_subset_or_fail(face: number, input: number): number;
}

export function createSubsetter(loadWasm: SubsetWasmSource): FontSubsetter {
  let ready: Promise<HbExports> | null = null;
  const load = (): Promise<HbExports> => {
    ready ??= loadWasm()
      .then(async (bytes) => {
        const { instance } = await (globalThis as unknown as { WebAssembly: WasmApi }).WebAssembly.instantiate(bytes, {});
        const exports = instance.exports as unknown as HbExports & { _initialize(): void };
        exports._initialize();
        return exports;
      })
      .catch((err: unknown) => {
        ready = null;
        throw err;
      });
    return ready;
  };

  return async (font, text) => {
    if (!isSfnt(font)) return null;
    const hb = await load();
    // La memoria de WebAssembly puede crecer y soltar las vistas anteriores: se toma una nueva cada vez.
    const heap = (): Uint8Array => new Uint8Array(hb.memory.buffer);
    const input = hb.hb_subset_input_create_or_fail();
    if (input === 0) throw new Error('No se pudo preparar el recorte de la fuente.');
    const buffer = hb.malloc(font.byteLength);
    heap().set(font, buffer);
    const blob = hb.hb_blob_create(buffer, font.byteLength, HB_MEMORY_MODE_WRITABLE, 0, 0);
    const face = hb.hb_face_create(blob, 0);
    hb.hb_blob_destroy(blob);
    let subset = 0;
    let result = 0;
    try {
      // Todas las funciones de composición (kerning, ligaduras, cifras tabulares…) de las letras que quedan.
      const features = hb.hb_subset_input_set(input, HB_SUBSET_SETS_LAYOUT_FEATURE_TAG);
      hb.hb_set_clear(features);
      hb.hb_set_invert(features);
      const names = hb.hb_subset_input_set(input, HB_SUBSET_SETS_NAME_ID);
      for (const id of NAME_IDS) hb.hb_set_add(names, id);
      const unicodes = hb.hb_subset_input_unicode_set(input);
      for (const c of text) hb.hb_set_add(unicodes, c.codePointAt(0)!);
      subset = hb.hb_subset_or_fail(face, input);
      if (subset === 0) throw new Error('La fuente no se pudo recortar (¿está dañada?).');
      result = hb.hb_face_reference_blob(subset);
      const length = hb.hb_blob_get_length(result);
      if (length === 0) throw new Error('El recorte de la fuente quedó vacío.');
      const offset = hb.hb_blob_get_data(result, 0);
      return heap().slice(offset, offset + length);
    } finally {
      hb.hb_subset_input_destroy(input);
      if (result) hb.hb_blob_destroy(result);
      if (subset) hb.hb_face_destroy(subset);
      hb.hb_face_destroy(face);
      hb.free(buffer);
    }
  };
}
