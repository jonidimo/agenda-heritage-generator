/**
 * Documento derivado del diseño (memorizado): se reconstruye solo cuando cambia el diseño o llegan
 * recursos nuevos, y al reconstruirlo se reutiliza lo que no cambió del anterior (calendario,
 * textos, plan de páginas y las páginas ya maquetadas: ver `AgendaDocument`). Las páginas se
 * maquetan bajo demanda.
 *
 * Mientras se arrastra un control hay dos diseños vivos: el confirmado (miniaturas, libro, panel de
 * impresión) y la vista previa (lienzo). Cada uno tiene su documento, así las miniaturas no se
 * vuelven a dibujar en cada cuadro del arrastre.
 */
import { AgendaDocument } from '@core/document';
import type { Design } from '@core/design/schema';
import { useMemo } from 'react';
import { resources } from './resources';
import { useStore } from './store';

export interface DocResult {
  doc: AgendaDocument | null;
  error: string | null;
}

interface Entry extends DocResult {
  design: Design;
  version: number;
  /** Orden de creación (para elegir de cuál reutilizar). */
  serial: number;
}

/** Diseños con documento: el confirmado y la vista previa. El menos usado sale primero. */
const CAPACITY = 2;
const entries: Entry[] = [];
let serial = 0;

export function documentFor(design: Design, version: number): DocResult {
  const at = entries.findIndex((e) => e.design === design && e.version === version);
  if (at >= 0) {
    // Se marca como el más usado.
    const [hit] = entries.splice(at, 1);
    entries.push(hit!);
    return hit!;
  }
  // Se reutiliza del documento más reciente con los mismos recursos (otros recursos, otras páginas).
  const reuse = entries
    .filter((e) => e.version === version && e.doc)
    .sort((a, b) => b.serial - a.serial)[0]?.doc;
  let doc: AgendaDocument | null = null;
  let error: string | null = null;
  try {
    if (resources.fonts.list().length > 0) {
      doc = new AgendaDocument(
        design,
        { fonts: resources.fonts, holidays: resources.holidaysFor(design.holidays.country), assets: resources.assetInfos },
        {},
        reuse ? { reuse } : {},
      );
    }
  } catch (err) {
    error = (err as Error).message;
    console.error(err);
  }
  const entry: Entry = { design, version, doc, error, serial: ++serial };
  entries.push(entry);
  if (entries.length > CAPACITY) entries.shift();
  return entry;
}

/** Qué diseño muestra quien lo pide: el confirmado, o el que se está arrastrando si lo hay. */
export type DocumentSource = 'committed' | 'editing';

export function useDocument(source: DocumentSource = 'committed'): DocResult {
  const design = useStore((s) => (source === 'editing' ? (s.previewDesign ?? s.design) : s.design));
  const version = useStore((s) => s.resVersion);
  return useMemo(() => (design ? documentFor(design, version) : { doc: null, error: null }), [design, version]);
}
