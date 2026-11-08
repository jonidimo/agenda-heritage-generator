/**
 * Subida de imágenes, SVG y PDF a la agenda abierta: detecta el formato, pasa a JPEG (fotos) o PNG (con
 * transparencia, dibujos) lo que el navegador sepa abrir pero el PDF no (WebP, HEIC, AVIF, GIF), achica lo que
 * pasa del tope de lado, no guarda dos veces el mismo archivo, guarda los bytes en el dispositivo y agrega la
 * referencia al diseño. Lo usan el panel de imágenes, la marca de agua y el menú contextual.
 */
import { jpegOrientation, rasterInfo } from '@core/assets/image';
import { ASSET_MAX_BYTES, ASSET_MAX_SIDE_PX, fitWithin, outputFormatFor, renameForFormat, UPLOAD_JPEG_QUALITY } from '@core/assets/prepare';
import { AssetCreditZ, type Design } from '@core/design/schema';
import { assetInfoFromBytes } from '@core/resources';
import { trySha256Hex } from '@core/util/digest';
import { newId } from '@core/util/hash';
import { hasTransparentPixels } from '@core/util/pixels';
import { scaleDown } from '../../workers/resample';
import { saveAsset } from './persist';
import { resources } from './resources';
import { useStore } from './store';
import { tNow } from './tNow';

function kindOf(file: File, bytes: Uint8Array): { kind: 'raster' | 'vector' | 'pdf'; mime: string } | null {
  if (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)) return { kind: 'vector', mime: 'image/svg+xml' };
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return { kind: 'pdf', mime: 'application/pdf' };
  const r = rasterInfo(bytes);
  if (r) return { kind: 'raster', mime: r.mime };
  return null;
}

/** Lo que queda de una imagen después de prepararla: sus bytes ya listos y el nombre con la extensión que corresponde. */
interface PreparedRaster {
  bytes: Uint8Array;
  mime: 'image/png' | 'image/jpeg';
  name: string;
  /** Si se achicó: el tamaño de antes y el de ahora. */
  resized: { from: string; to: string } | null;
}

/**
 * Deja una imagen lista para guardar: la que el navegador sabe abrir pero el PDF no (WebP, HEIC, AVIF,
 * GIF) pasa a JPEG si es una foto o a PNG si tiene transparencia o es un dibujo, y una con el lado mayor
 * por encima del tope se achica. Un PNG achicado sigue siendo PNG y un JPEG, JPEG. `null` si el navegador no
 * la puede abrir.
 */
async function prepareRaster(file: File, bytes: Uint8Array, known: { mime: string } | null): Promise<PreparedRaster | null> {
  let bitmap: ImageBitmap | null = null;
  try {
    // Con la orientación EXIF aplicada: al volver a guardar, esa marca se pierde y los píxeles tienen que estar derechos.
    bitmap = await createImageBitmap(new Blob([bytes.slice()], { type: known?.mime ?? file.type }), { imageOrientation: 'from-image' });
    const fit = fitWithin(bitmap.width, bitmap.height);
    const w = fit?.w ?? bitmap.width;
    const h = fit?.h ?? bitmap.height;
    const canvas = scaleDown(bitmap, w, h);
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return null;
    const sourceMime = known?.mime ?? file.type;
    // Un JPEG no tiene transparencia: no hace falta mirar píxel por píxel.
    const alpha = sourceMime !== 'image/jpeg' && hasTransparentPixels(ctx.getImageData(0, 0, w, h).data);
    const format = outputFormatFor(sourceMime, alpha);
    const blob = await canvas.convertToBlob(format === 'png' ? { type: 'image/png' } : { type: 'image/jpeg', quality: UPLOAD_JPEG_QUALITY });
    return {
      bytes: new Uint8Array(await blob.arrayBuffer()),
      mime: format === 'png' ? 'image/png' : 'image/jpeg',
      name: renameForFormat(file.name, format),
      resized: fit ? { from: `${bitmap.width}×${bitmap.height}`, to: `${w}×${h}` } : null,
    };
  } catch {
    return null;
  } finally {
    bitmap?.close();
  }
}

