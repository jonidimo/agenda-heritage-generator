/**
 * Dibujo de PNG a partir del SVG de una página, con resvg compilado a WebAssembly: el mismo
 * paquete sirve en cualquier sistema (no hay un binario nativo por plataforma que empaquetar).
 * Las páginas se dibujan con contornos de glifos, así que resvg no necesita fuentes.
 */
import { initWasm, Resvg } from '@resvg/resvg-wasm';

/** Quien lo usa aporta de dónde salen los bytes del `.wasm` (del disco al desarrollar, incrustados en el paquete). */
export type WasmSource = () => Promise<Uint8Array>;

/** SVG → PNG, con el ancho pedido en píxeles. */
export type Rasterizer = (svg: string, width: number) => Promise<Uint8Array>;

export function createRasterizer(loadWasm: WasmSource): Rasterizer {
  let ready: Promise<void> | null = null;
  return async (svg, width) => {
    // El WASM se prepara una sola vez, al primer uso; si falla, el siguiente pedido lo reintenta.
    ready ??= loadWasm()
      .then((bytes) => initWasm(bytes))
      .catch((err: unknown) => {
        ready = null;
        throw err;
      });
    await ready;
    const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: width } });
    const image = resvg.render();
    try {
      return image.asPng();
    } finally {
      // Objetos de WebAssembly: la memoria no la recoge el recolector de basura de JavaScript.
      image.free();
      resvg.free();
    }
  };
}
