/**
 * Feriados a partir de los datos precalculados por `scripts/build-holidays.ts`
 * (fuente: librería date-holidays, 207 países y sus subdivisiones). El núcleo
 * no sabe de red ni de disco: recibe los JSON ya cargados.
 */

export type HolidayType = 'public' | 'bank' | 'school' | 'optional' | 'observance';
export const HOLIDAY_TYPES: readonly HolidayType[] = ['public', 'bank', 'school', 'optional', 'observance'];

const CODE_TO_TYPE: Record<string, HolidayType> = { p: 'public', b: 'bank', s: 'school', o: 'optional', v: 'observance' };

/** Entrada compacta: [fecha ISO, índice en el diccionario, tipo, (1 = día trasladado)]. */
export type HolidayEntry = [string, number, string] | [string, number, string, 1];

export interface HolidayCountryData {
  v: number;
  code: string;
  range: [number, number];
  langs: string[];
  tz: string;
  dict: Array<Record<string, string>>;
  national: HolidayEntry[];
  subdivisions: Record<string, { add: HolidayEntry[]; remove: string[] }>;
}

export interface HolidayIndex {
  v: number;
  source: string;
  range: [number, number];
  countries: Array<{ code: string; names: Record<string, string>; langs: string[]; subdivisions: Record<string, string> }>;
}

export interface Holiday {
  date: string;
  name: string;
  type: HolidayType;
  substitute: boolean;
  /** Agregado o modificado por el usuario. */
  custom: boolean;
}

export interface HolidayEdits {
  added: Array<{ date: string; name: string; type: HolidayType }>;
  /** Fechas (AAAA-MM-DD) o `fecha|nombre` a quitar. */
  removed: string[];
  /** `fecha` → nombre nuevo. */
  renamed: Record<string, string>;
}

export interface HolidayQuery {
  subdivision?: string | null;
  types: readonly HolidayType[];
  /** Idioma preferido (es, en, pt, it…). */
  lang: string;
  from: string;
  to: string;
  edits?: HolidayEdits;
}

export function holidayName(data: HolidayCountryData, dictIndex: number, lang: string): string {
  const rec = data.dict[dictIndex] ?? {};
  return rec[lang] ?? rec[data.langs[0] ?? ''] ?? rec.en ?? Object.values(rec)[0] ?? '';
}

/** Feriados por fecha dentro de [from, to] (ambos inclusive, formato AAAA-MM-DD). */
export function computeHolidays(data: HolidayCountryData | null, q: HolidayQuery): Map<string, Holiday[]> {
  const out = new Map<string, Holiday[]>();
  const push = (h: Holiday): void => {
    const list = out.get(h.date);
    if (list) list.push(h);
    else out.set(h.date, [h]);
  };
  const types = new Set(q.types);
  if (data) {
    const sub = q.subdivision ? data.subdivisions[q.subdivision] : undefined;
    const removedBySub = new Set(sub?.remove ?? []);
    const entries = sub ? [...data.national, ...sub.add] : data.national;
    for (const e of entries) {
      const [date, idx, code] = e;
      if (date < q.from || date > q.to) continue;
      if (removedBySub.has(`${date}|${idx}`)) continue;
      const type = CODE_TO_TYPE[code] ?? 'observance';
      if (!types.has(type)) continue;
      push({ date, name: holidayName(data, idx, q.lang), type, substitute: e.length === 4, custom: false });
    }
  }
  const edits = q.edits;
  if (edits) {
    const removed = new Set(edits.removed);
    for (const [date, list] of [...out.entries()]) {
      const kept = list.filter((h) => !removed.has(date) && !removed.has(`${date}|${h.name}`));
      if (kept.length === 0) out.delete(date);
      else out.set(date, kept);
    }
    for (const [date, name] of Object.entries(edits.renamed)) {
      const list = out.get(date);
      if (list && list[0]) list[0] = { ...list[0], name, custom: true };
    }
    for (const a of edits.added) {
      if (a.date < q.from || a.date > q.to) continue;
      push({ date: a.date, name: a.name, type: a.type, substitute: false, custom: true });
    }
  }
  // Depuración: un mismo día con nombres repetidos o con su versión «trasladada».
  for (const [date, list] of out) {
    const unique: Holiday[] = [];
    for (const h of list) {
      const dup = unique.find((u) => u.name === h.name || h.name.startsWith(`${u.name} (`) || u.name.startsWith(`${h.name} (`));
      if (!dup) unique.push(h);
      else if (dup.substitute && !h.substitute) unique[unique.indexOf(dup)] = h;
    }
    const rank: Record<HolidayType, number> = { public: 0, bank: 1, optional: 2, school: 3, observance: 4 };
    unique.sort((a, b) => rank[a.type] - rank[b.type]);
    out.set(date, unique);
  }
  return out;
}

/** Nombre del país en un idioma (con reserva en inglés). */
export function countryName(index: HolidayIndex | null, code: string, lang: string): string {
  const c = index?.countries.find((x) => x.code === code);
  if (!c) return code;
  return c.names[lang] ?? c.names.en ?? Object.values(c.names)[0] ?? code;
}
