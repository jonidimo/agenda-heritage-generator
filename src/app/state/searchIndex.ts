/**
 * Índice del buscador: los ajustes de los paneles (sus textos, en el idioma de la interfaz), las
 * secciones, las páginas de la agenda y los elementos de la página actual. Se arma una vez por
 * cambio de idioma o de agenda; cada búsqueda solo compara palabras ya normalizadas.
 */
import type { AgendaDocument } from '@core/document';
import type { Design, SectionItem } from '@core/design/schema';
import { prepare, type Prepared } from '@core/util/fuzzy';
import { blockLabel } from '../i18n/messages';
import { sectionName, uiEntries, type UiKey, type UiLang } from '../i18n/ui';
import { jumpToPage } from './navigation';
import { reveal } from './reveal';
import { resources } from './resources';
import { nextPageOf } from './sections';
import { useStore, type Panel } from './store';

export type SearchKind = 'setting' | 'panel' | 'section' | 'page' | 'element' | 'asset' | 'font';

export interface SearchItem {
  kind: SearchKind;
  label: string;
  /** Dónde está (nombre del panel, número de página…). */
  where: string;
  prepared: Prepared;
  go: () => void;
}

/**
 * En qué panel está cada familia de textos de la interfaz (por el prefijo de su clave). Es la
 * arquitectura de la información: una sola tabla, en lugar de anotar cada control.
 */
const PANEL_NAMESPACES: Readonly<Record<Panel, readonly string[]>> = {
  sections: ['sections', 'sec', 'ptpl', 'cp'],
  style: ['style', 'size', 'stroke', 'color', 'margin', 'role', 'theme', 'palette', 'harmony', 'lines', 'use', 'pattern', 'orn'],
  methods: ['methods'],
  persona: ['persona'],
  calendar: ['cal', 'type'],
  assets: ['assets', 'wm', 'cover'],
  fonts: ['fonts'],
  print: ['print', 'export', 'links', 'mark', 'creep', 'duplex', 'bind', 'sig', 'last', 'thumb', 'paper'],
};

const PANEL_OF = new Map<string, Panel>(Object.entries(PANEL_NAMESPACES).flatMap(([panel, ns]) => ns.map((n) => [n, panel as Panel] as const)));

/** Un texto que es el nombre de un control (no una ayuda ni una frase con variables). */
const isLabel = (s: string): boolean => s.length >= 3 && s.length <= 60 && !s.includes('{') && !/[.:]$/.test(s.trim());

export function buildSearchIndex(lang: UiLang, t: (k: UiKey, v?: Record<string, string | number>) => string, design: Design | null, doc: AgendaDocument | null, pageIndex: number): SearchItem[] {
  const items: SearchItem[] = [];
  const seen = new Set<string>();
  const add = (it: Omit<SearchItem, 'prepared'>): void => {
    const id = `${it.kind}|${it.label}|${it.where}`;
    if (seen.has(id)) return;
    seen.add(id);
    items.push({ ...it, prepared: prepare(it.label) });
  };
  const panelName = (p: Panel): string => t(`tab.${p}` as UiKey);
  for (const p of Object.keys(PANEL_NAMESPACES) as Panel[]) add({ kind: 'panel', label: panelName(p), where: '', go: () => void reveal({ panel: p }) });
  for (const [key, text] of uiEntries(lang)) {
    const panel = PANEL_OF.get(key.split('.')[0]!);
    if (!panel || !isLabel(text)) continue;
    add({ kind: 'setting', label: text, where: panelName(panel), go: () => void reveal({ panel, text }) });
  }
  if (!design || !doc) return items;
  const from = pageIndex;
  const sectionItem = (it: SectionItem): void => {
    const name = it.type === 'pageTemplate' ? (design.pageTemplates.find((x) => x.id === it.options.template)?.title ?? sectionName(t, it.type)) : sectionName(t, it.type);
    const target = it.enabled ? nextPageOf(doc, it.id, from) : undefined;
    add({ kind: 'section', label: name, where: target !== undefined ? t('nav.page', { n: target + 1 }) : t('sections.notInAgenda'), go: () => (target !== undefined ? jumpToPage(target) : void reveal({ panel: 'sections', text: name })) });
  };
  for (const s of design.sections) {
    sectionItem(s);
    for (const it of s.items ?? []) sectionItem(it);
  }
  for (const p of doc.plan.pages) {
    if (p.type === 'filler') continue;
    add({ kind: 'page', label: doc.pageLabel(p.index), where: t('nav.page', { n: p.index + 1 }), go: () => jumpToPage(p.index) });
  }
  // Las imágenes y las fuentes de la agenda: llevan a su panel y a ella.
  for (const a of design.assets) if (!a.builtin) add({ kind: 'asset', label: a.name, where: panelName('assets'), go: () => void reveal({ panel: 'assets', text: a.name }) });
  for (const family of resources.fonts.families()) add({ kind: 'font', label: family, where: panelName('fonts'), go: () => void reveal({ panel: 'fonts', selector: `[data-font="${family.replace(/"/g, '\\"')}"]` }) });
  // Los elementos propios de toda la agenda (no solo los de la página actual): llevan a su página y quedan elegidos.
  for (const cb of design.customBlocks) {
    const target = cb.pageKey ? doc.indexOfKey(cb.pageKey) : doc.plan.pages.findIndex((p) => p.type === cb.pageType);
    const plan = doc.plan.pages[target];
    if (!plan) continue;
    add({
      kind: 'element',
      label: String(cb.props.label ?? cb.kind),
      where: t('nav.page', { n: plan.index + 1 }),
      go: () => {
        jumpToPage(plan.index);
        const st = useStore.getState();
        st.select({ pageKey: plan.key, pageType: plan.type, blockId: `custom.${cb.id}`, role: 'custom' });
        st.setInspectorOpen(true);
      },
    });
  }
  const page = doc.pageCount > 0 ? doc.page(Math.min(pageIndex, doc.pageCount - 1)) : null;
  for (const b of page?.blocks ?? []) {
    add({
      kind: 'element',
      label: blockLabel(t, b.id, b.label),
      where: t('nav.page', { n: page!.index + 1 }),
      go: () => {
        const st = useStore.getState();
        st.select({ pageKey: page!.key, pageType: page!.type, blockId: b.id, role: b.role });
        st.setInspectorOpen(true);
      },
    });
  }
  return items;
}
