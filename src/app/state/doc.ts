/**
 * Documento derivado del diseño (memorizado): se reconstruye solo cuando cambia
 * el diseño o llegan recursos nuevos. Las páginas se maquetan bajo demanda.
 */
import { AgendaDocument } from '@core/document';
import type { Design } from '@core/design/schema';
import { useMemo } from 'react';
import { resources } from './resources';
import { useStore } from './store';

let memo: { design: Design; version: number; doc: AgendaDocument | null; error: string | null } | null = null;

export function documentFor(design: Design, version: number): { doc: AgendaDocument | null; error: string | null } {
  if (memo && memo.design === design && memo.version === version) return memo;
  let doc: AgendaDocument | null = null;
  let error: string | null = null;
  try {
    if (resources.fonts.list().length > 0) {
      doc = new AgendaDocument(design, {
        fonts: resources.fonts,
        holidays: resources.holidaysFor(design.holidays.country),
        assets: resources.assetInfos,
      });
    }
  } catch (err) {
    error = (err as Error).message;
    console.error(err);
  }
  memo = { design, version, doc, error };
  return memo;
}

export function useDocument(): { doc: AgendaDocument | null; error: string | null } {
  const design = useStore((s) => s.design);
  const version = useStore((s) => s.resVersion);
  return useMemo(() => (design ? documentFor(design, version) : { doc: null, error: null }), [design, version]);
}
