/**
 * Guía impresa «Cómo usar esta agenda»: explica cada método activo, con su
 * nivel de evidencia, signos y referencias numeradas. Se pagina sola según el
 * tema, el idioma y el tamaño de página.
 */
import { langOf } from '../i18n';
import { pageGeometry } from '../document/context';
import { cols, takeTop } from '../layout/box';
import { LayoutContext, type DocContext } from '../layout/context';
import { line, type Prim } from '../layout/prims';
import { pageHeader, signifierIcon } from '../layout/widgets';
import { ptToMm } from '../util/geometry';
import { CATEGORY_ORDER, methodText, METHODS, type EvidenceLevel, type PlannerMethod } from '../methods/catalog';
import { param, type SectionModule } from './types';

interface GuideItem {
  id: string;
  height: number;
  render(ctx: LayoutContext, y: number): void;
}

function enabledMethods(doc: DocContext): PlannerMethod[] {
  const on = new Set(doc.design.methods.enabled);
  return CATEGORY_ORDER.flatMap((cat) => METHODS.filter((m) => m.category === cat && on.has(m.id)));
}

function buildItems(ctx: LayoutContext): GuideItem[] {
  const doc = ctx.doc;
  const lang = langOf(doc.locale);
  const w = ctx.content.w;
  const bodySize = Math.max(ctx.theme.sizes.small + 0.5, ctx.theme.minTextPt);
  const lead = 1.32;
  const lineH = ptToMm(bodySize) * lead;
  const items: GuideItem[] = [];
  const showEvidence = doc.design.methods.guide.evidence;
  const showRefs = doc.design.methods.guide.references;
  const refs: string[] = [];
  const refIndex = (r: string): number => {
    const i = refs.indexOf(r);
    if (i >= 0) return i + 1;
    refs.push(r);
    return refs.length;
  };

  // Introducción.
  const intro = ctx.s.guide.intro;
  const introLines = ctx.textIn(intro, { x: 0, y: 0, w, h: 500 }, { role: 'quote', size: bodySize + 1, wrap: true, leading: lead }).lines;
  items.push({
    id: 'intro',
    height: introLines * ptToMm(bodySize + 1) * lead + 4,
    render(c, y) {
      const t = c.textIn(intro, { x: c.content.x, y, w, h: 500 }, { role: 'quote', size: bodySize + 1, wrap: true, leading: lead });
      c.add('guide.intro', 'Introducción', t.prims);
    },
  });

  // Leyenda de signos (unión de las leyendas de los métodos activos).
  const methods = enabledMethods(doc);
  const legend = [...new Set(methods.flatMap((m) => m.legend ?? []))];
  if (legend.length > 0) {
    const perRow = 3;
    const nRows = Math.ceil(legend.length / perRow);
    items.push({
      id: 'legend',
      height: 6 + nRows * 5 + 3,
      render(c, y) {
        const p: Prim[] = [];
        p.push(...c.textIn(c.s.guide.legend, { x: c.content.x, y, w, h: 4 }, { role: 'heading', size: 'labelSmall', upper: true, tracking: c.theme.tracking.heading }).prims);
        p.push(line(c.content.x, y + 4, c.content.x + w, y + 4, c.stroke('rule', 'ink')));
        for (let r = 0; r < nRows; r++) {
          const cells = cols({ x: c.content.x, y: y + 6 + r * 5, w, h: 5 }, perRow, 3);
          for (let k = 0; k < perRow; k++) {
            const sig = legend[r * perRow + k];
            if (!sig) continue;
            const cell = cells[k]!;
            p.push(...signifierIcon(c, sig, cell.x + 1.6, cell.y + 2.5, 2.8));
            p.push(...c.textIn(c.s.pages.signifiers[sig], { x: cell.x + 4, y: cell.y, w: cell.w - 4, h: 5 }, { role: 'body', size: bodySize, valign: 'middle', fit: true }).prims);
          }
        }
        c.add('guide.legend', c.s.guide.legend, p);
      },
    });
  }

  const levelName = (lv: EvidenceLevel): string => ctx.s.guide.levels[lv];
  const addMethod = (id: string, name: string, text: string, level: EvidenceLevel, refList: string[]): void => {
    const nums = showRefs ? refList.map(refIndex) : [];
    const textLines = ctx.textIn(text, { x: 0, y: 0, w, h: 500 }, { role: 'body', size: bodySize, wrap: true, leading: lead }).lines;
    const height = 5.5 + textLines * lineH + 3.5;
    items.push({
      id: `method.${id}`,
      height,
      render(c, y) {
        const p: Prim[] = [];
        const nm = c.textAt(name, c.content.x, y + 3.6, { role: 'labelStrong', size: c.theme.sizes.label + 1, upper: true, tracking: 0.05 });
        p.push(nm.prim);
        const right = [showEvidence ? levelName(level) : '', nums.length ? `[${nums.join(', ')}]` : ''].filter(Boolean).join('  ');
        if (right) p.push(c.textAt(right, c.content.x + w, y + 3.6, { role: 'quote', size: bodySize, align: 'right', color: '#555555' }).prim);
        p.push(line(c.content.x, y + 4.8, c.content.x + w, y + 4.8, c.stroke('hair')));
        p.push(...c.textIn(text, { x: c.content.x, y: y + 6, w, h: 500 }, { role: 'body', size: bodySize, wrap: true, leading: lead }).prims);
        c.add(`guide.${id}`, name, p);
      },
    });
  };

  for (const m of methods) {
    const t = methodText(m, lang);
    addMethod(m.id, t.name, t.text, m.evidence, m.refs);
  }
  for (const cm of doc.design.methods.custom) addMethod(cm.id, cm.name, [cm.text, cm.evidenceText].filter(Boolean).join(' '), cm.evidence, cm.references);

  // Referencias.
  if (showRefs && refs.length > 0) {
    const refSize = Math.max(ctx.theme.sizes.tiny + 0.5, ctx.theme.minTextPt);
    const refLead = ptToMm(refSize) * 1.25;
    items.push({
      id: 'refs.title',
      height: 8,
      render(c, y) {
        const p = [...c.textIn(c.s.guide.references, { x: c.content.x, y: y + 1, w, h: 5 }, { role: 'title', size: 'subtitle' }).prims];
        c.add('guide.refsTitle', c.s.guide.references, p);
      },
    });
    refs.forEach((r, i) => {
      const label = `${i + 1}. ${r}`;
      const nLines = ctx.textIn(label, { x: 0, y: 0, w, h: 500 }, { role: 'body', size: refSize, wrap: true, leading: 1.25 }).lines;
      items.push({
        id: `ref.${i}`,
        height: nLines * refLead + 1.2,
        render(c, y) {
          c.add(`guide.ref.${i}`, `Referencia ${i + 1}`, c.textIn(label, { x: c.content.x, y, w, h: 500 }, { role: 'body', size: refSize, wrap: true, leading: 1.25 }).prims);
        },
      });
    });
  }
  return items;
}

