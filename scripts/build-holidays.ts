/**
 * Precalcula los feriados de todos los países (y sus provincias/estados) que
 * cubre la librería `date-holidays` y los guarda como JSON compacto en
 * `public/holidays/`. La aplicación y la CLI leen esos archivos: no cargan la
 * librería ni sus datos de husos horarios en tiempo de ejecución.
 *
 * Uso:
 *   npm run holidays                    → rango por defecto (año actual −10 … +35)
 *   npm run holidays -- --from 1990 --to 2100
 *   tsx scripts/build-holidays.ts --if-missing   (lo usan predev/prebuild/pretest)
 */
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Holidays from 'date-holidays';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'holidays');

const TYPE_CODE: Record<string, string> = { public: 'p', bank: 'b', school: 's', optional: 'o', observance: 'v' };
const EXTRA_LANGS = ['es', 'en', 'pt', 'it'];
const FORMAT_VERSION = 1;

interface RawItem {
  date: string;
  start: string | Date;
  end: string | Date;
  name: string;
  type: string;
  rule: string;
  substitute?: boolean;
}

type Entry = [string, number, string] | [string, number, string, 1];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function libVersion(): string {
  const pkgPath = join(dirname(require.resolve('date-holidays')), '..', 'package.json');
  try {
    return (JSON.parse(readFileSync(pkgPath, 'utf8')) as { version: string }).version;
  } catch {
    return 'unknown';
  }
}

function expand(item: RawItem): string[] {
  const first = item.date.slice(0, 10);
  const start = new Date(item.start).getTime();
  const end = new Date(item.end).getTime();
  const days = Math.max(1, Math.round((end - start) / 86_400_000));
  if (days <= 1) return [first];
  const out: string[] = [];
  const base = Date.UTC(Number(first.slice(0, 4)), Number(first.slice(5, 7)) - 1, Number(first.slice(8, 10)));
  for (let i = 0; i < Math.min(days, 14); i++) out.push(new Date(base + i * 86_400_000).toISOString().slice(0, 10));
  return out;
}

