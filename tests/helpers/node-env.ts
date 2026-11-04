/** Utilidades de prueba: carga de fuentes y feriados desde disco (entorno Node). */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { HolidayCountryData } from '../../src/core/holidays';
import { FontRegistry } from '../../src/core/text/fonts';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

interface FontManifest {
  families: Array<{ family: string; faces: Array<{ weight: number; style: 'normal' | 'italic'; file: string }> }>;
}

export function loadAllFonts(): FontRegistry {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'public/fonts/fonts.json'), 'utf8')) as FontManifest;
  const reg = new FontRegistry();
  for (const fam of manifest.families) {
    for (const face of fam.faces) {
      const bytes = new Uint8Array(readFileSync(join(ROOT, 'public/fonts', face.file)));
      reg.register(bytes, { family: fam.family, weight: face.weight, style: face.style, source: 'builtin', file: face.file });
    }
  }
  return reg;
}

export function loadHolidays(code: string): HolidayCountryData {
  return JSON.parse(readFileSync(join(ROOT, 'public/holidays', `${code}.json`), 'utf8')) as HolidayCountryData;
}
