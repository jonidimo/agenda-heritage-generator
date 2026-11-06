/**
 * Una página como imagen PNG para el asistente (cuando puede mirar las páginas): el mismo dibujante de
 * las miniaturas, a un ancho fijo y sobre fondo blanco. Si la página tiene imágenes que todavía se están
 * cargando, se espera un momento a que lleguen y se vuelve a dibujar.
 */
import type { AiImagePart } from '@core/ai/messages';
import type { AgendaDocument } from '@core/document';
import { pagePrims } from '@core/document/layout';
import type { Prim } from '@core/layout/prims';
import { toBase64 } from '@core/resources';
import { paintPrims } from '../../canvas/paint';

/** Cuánto se espera a las imágenes de la página antes de mandarla igual. */
const ASSET_WAIT_MS = 1_500;

export async function renderPagePng(doc: AgendaDocument, index: number, width: number): Promise<AiImagePart> {
  const model = doc.page(index);
  const height = Math.round((width * model.h) / model.w);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('El navegador no puede dibujar la página.');
  const prims = pagePrims(model);
  const paint = (onAsync: () => void): void => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.scale(width / model.w, width / model.w);
    paintPrims(ctx, prims, doc.ctx.fonts, onAsync);
  };
  let loaded: () => void = () => undefined;
  const arrived = new Promise<void>((resolve) => (loaded = resolve));
  paint(() => loaded());
  // Con imágenes, se espera a que llegue alguna (o se vence la espera) y se dibuja de nuevo con lo que haya.
  if (hasImage(prims)) {
    await Promise.race([arrived, new Promise<void>((resolve) => setTimeout(resolve, ASSET_WAIT_MS))]);
    paint(() => undefined);
  }
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('No se pudo convertir la página en imagen.');
  return { type: 'image', mime: 'image/png', data: toBase64(new Uint8Array(await blob.arrayBuffer())) };
}

const hasImage = (prims: readonly Prim[]): boolean => prims.some((p) => p.t === 'image' || (p.t === 'group' && hasImage(p.children)));
