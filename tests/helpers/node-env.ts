/**
 * Utilidades de prueba sobre el entorno Node de la aplicación (el mismo que usan la línea de
 * comandos y el servidor MCP), con las fuentes cargadas una sola vez por archivo de prueba.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Design } from '../../src/core/design/schema';
import type { AgendaDocument } from '../../src/core/document';
import type { HolidayCountryData } from '../../src/core/holidays';
import type { FontRegistry } from '../../src/core/text/fonts';
import { loadFonts, openNodeDocument, ROOT } from '../../src/node/env';

export { ROOT };

let fonts: Promise<FontRegistry> | null = null;

/** Todas las fuentes integradas (un solo registro para todo el archivo de prueba). */
export function sharedFonts(): Promise<FontRegistry> {
  fonts ??= loadFonts();
  return fonts;
}

export function loadHolidays(code: string): HolidayCountryData {
  return JSON.parse(readFileSync(join(ROOT, 'public/holidays', `${code}.json`), 'utf8')) as HolidayCountryData;
}

export async function openDocument(design: Design): Promise<{ doc: AgendaDocument; bytes: Map<string, Uint8Array> }> {
  const { doc, bytes } = await openNodeDocument(design, await sharedFonts());
  return { doc, bytes };
}
