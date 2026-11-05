/** Mensajes entre la interfaz y el Worker de PDF (solo tipos, sin dependencias de entorno). */
import type { AssetRef, Design } from '../design/schema';
import type { HolidayCountryData } from '../holidays';
import type { FontStyle } from '../text/fonts';
import type { ExportKind } from './index';

export interface PdfJob {
  id: number;
  kind: ExportKind;
  signature?: number;
  /** Solo para el PDF de páginas: las páginas a exportar (índices desde 0). */
  pages?: number[];
  design: Design;
  fonts: Array<{ bytes: Uint8Array; family: string; weight: number; style: FontStyle; source: 'builtin' | 'user' }>;
  holidays: HolidayCountryData | null;
  assets: Array<{ ref: AssetRef; bytes: Uint8Array }>;
}

export type PdfReply =
  | { id: number; type: 'progress'; done: number; total: number }
  | { id: number; type: 'done'; bytes: Uint8Array }
  | { id: number; type: 'error'; message: string };