function paginate(ctx: LayoutContext, items: GuideItem[]): string[][] {
  const pages: string[][] = [];
  let current: string[] = [];
  const firstH = ctx.content.h - 18;
  const nextH = ctx.content.h - 12;
  let avail = firstH;
  for (const it of items) {
    if (it.height > avail && current.length > 0) {
      pages.push(current);
      current = [];
      avail = nextH;
    }
    current.push(it.id);
    avail -= it.height;
  }
  if (current.length > 0) pages.push(current);
  return pages;
}

export const methodsGuide: SectionModule = {
  type: 'guide',
  scope: 'front',
  defaults: {},
  plan(doc, item) {
    if (doc.design.methods.enabled.length === 0 && doc.design.methods.custom.length === 0) return [];
    const ctx = new LayoutContext(doc, pageGeometry(doc, 'recto'));
    const pages = paginate(ctx, buildItems(ctx));
    return pages.map((ids, i) => ({ key: `front:guide:${i}`, type: 'guide', section: item.id, title: 'Guía', group: 'front', startOn: (i === 0 && pages.length > 1 ? 'verso' : 'any') as 'verso' | 'any', params: { ids, part: i } }));
  },
  layout(ctx, page) {
    const ids = new Set(param<string[]>(page, 'ids', []));
    const part = param(page, 'part', 0);
    const title = part === 0 ? ctx.s.guide.title : `${ctx.s.guide.title} ${ctx.s.guide.continued}`;
    const used = pageHeader(ctx, ctx.content, title, '', { titleSize: part === 0 ? 'titleSmall' : 'subtitle' });
    let y = takeTop(ctx.content, used)[1].y;
    for (const it of buildItems(ctx)) {
      if (!ids.has(it.id)) continue;
      it.render(ctx, y);
      y += it.height;
    }
  },
};

