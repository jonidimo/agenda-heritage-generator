/**
 * Recursos del navegador: fuentes (integradas y subidas), feriados y recursos
 * gráficos. Se cargan bajo demanda y quedan en caché; cada cambio incrementa
 * `version` para que el documento se reconstruya.
 */
import type { Design } from '@core/design/schema';
import type { HolidayCountryData, HolidayIndex } from '@core/holidays';
import type { AssetInfo } from '@core/layout/context';
import { assetInfoFromBytes, facesForDesign, fromBase64, loadBuiltinFonts, loadFontManifest, loadHolidayIndex, type FontManifest, type ResourceIO } from '@core/resources';
import { FontRegistry, type FontSpec } from '@core/text/fonts';
import { listUserAssets, listUserFonts } from './persist';

const BASE = import.meta.env.BASE_URL ?? './';

export const io: ResourceIO = {
  async read(path: string): Promise<Uint8Array> {
    const res = await fetch(`${BASE}${path}`);
    if (!res.ok) throw new Error(`No se pudo cargar ${path} (${res.status})`);
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
  /** Fuentes subidas por el usuario: id → bytes (para el Worker de PDF). */
  readonly userFontBytes = new Map<string, { bytes: Uint8Array; spec: FontSpec }>();
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

  async init(): Promise<void> {
    this.manifest = await loadFontManifest(io);
    this.holidayIndex = await loadHolidayIndex(io);
    for (const f of await listUserFonts()) {
      try {
        const face = this.fonts.register(f.bytes, { ...f.spec, source: 'user', file: f.id });
        this.userFontBytes.set(f.id, { bytes: f.bytes, spec: { family: face.family, weight: face.weight, style: face.style } });
      } catch (err) {
        this.errors.push(`Fuente «${f.id}»: ${(err as Error).message}`);
      }
    }
    for (const a of await listUserAssets()) this.assetBytes.set(a.id, a.bytes);
    this.bump();
  }

  /** Carga lo que necesita un diseño (caras del tema, datos del país, recursos). */
  async ensureFor(design: Design): Promise<void> {
    let changed = false;
    if (this.manifest) {
      const before = this.fonts.list().length;
      await loadBuiltinFonts(io, this.fonts, this.manifest, facesForDesign(design));
      if (this.fonts.list().length !== before) changed = true;
    }
    const country = design.holidays.country;
    if (country && !this.holidayData.has(country)) {
      try {
        const res = await fetch(`${BASE}holidays/${country}.json`);
        this.holidayData.set(country, res.ok ? ((await res.json()) as HolidayCountryData) : null);
      } catch {
        this.holidayData.set(country, null);
      }
      changed = true;
    }
    for (const ref of design.assets) {
      if (this.assetInfos.has(ref.id)) continue;
      try {
        let bytes = this.assetBytes.get(ref.id);
        if (!bytes && ref.builtin) bytes = await io.read(ref.builtin);
        if (!bytes && ref.data) {
          bytes = fromBase64(ref.data);
        }
        if (!bytes) continue;
        this.assetBytes.set(ref.id, bytes);
        this.assetInfos.set(ref.id, await assetInfoFromBytes(ref, bytes));
        changed = true;
      } catch (err) {
        this.errors.push(`Recurso «${ref.name}»: ${(err as Error).message}`);
      }
    }
    if (changed) this.bump();
  }

  /** Carga todas las caras de una familia integrada (para el selector de pesos). */
  async ensureFamily(family: string): Promise<void> {
    if (!this.manifest) return;
    const fam = this.manifest.families.find((f) => f.family === family);
    if (!fam) return;
    const before = this.fonts.list().length;
    await loadBuiltinFonts(io, this.fonts, this.manifest, fam.faces.map((f) => ({ family, weight: f.weight, style: f.style })));
    if (this.fonts.list().length !== before) this.bump();
  }

  holidaysFor(country: string | null): HolidayCountryData | null {
    return country ? (this.holidayData.get(country) ?? null) : null;
  }
}

export const resources = new Resources();
