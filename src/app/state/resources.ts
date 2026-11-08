/**
 * Recursos del navegador: fuentes (integradas y subidas), feriados y recursos
 * gráficos. Se cargan bajo demanda y quedan en caché; cada cambio incrementa
 * `version` para que el documento se reconstruya.
 */
import { effectiveAssets } from '@core/assets/icons';
import type { Design } from '@core/design/schema';
import type { HolidayCountryData, HolidayIndex } from '@core/holidays';
import type { AssetInfo } from '@core/layout/context';
import { assetInfoFromBytes, facesForDesign, fromBase64, loadBuiltinFonts, loadFontManifest, loadHolidayIndex, type FontManifest, type ResourceIO } from '@core/resources';
import { FontRegistry, type FontSpec } from '@core/text/fonts';
import { listUserAssets, listUserFonts } from './persist';

const BASE = import.meta.env.BASE_URL ?? './';

/**
 * Lo que se descargó antes de que el service worker controlara la página no quedó en su
 * caché: se guarda a mano para que la próxima apertura sin conexión lo encuentre.
 */
function keepOffline(cacheName: string, path: string): void {
  if (typeof caches === 'undefined' || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  void navigator.serviceWorker.ready
    .then(async () => {
      const url = new URL(`${BASE}${path}`, location.href).href;
      const cache = await caches.open(cacheName);
      if (!(await cache.match(url))) await cache.add(url);
    })
    .catch(() => undefined);
}

export const io: ResourceIO = {
  async read(path: string): Promise<Uint8Array> {
    const res = await fetch(`${BASE}${path}`);
    if (!res.ok) throw new Error(`No se pudo cargar ${path} (${res.status})`);
    // Un servidor que contesta con su página de inicio a lo que no existe (la versión de escritorio): no es el archivo.
    if ((res.headers.get('content-type') ?? '').includes('text/html') && !path.endsWith('.html')) throw new Error(`No existe el recurso integrado «${path}»`);
    return new Uint8Array(await res.arrayBuffer());
  },
};

export class Resources {
  readonly fonts = new FontRegistry();
  manifest: FontManifest | null = null;
  holidayIndex: HolidayIndex | null = null;
  readonly holidayData = new Map<string, HolidayCountryData | null>();
  readonly assetBytes = new Map<string, Uint8Array>();
  readonly assetInfos = new Map<string, AssetInfo>();
  /** SHA-256 de los bytes de cada imagen, para no guardar dos veces el mismo archivo (se calcula al subir). */
  readonly assetHashes = new Map<string, string>();

  /**
   * Guarda los bytes de una imagen. Si esa id ya tenía otros (dos agendas pueden llamar «logo» a imágenes
   * distintas), lo que se sabía de los de antes —sus medidas y su hash— ya no vale y se descarta.
   */
  putAsset(id: string, bytes: Uint8Array, info?: AssetInfo): void {
    this.assetBytes.set(id, bytes);
    this.assetHashes.delete(id);
    if (info) this.assetInfos.set(id, info);
    else this.assetInfos.delete(id);
  }
  /** Fuentes subidas por el usuario: id → bytes (para el Worker de PDF). */
  readonly userFontBytes = new Map<string, { bytes: Uint8Array; spec: FontSpec }>();
  /** Problemas al cargar (se muestran en la interfaz). */
  readonly errors: string[] = [];
  version = 0;
  private listeners = new Set<() => void>();

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  bump(): void {
    this.version++;
    for (const l of this.listeners) l();
  }

  private addError(msg: string): void {
    if (!this.errors.includes(msg)) this.errors.push(msg);
  }

  async init(): Promise<void> {
    this.manifest = await loadFontManifest(io);
    this.holidayIndex = await loadHolidayIndex(io);
    keepOffline('agenda-holidays', 'holidays/index.json');
    for (const f of await listUserFonts()) {
      try {
        const face = this.fonts.register(f.bytes, { ...f.spec, source: 'user', file: f.id });
        this.userFontBytes.set(f.id, { bytes: f.bytes, spec: { family: face.family, weight: face.weight, style: face.style } });
      } catch (err) {
        this.addError(`Fuente «${f.id}»: ${(err as Error).message}`);
      }
    }
    for (const a of await listUserAssets()) this.assetBytes.set(a.id, a.bytes);
    this.bump();
  }

  /** De qué partes del diseño salió lo último que se aseguró: si no cambiaron, no hay nada nuevo que cargar. */
  private ensured: { theme: Design['theme']; customBlocks: Design['customBlocks']; country: string | null; assets: Design['assets']; icons: string } | null = null;

  /** Carga lo que necesita un diseño (caras del tema, datos del país, recursos). */
  async ensureFor(design: Design): Promise<void> {
    // Lo que se necesita depende solo del tema, de los elementos propios (fuentes), del país y de los recursos.
    // Un cambio de color, de nombre o de un ajuste de página no pide nada nuevo.
    const prev = this.ensured;
    const country = design.holidays.country;
    // Los íconos por nombre (`icon:<id>`) pueden aparecer en cualquier parte: se cuentan aparte.
    const icons = effectiveAssets(design)
      .map((a) => a.id)
      .join('|');
    if (prev && prev.theme === design.theme && prev.customBlocks === design.customBlocks && prev.country === country && prev.assets === design.assets && prev.icons === icons) return;
    let changed = false;
    // Si algo falla (una descarga, un archivo), no se da por asegurado: el próximo cambio lo reintenta.
    let failed = false;
    if (this.manifest) {
      const before = this.fonts.list().length;
      for (const e of await loadBuiltinFonts(io, this.fonts, this.manifest, facesForDesign(design))) {
        this.addError(`Fuente ${e}`);
        failed = true;
      }
      if (this.fonts.list().length !== before) changed = true;
    }
    if (country && !this.holidayData.has(country)) {
      const path = `holidays/${country}.json`;
      try {
        const res = await fetch(`${BASE}${path}`);
        // Un 404 es definitivo (país sin datos); un error de red se reintenta en la próxima carga.
        if (res.ok) {
          this.holidayData.set(country, (await res.json()) as HolidayCountryData);
          keepOffline('agenda-holidays', path);
        } else if (res.status === 404) this.holidayData.set(country, null);
        else {
          this.addError(`Feriados ${country}: HTTP ${res.status}`);
          failed = true;
        }
      } catch (err) {
        this.addError(`Feriados ${country}: ${(err as Error).message}`);
        failed = true;
      }
      changed = true;
    }
    for (const ref of effectiveAssets(design)) {
      if (this.assetInfos.has(ref.id)) continue;
      try {
        let bytes = this.assetBytes.get(ref.id);
        if (!bytes && ref.builtin) bytes = await io.read(ref.builtin);
        if (!bytes && ref.data) {
          bytes = fromBase64(ref.data);
        }
        if (!bytes) continue;
        // Primero se decodifica: bytes que no son una imagen no quedan guardados.
        const info = await assetInfoFromBytes(ref, bytes);
        this.assetBytes.set(ref.id, bytes);
        this.assetInfos.set(ref.id, info);
        changed = true;
      } catch (err) {
        this.addError(`Recurso «${ref.name}»: ${(err as Error).message}`);
        failed = true;
      }
    }
    // Sin lista de fuentes todavía (el programa está arrancando) no se cargó nada: no cuenta.
    if (!failed && this.manifest) this.ensured = { theme: design.theme, customBlocks: design.customBlocks, country, assets: design.assets, icons };
    if (changed) this.bump();
  }

  /** Carga todas las caras de una familia integrada (para el selector de pesos). */
  async ensureFamily(family: string): Promise<void> {
    if (!this.manifest) return;
    const fam = this.manifest.families.find((f) => f.family === family);
    if (!fam) return;
    const before = this.fonts.list().length;
    for (const e of await loadBuiltinFonts(io, this.fonts, this.manifest, fam.faces.map((f) => ({ family, weight: f.weight, style: f.style })))) this.addError(`Fuente ${e}`);
    if (this.fonts.list().length !== before) this.bump();
  }

  holidaysFor(country: string | null): HolidayCountryData | null {
    return country ? (this.holidayData.get(country) ?? null) : null;
  }
}

export const resources = new Resources();