async function main(): Promise<void> {
  const ifMissing = process.argv.includes('--if-missing');
  const indexPath = join(outDir, 'index.json');
  const version = libVersion();
  if (ifMissing && existsSync(indexPath)) {
    try {
      const idx = JSON.parse(readFileSync(indexPath, 'utf8')) as { v: number; source: string };
      if (idx.v === FORMAT_VERSION && idx.source === `date-holidays@${version}`) return;
    } catch {
      /* se regenera */
    }
  }
  const now = new Date().getUTCFullYear();
  const from = Number(arg('from') ?? now - 10);
  const to = Number(arg('to') ?? now + 35);
  const only = arg('only')?.split(',').map((s) => s.trim().toUpperCase());
  const t0 = Date.now();
  await mkdir(outDir, { recursive: true });

  const hd = new Holidays();
  const countries = hd.getCountries('en') as Record<string, string>;
  const index: Array<{ code: string; names: Record<string, string>; langs: string[]; subdivisions: Record<string, string> }> = [];

  for (const code of Object.keys(countries).sort()) {
    if (only && !only.includes(code)) continue;
    const national = new Holidays(code);
    const langs = (national.getLanguages() as string[]) ?? [];
    const defaultLang = langs[0] ?? 'en';
    const names: Record<string, string> = {};
    for (const l of new Set([...langs, ...EXTRA_LANGS])) {
      const n = (hd.getCountries(l) as Record<string, string>)[code];
      if (n) names[l] = n;
    }
    const states = (national.getStates(code, defaultLang) as Record<string, string> | undefined) ?? {};
    const tz = (national.getTimezones() as string[])[0] ?? 'UTC';

    // Nombres por regla: rule → { idioma → nombre }
    const ruleNames = new Map<string, Record<string, string>>();
    const ruleFirstYear = new Map<string, { year: number; target: string[] }>();

    const collect = (target: string[]): Map<string, Entry[]> => {
      const h = target.length > 1 ? new Holidays(target[0]!, target[1]!) : new Holidays(target[0]!);
      const byYear = new Map<string, Entry[]>();
      for (let y = from; y <= to; y++) {
        const list = (h.getHolidays(y, defaultLang) as RawItem[]) ?? [];
        for (const item of list) {
          const code2 = TYPE_CODE[item.type] ?? 'v';
          if (!ruleNames.has(item.rule)) ruleNames.set(item.rule, { [defaultLang]: item.name });
          if (!ruleFirstYear.has(item.rule)) ruleFirstYear.set(item.rule, { year: y, target });
          for (const iso of expand(item)) {
            const e: Entry = item.substitute ? [iso, -1, code2, 1] : [iso, -1, code2];
            const key = iso.slice(0, 4);
            if (!byYear.has(key)) byYear.set(key, []);
            byYear.get(key)!.push(e);
            (e as unknown as { rule: string }).rule = item.rule;
          }
        }
      }
      return byYear;
    };

    const nationalByYear = collect([code]);
    const stateByYear = new Map<string, Map<string, Entry[]>>();
    for (const st of Object.keys(states)) stateByYear.set(st, collect([code, st]));

    // Traducciones: una llamada por (destino, año, idioma) solo donde aparece cada regla por primera vez.
    const groups = new Map<string, { target: string[]; year: number }>();
    for (const { year, target } of ruleFirstYear.values()) groups.set(`${target.join('/')}@${year}`, { target, year });
    for (const { target, year } of groups.values()) {
      const h = target.length > 1 ? new Holidays(target[0]!, target[1]!) : new Holidays(target[0]!);
      for (const l of new Set([...langs, ...EXTRA_LANGS])) {
        if (l === defaultLang) continue;
        for (const item of (h.getHolidays(year, l) as RawItem[]) ?? []) {
          const rec = ruleNames.get(item.rule);
          if (rec && !rec[l]) rec[l] = item.name;
        }
      }
    }

    // Diccionario deduplicado de nombres. date-holidays devuelve, cuando no tiene
    // traducción, el nombre en OTRO idioma (p. ej. inglés o portugués para un
    // feriado argentino pedido en italiano). Se conserva una traducción solo si
    // no repite el texto de un idioma de mayor autoridad; en tiempo de ejecución
    // el idioma faltante cae en el idioma local del país y luego en inglés.
    const authority = [...new Set([defaultLang, ...langs, 'en', 'es', 'pt', 'it'])];
    const dict: Array<Record<string, string>> = [];
    const dictIndex = new Map<string, number>();
    const ruleToDict = new Map<string, number>();
    for (const [rule, rec] of ruleNames) {
      const compact: Record<string, string> = { [defaultLang]: rec[defaultLang] ?? Object.values(rec)[0] ?? rule };
      const seen = new Set<string>([compact[defaultLang]!]);
      for (const l of authority) {
        const v = rec[l];
        if (l === defaultLang || !v || seen.has(v)) continue;
        compact[l] = v;
        seen.add(v);
      }
      const k = JSON.stringify(compact);
      let idx = dictIndex.get(k);
      if (idx === undefined) {
        idx = dict.length;
        dict.push(compact);
        dictIndex.set(k, idx);
      }
      ruleToDict.set(rule, idx);
    }
    const finalize = (byYear: Map<string, Entry[]>): Entry[] =>
      [...byYear.values()]
        .flat()
        .map((e) => {
          const rule = (e as unknown as { rule: string }).rule;
          const out = [...e] as Entry;
          out[1] = ruleToDict.get(rule) ?? 0;
          return out;
        })
        .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1]));

    const nationalEntries = finalize(nationalByYear);
    const nationalKeys = new Set(nationalEntries.map((e) => `${e[0]}|${e[1]}|${e[2]}`));
    const subdivisions: Record<string, { add: Entry[]; remove: string[] }> = {};
    for (const [st, byYear] of stateByYear) {
      const entries = finalize(byYear);
      const keys = new Set(entries.map((e) => `${e[0]}|${e[1]}|${e[2]}`));
      const add = entries.filter((e) => !nationalKeys.has(`${e[0]}|${e[1]}|${e[2]}`));
      const remove = nationalEntries.filter((e) => !keys.has(`${e[0]}|${e[1]}|${e[2]}`)).map((e) => `${e[0]}|${e[1]}`);
      if (add.length > 0 || remove.length > 0) subdivisions[st] = { add, remove };
      else subdivisions[st] = { add: [], remove: [] };
    }

    const file = {
      v: FORMAT_VERSION,
      code,
      range: [from, to],
      langs,
      tz,
      dict,
      national: nationalEntries,
      subdivisions,
    };
    await writeFile(join(outDir, `${code}.json`), JSON.stringify(file));
    index.push({ code, names, langs, subdivisions: states });
  }

  await writeFile(
    indexPath,
    JSON.stringify({ v: FORMAT_VERSION, source: `date-holidays@${version}`, range: [from, to], generated: new Date().toISOString(), countries: index }),
  );
  console.log(`Feriados: ${index.length} países, ${from}–${to}, en ${((Date.now() - t0) / 1000).toFixed(1)} s → ${outDir}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
