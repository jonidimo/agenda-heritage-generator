/**
 * Traducción a la interfaz de lo que produce el núcleo: nombres de bloques (el
 * núcleo los da en español) y avisos de la verificación previa (con código y datos).
 */
import type { PageWarning } from '@core/layout/prims';
import type { UiKey } from './ui';

type T = (key: UiKey, vars?: Record<string, string | number>) => string;

/** Nombres genéricos que el núcleo usa con ids que varían (encabezados con prefijo propio). */
const BY_LABEL: Record<string, UiKey> = {
  Título: 'blk.header.title',
  'Rótulo del encabezado': 'blk.header.right',
  'Filete del encabezado': 'blk.header.rule',
  'Elemento propio': 'blk.customElement',
  'Marca de agua': 'blk.watermark',
};

export function blockLabel(t: T, id: string, fallback: string, renamed = false): string {
  // Un nombre que puso la persona manda sobre el del programa.
  if (renamed) return fallback;
  const exact = `blk.${id}` as UiKey;
  const v = t(exact);
  if (v !== exact) return v;
  let m = /^goal\.(\d+)$/.exec(id);
  if (m) return t('blk.goal', { n: m[1]! });
  m = /^grid\.week\.(\d+)$/.exec(id);
  if (m) return t('blk.gridWeek', { n: Number(m[1]) + 1 });
  const generic = BY_LABEL[fallback];
  return generic ? t(generic) : fallback;
}

export function warningText(t: T, w: Pick<PageWarning, 'code' | 'params' | 'message'>): string {
  const p = w.params;
  if (w.code === 'abbreviated') {
    const where = p.kind === 'event' ? `${t('tab.persona')} → ${t('persona.dates')}` : `${t('tab.calendar')} → ${t('cal.holidays')}`;
    return t('warn.abbreviated', { text: String(p.text ?? ''), where });
  }
  if (w.code === 'brokenLink') {
    const label = blockLabel(t, String(p.block ?? ''), String(p.label ?? ''));
    return p.mode === 'url' ? t('warn.brokenLink.url', { label, target: String(p.target ?? '') }) : t('warn.brokenLink.page', { label });
  }
  const key = `warn.${w.code}` as UiKey;
  const vars: Record<string, string | number> = { ...p };
  if (typeof p.label === 'string') vars.label = blockLabel(t, String(p.block ?? ''), p.label);
  const s = t(key, vars);
  return s === key ? w.message : s;
}