/** Calcula (una vez) el hash de las imágenes de la agenda que todavía no lo tienen. */
async function hashesOf(design: Design): Promise<void> {
  for (const a of design.assets) {
    if (a.builtin || resources.assetHashes.has(a.id)) continue;
    const bytes = resources.assetBytes.get(a.id);
    const hash = bytes ? await trySha256Hex(bytes) : null;
    if (hash) resources.assetHashes.set(a.id, hash);
  }
}

export interface UploadResult {
  ids: string[];
  /** Mensajes para mostrar (formato no soportado, avisos del SVG…). */
  messages: string[];
}

/**
 * Agrega archivos como recursos de la agenda abierta. Si mientras se procesan se abre otra
 * agenda, no se le agregan a esa (los bytes quedan y se limpian si nadie los usa).
 */
/** `coalesce`: la clave de historial del cambio que va a usar la imagen (así subirla y usarla es un solo «Deshacer»). */
export function addAssetFiles(files: Iterable<File>, unsupported: (name: string) => string, coalesce?: string): Promise<UploadResult> {
  // De a una: dos subidas del mismo archivo a la vez (el panel y el menú, o soltarlo dos veces) no se pisan al buscar repetidos.
  const run = queue.then(() => addFiles(Array.from(files), unsupported, coalesce));
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

let queue: Promise<void> = Promise.resolve();

async function addFiles(files: File[], unsupported: (name: string) => string, coalesce?: string): Promise<UploadResult> {
  const out: UploadResult = { ids: [], messages: [] };
  const designId = useStore.getState().design?.id;
  for (const file of files) {
    if (file.size > ASSET_MAX_BYTES) {
      out.messages.push(tNow('assets.tooBig', { name: file.name, mb: ASSET_MAX_BYTES / 1024 / 1024 }));
      continue;
    }
    let bytes: Uint8Array = new Uint8Array(await file.arrayBuffer());
    let name = file.name;
    let k = kindOf(file, bytes);
    // Lo que el navegador abre pero el PDF no, o un PNG/JPEG de más píxeles que el tope: se prepara antes de guardarlo.
    const info0 = k?.kind === 'raster' ? rasterInfo(bytes) : null;
    // Un JPEG con orientación EXIF se vuelve a guardar derecho: esa marca la leen unos programas y otros no (el PDF sí, el dibujo de una página en el servidor no).
    const turned = k?.mime === 'image/jpeg' && jpegOrientation(bytes) !== 1;
    if (!k || turned || (info0 && fitWithin(info0.width, info0.height))) {
      const prepared = await prepareRaster(file, bytes, k);
      if (prepared) {
        bytes = prepared.bytes;
        name = prepared.name;
        k = { kind: 'raster', mime: prepared.mime };
        if (prepared.resized) out.messages.push(tNow('assets.resized', { name: prepared.name, from: prepared.resized.from, to: prepared.resized.to }));
      } else if (k && info0 && fitWithin(info0.width, info0.height)) {
        // El navegador no pudo abrirla para achicarla: se guarda como vino, y se dice.
        out.messages.push(tNow('assets.notResized', { name: file.name, max: ASSET_MAX_SIDE_PX }));
      }
    }
    if (!k) {
      out.messages.push(unsupported(file.name));
      continue;
    }
    // El mismo archivo ya está en la agenda: se usa ese, en lugar de guardarlo otra vez.
    const hash = await trySha256Hex(bytes);
    const current = useStore.getState().design;
    if (hash && current && current.id === designId) {
      await hashesOf(current);
      const twin = current.assets.find((a) => resources.assetHashes.get(a.id) === hash);
      if (twin) {
        out.ids.push(twin.id);
        out.messages.push(tNow('assets.duplicate', { name: file.name, existing: twin.name }));
        continue;
      }
    }
    const id = newId('img');
    const ref = { id, name, kind: k.kind, mime: k.mime, width: 0, height: 0, builtin: null };
    try {
      const info = await assetInfoFromBytes(ref, bytes);
      resources.putAsset(id, bytes, info);
      if (hash) resources.assetHashes.set(id, hash);
      await saveAsset(id, bytes);
      if (useStore.getState().design?.id !== designId) continue;
      useStore.getState().update((d) => void d.assets.push({ ...ref, width: info.width, height: info.height, ...(info.pages ? { pages: info.pages } : {}) }), coalesce);
      resources.bump();
      useStore.getState().bumpResources(resources.version);
      out.ids.push(id);
      if (info.vector?.warnings.length) out.messages.push(info.vector.warnings.join(' '));
    } catch (err) {
      out.messages.push(`${file.name}: ${(err as Error).message}`);
    }
  }
  return out;
}

export interface PreparedAsset {
  name: string;
  kind: 'raster' | 'vector';
  mime: string;
  bytes: Uint8Array;
  /** Autor, licencia y origen (se descarta lo que no cumpla `AssetCreditZ`). */
  credit?: unknown;
}

/**
 * Agrega a los recursos de la agenda abierta una imagen que ya viene preparada (la baja y limpia el asistente
 * en el proceso principal). Mismo camino que una subida: sin repetir lo que ya está, bytes guardados en el
 * dispositivo. No la coloca en ninguna página.
 */
export async function addPreparedAsset(a: PreparedAsset): Promise<{ id: string; duplicate: boolean; name: string; width: number; height: number }> {
  const run = queue.then(() => addPrepared(a));
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function addPrepared(a: PreparedAsset): Promise<{ id: string; duplicate: boolean; name: string; width: number; height: number }> {
  const design = useStore.getState().design;
  if (!design) throw new Error('No hay una agenda abierta.');
  const hash = await trySha256Hex(a.bytes);
  if (hash) {
    await hashesOf(design);
    const twin = design.assets.find((x) => resources.assetHashes.get(x.id) === hash);
    if (twin) {
      // Estaba sin crédito y ahora llega con uno válido: se lo queda (si no, la página de créditos la omitiría).
      const parsed = a.credit === undefined ? null : AssetCreditZ.safeParse(a.credit);
      if (!twin.credit && parsed?.success) {
        useStore.getState().update((d) => {
          const t = d.assets.find((x) => x.id === twin.id);
          if (t) t.credit = parsed.data;
        });
      }
      return { id: twin.id, duplicate: true, name: twin.name, width: twin.width, height: twin.height };
    }
  }
  const id = newId('img');
  const ref = { id, name: a.name, kind: a.kind, mime: a.mime, width: 0, height: 0, builtin: null };
  const info = await assetInfoFromBytes(ref, a.bytes);
  const credit = a.credit === undefined ? undefined : AssetCreditZ.safeParse(a.credit);
  if (credit && !credit.success) throw new Error('El crédito de la imagen no es válido (autor, licencia o dirección demasiado largos): no se importó.');
  resources.putAsset(id, a.bytes, info);
  if (hash) resources.assetHashes.set(id, hash);
  await saveAsset(id, a.bytes);
  if (useStore.getState().design?.id !== design.id) throw new Error('Se abrió otra agenda mientras se importaba.');
  const entry = { ...ref, width: info.width, height: info.height, ...(info.pages ? { pages: info.pages } : {}), ...(credit?.success ? { credit: credit.data } : {}) };
  useStore.getState().update((d) => void d.assets.push(entry));
  resources.bump();
  useStore.getState().bumpResources(resources.version);
  return { id, duplicate: false, name: a.name, width: info.width, height: info.height };
}

/** Abre el selector de archivos del sistema (sin un `<input>` en la página). */
export function pickFiles(accept: string, multiple = true): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.addEventListener('change', () => resolve(Array.from(input.files ?? [])));
    input.addEventListener('cancel', () => resolve([]));
    input.click();
  });
}

export const IMAGE_ACCEPT = 'image/*,.svg,.pdf,application/pdf';

/**
 * Elige una imagen (o un PDF, si se acepta), la agrega a los recursos de la agenda y devuelve su
 * identificador; los avisos (formato no admitido) van a la barra de avisos. Lo usan la marca de
 * agua, los elementos de imagen y los ornamentos.
 */
export async function uploadOne(accept: string, unsupported: (name: string) => string, coalesce?: string): Promise<string | null> {
  const files = await pickFiles(accept, false);
  if (files.length === 0) return null;
  const r = await addAssetFiles(files, unsupported, coalesce);
  if (r.messages.length > 0) useStore.getState().setNotice(r.messages.join(' '));
  return r.ids[0] ?? null;
}
