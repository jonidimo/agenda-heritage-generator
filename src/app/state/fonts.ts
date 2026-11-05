/**
 * Fuentes de la agenda en el editor: qué caracteres le faltan a cada cara que se usa, dónde se usa cada
 * familia, y subir o quitar fuentes propias (se guardan en este equipo y valen para todas las agendas).
 */
import type { Design } from '@core/design/schema';
import { resolveThemeFor } from '@core/design/themes';
import { holidayName } from '@core/holidays';
import { langOf, listStringKeys, resolveStrings } from '@core/i18n';
import { facesForDesign } from '@core/resources';
import { detectFaceMeta, parseFontSpec } from '@core/text/fonts';
import { openFont } from '@core/text/fontkit';
import { newId } from '@core/util/hash';
import { deleteUserFont, saveUserFont } from './persist';
import { resources } from './resources';
import { useStore } from './store';

/**
 * Los caracteres que le faltan a cada familia que la agenda usa: todos los textos (los del programa,
 * feriados, textos y métodos propios) frente a cada cara. Falta un carácter si le falta a alguna cara.
 */
export function fontCoverage(design: Design, resourcesVersion: number): Map<string, string[]> {
  // El cálculo recorre todos los textos de la agenda: se repite solo si cambió la agenda o llegaron fuentes o feriados.
  if (cached && cached.design === design && cached.version === resourcesVersion) return cached.value;
  const value = computeCoverage(design);
  cached = { design, version: resourcesVersion, value };
  return value;
}

let cached: { design: Design; version: number; value: Map<string, string[]> } | null = null;

function computeCoverage(design: Design): Map<string, string[]> {
  const strings = resolveStrings(design.locale, design.persona.labels);
  const data = resources.holidaysFor(design.holidays.country);
  // Los nombres de feriados en el idioma en que se van a imprimir.
  const hlang = design.holidays.language === 'auto' ? langOf(design.locale) : design.holidays.language;
  const holidayNames = data ? data.dict.map((_, i) => holidayName(data, i, hlang)) : [];
  const own = [
    ...design.customBlocks.map((c) => String(c.props.text ?? '')),
    ...design.customPages.flatMap((c) => [c.title, c.content.text]),
    ...design.methods.custom.flatMap((m) => [m.name, m.text, m.evidenceText]),
    ...design.holidays.added.map((h) => h.name),
    ...Object.values(design.holidays.renamed),
  ];
  const text = [...listStringKeys(strings).map((r) => r.value), design.persona.name, design.persona.title, design.persona.dedication, ...design.persona.phrases, ...design.personalDates.map((p) => p.label), ...holidayNames, ...own].join(' ');
  const cps = [...new Set(Array.from(text).map((c) => c.codePointAt(0)!))].filter((cp) => cp > 32);
  const used = new Map(
    facesForDesign(design).map((spec) => {
      const face = resources.fonts.resolveWithFallback(spec);
      return [face.key, face] as const;
    }),
  );
  const out = new Map<string, string[]>();
  for (const f of used.values()) {
    const missing = cps.filter((cp) => !f.font.hasGlyphForCodePoint(cp)).map((cp) => String.fromCodePoint(cp));
    out.set(f.family, [...new Set([...(out.get(f.family) ?? []), ...missing])]);
  }
  return out;
}

/** Dónde se usa una familia: los tipos de texto del tema que la llevan y la cantidad de elementos propios con ella. */
export interface FontUse {
  roles: string[];
  blocks: number;
}

export function fontUses(design: Design): Map<string, FontUse> {
  const out = new Map<string, FontUse>();
  const entry = (family: string): FontUse => out.get(family) ?? out.set(family, { roles: [], blocks: 0 }).get(family)!;
  for (const [role, spec] of Object.entries(resolveThemeFor(design.theme).fonts)) entry(spec.family).roles.push(role);
  for (const cb of design.customBlocks) {
    const spec = parseFontSpec(cb.props.font);
    if (spec) entry(spec.family).blocks++;
  }
  return out;
}

/** Agrega fuentes subidas por quien usa la agenda; los errores de cada archivo se devuelven (los demás se cargan igual). */
export async function addFontFiles(files: File[]): Promise<string[]> {
  const errors: string[] = [];
  for (const file of files) {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const meta = detectFaceMeta(openFont(bytes));
      const id = newId('font');
      resources.fonts.register(bytes, { ...meta, source: 'user', file: id });
      resources.userFontBytes.set(id, { bytes, spec: meta });
      await saveUserFont(id, bytes, meta);
      resources.bump();
      useStore.getState().bumpResources(resources.version);
    } catch (err) {
      errors.push(`${file.name}: ${(err as Error).message}`);
    }
  }
  return errors;
}

/** Quita una familia subida (todas sus caras) de este equipo. Las agendas que la usan pasan a la de reserva del tema. */
export async function removeUserFamily(family: string): Promise<void> {
  const files = resources.fonts.facesOf(family).flatMap((f) => (f.source === 'user' && f.file ? [f.file] : []));
  for (const file of files) {
    resources.fonts.unregisterFile(file);
    resources.userFontBytes.delete(file);
    await deleteUserFont(file);
  }
  if (files.length > 0) {
    resources.bump();
    useStore.getState().bumpResources(resources.version);
  }
}
