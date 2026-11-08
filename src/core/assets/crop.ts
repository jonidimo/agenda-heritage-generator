/**
 * Recorte y orientación de imágenes: funciones puras sobre píxeles RGBA (sin códecs), para que una
 * imagen apaisada de un banco de fotos pase a ser la portada vertical de un mes. Las usa la
 * importación de imágenes del servidor MCP.
 */

/** Un rectángulo en píxeles. */
export interface PixelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Un punto de foco, o una zona, con valores de 0 a 1 sobre la imagen ya derecha. */
export interface Focus {
  x: number;
  y: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * Qué parte de la imagen se conserva. Con `crop` (valores de 0 a 1), esa zona. Sin ella, con `aspect`
 * (ancho/alto que se quiere), la zona más grande de esa proporción centrada lo más cerca posible de `focus`
 * (el centro por defecto). Sin ninguna, la imagen entera.
 */
export function planCrop(src: { w: number; h: number }, opts: { aspect?: number | undefined; focus?: Focus | undefined; crop?: { x: number; y: number; w: number; h: number } | undefined }): PixelRect {
  if (opts.crop) {
    const x = clamp(opts.crop.x, 0, 1);
    const y = clamp(opts.crop.y, 0, 1);
    const w = clamp(opts.crop.w, 0, 1 - x);
    const h = clamp(opts.crop.h, 0, 1 - y);
    const px = Math.min(src.w - 1, Math.round(x * src.w));
    const py = Math.min(src.h - 1, Math.round(y * src.h));
    return { x: px, y: py, w: clamp(Math.round(w * src.w), 1, src.w - px), h: clamp(Math.round(h * src.h), 1, src.h - py) };
  }
  const aspect = opts.aspect;
  if (!aspect || !Number.isFinite(aspect) || aspect <= 0) return { x: 0, y: 0, w: src.w, h: src.h };
  const focus = { x: clamp(opts.focus?.x ?? 0.5, 0, 1), y: clamp(opts.focus?.y ?? 0.5, 0, 1) };
  if (src.w / src.h > aspect) {
    const w = Math.max(1, Math.min(src.w, Math.round(src.h * aspect)));
    return { x: Math.round(clamp(focus.x * src.w - w / 2, 0, src.w - w)), y: 0, w, h: src.h };
  }
  const h = Math.max(1, Math.min(src.h, Math.round(src.w / aspect)));
  return { x: 0, y: Math.round(clamp(focus.y * src.h - h / 2, 0, src.h - h)), w: src.w, h };
}

/** Los píxeles de una zona de una imagen RGBA. */
export function cropRgba(data: Uint8Array | Uint8ClampedArray, width: number, rect: PixelRect): Uint8Array {
  const out = new Uint8Array(rect.w * rect.h * 4);
  for (let y = 0; y < rect.h; y++) {
    const from = ((rect.y + y) * width + rect.x) * 4;
    out.set(data.subarray(from, from + rect.w * 4), y * rect.w * 4);
  }
  return out;
}

/**
 * La imagen como la muestra un lector que respeta la orientación EXIF (1 a 8): derecha, espejada, girada.
 * Con 5 a 8 el ancho y el alto se intercambian.
 */
export function orientRgba(data: Uint8Array | Uint8ClampedArray, w: number, h: number, orientation: number): { data: Uint8Array; w: number; h: number } {
  if (orientation < 2 || orientation > 8) return { data: data instanceof Uint8Array ? data : new Uint8Array(data.buffer, data.byteOffset, data.length), w, h };
  const sideways = orientation >= 5;
  const W = sideways ? h : w;
  const H = sideways ? w : h;
  const out = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let sx: number;
      let sy: number;
      switch (orientation) {
        case 2: sx = w - 1 - x; sy = y; break;
        case 3: sx = w - 1 - x; sy = h - 1 - y; break;
        case 4: sx = x; sy = h - 1 - y; break;
        case 5: sx = y; sy = x; break;
        case 6: sx = y; sy = h - 1 - x; break;
        case 7: sx = w - 1 - y; sy = h - 1 - x; break;
        default: sx = w - 1 - y; sy = x; break;
      }
      const from = (sy * w + sx) * 4;
      const to = (y * W + x) * 4;
      out[to] = data[from]!;
      out[to + 1] = data[from + 1]!;
      out[to + 2] = data[from + 2]!;
      out[to + 3] = data[from + 3]!;
    }
  }
  return { data: out, w: W, h: H };
}

/**
 * A qué tamaño achicar la zona conservada para imprimirla en `sizeMm` con `dpi`: nunca se agranda. Sin
 * medidas, solo se acota el lado mayor a `maxSide`. Devuelve el tamaño final en píxeles.
 */
export function outputSize(kept: { w: number; h: number }, sizeMm: { w: number; h: number } | null, dpi: number, maxSide: number): { w: number; h: number } {
  let scale = 1;
  if (sizeMm && sizeMm.w > 0 && sizeMm.h > 0) {
    // La escala más chica que todavía cubre las dos medidas a los ppp pedidos.
    scale = Math.min(1, Math.max(((sizeMm.w / 25.4) * dpi) / kept.w, ((sizeMm.h / 25.4) * dpi) / kept.h));
  }
  scale = Math.min(scale, maxSide / Math.max(kept.w, kept.h));
  if (scale >= 1) return { w: kept.w, h: kept.h };
  return { w: Math.max(1, Math.round(kept.w * scale)), h: Math.max(1, Math.round(kept.h * scale)) };
}
