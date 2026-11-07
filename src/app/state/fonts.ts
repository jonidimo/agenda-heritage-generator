/**
 * Fuentes de la agenda en el editor: qué caracteres le faltan a cada cara que se usa, dónde se usa cada
 * familia, y subir o quitar fuentes propias (se guardan en este equipo y valen para todas las agendas).
 */
import type { Design } from '@core/design/schema';
import { resolveThemeFor } from '@core/design/themes';
import { holidayName } from '@core/holidays';
import { langOf, listStringKeys, resolveStrings } from '@core/i18n';
import { facesForDesign } from '@core/resources';
import { detectFaceMeta, parseFontSpec, type FontSpec } from '@core/text/fonts';
import { PROSE_ROLES, punctuationOf } from '@core/text/punctuation';
import { hasGlyph } from '@core/text/shape';
import { openFont } from '@core/text/fontkit';
import { newId } from '@core/util/hash';
import { deleteUserFont, saveUserFont } from './persist';
import { resources } from './resources';
import { useStore } from './store';

/** Lo que una familia no tiene de los textos de la agenda. */
export interface FamilyCoverage {
  /** Los que no tiene ninguna fuente cargada: salen como un cuadrado vacío y avisan. */
  missing: string[];
  /** Los que no tiene pero se toman de otra fuente (las de reserva del tema primero), por fuente. */
  borrowed: Array<{ from: string; chars: string[] }>;
}

/**
 * Los caracteres que le faltan a cada familia que la agenda usa: todos los textos (los del programa,
 * feriados, textos y métodos propios) frente a cada cara. Falta un carácter si le falta a alguna cara;
 * si otra fuente lo tiene, se toma de ella (como en un navegador) y no es un problema.
 */
export function fontCoverage(design: Design, resourcesVersion: number): Map<string, FamilyCoverage> {
  // El cálculo recorre todos los textos de la agenda: se repite solo si cambió la agenda o llegaron fuentes o feriados.
  if (cached && cached.design === design && cached.version === resourcesVersion) return cached.value;
  const value = computeCoverage(design);
  cached = { design, version: resourcesVersion, value };
  return value;
}

let cached: { design: Design; version: number; value: Map<string, FamilyCoverage> } | null = null;

function computeCoverage(design: Design): Map<string, FamilyCoverage> {
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
  const fallbacks = resolveThemeFor(design.theme).fallbacks;
  const used = new Map(
    // Las que la agenda usa (no las de reserva: esas solo prestan caracteres).
    facesForDesign(design, { fallbacks: false }).map((spec) => {
      const face = resources.fonts.resolveWithFallback(spec, fallbacks);
      return [face.key, face] as const;
    }),
  );
  const missing = new Map<string, Set<string>>();
  const borrowed = new Map<string, Map<string, Set<string>>>();
  for (const f of used.values()) {
    const gaps = missing.get(f.family) ?? missing.set(f.family, new Set()).get(f.family)!;
    const lent = borrowed.get(f.family) ?? borrowed.set(f.family, new Map()).get(f.family)!;
    const reserve = resources.fonts.glyphFallback(f, fallbacks).faces;
    for (const cp of cps) {
      if (hasGlyph(f, cp)) continue;
      const ch = String.fromCodePoint(cp);
      const from = reserve.find((r) => hasGlyph(r, cp));
      if (from) (lent.get(from.family) ?? lent.set(from.family, new Set()).get(from.family)!).add(ch);
      else gaps.add(ch);
    }
  }
  const out = new Map<string, FamilyCoverage>();
  for (const [family, chars] of missing) {
    const lent = borrowed.get(family) ?? new Map<string, Set<string>>();
    // Lo que una cara de la familia no tiene y otra sí presta no figura como faltante en las dos listas.
    const lentChars = new Set([...lent.values()].flatMap((set) => [...set]));
    out.set(family, { missing: [...chars].filter((c) => !lentChars.has(c)), borrowed: [...lent].map(([from, set]) => ({ from, chars: [...set] })) });
  }
  return out;
}

export function punctuationGap(role: string, spec: FontSpec, fallbacks: readonly string[]): { chars: string[]; from: string | null } | null {
  if (!PROSE_ROLES.has(role)) return null;
  const face = resources.fonts.resolve(spec);
  if (!face) return null;
  const { missing, from } = punctuationOf(resources.fonts, face, fallbacks);
  return missing.length === 0 ? null : { chars: missing, from };
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

/**
 * Una fuente propia que llega con sus bytes (un archivo subido, el servidor MCP): se registra, se guarda
 * en este equipo y queda disponible para todas las agendas. Familia, peso y estilo salen de la fuente,
 * salvo los que se indiquen. Con un `id` que ya existía, la reemplaza.
 */
export async function addUserFont(bytes: Uint8Array, meta: Partial<FontSpec> = {}, id: string = newId('font')): Promise<FontSpec & { id: string; glyphs: number }> {
  const font = openFont(bytes);
  const detected = detectFaceMeta(font);
  const spec: FontSpec = { family: meta.family ?? detected.family, weight: meta.weight ?? detected.weight, style: meta.style ?? detected.style };
  if (resources.userFontBytes.has(id)) resources.fonts.unregisterFile(id);
  // La misma familia, peso y estilo con otra id (subida otra vez): la nueva la reemplaza; si no, la
  // vieja quedaría guardada sin usarse y viajaría igual en los archivos.
  for (const [other, f] of resources.userFontBytes) {
    if (other === id || f.spec.family !== spec.family || f.spec.weight !== spec.weight || f.spec.style !== spec.style) continue;
    resources.fonts.unregisterFile(other);
    resources.userFontBytes.delete(other);
    await deleteUserFont(other);
  }
  resources.fonts.register(bytes, { ...spec, source: 'user', file: id });
  resources.userFontBytes.set(id, { bytes, spec });
  await saveUserFont(id, bytes, spec);
  resources.bump();
  useStore.getState().bumpResources(resources.version);
  return { id, ...spec, glyphs: font.numGlyphs };
}

/** Agrega fuentes subidas por quien usa la agenda; los errores de cada archivo se devuelven (los demás se cargan igual). */
export async function addFontFiles(files: File[]): Promise<string[]> {
  const errors: string[] = [];
  for (const file of files) {
    try {
      await addUserFont(new Uint8Array(await file.arrayBuffer()));
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
