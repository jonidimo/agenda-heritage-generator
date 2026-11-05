/**
 * Opciones del menú contextual del lienzo y de las miniaturas. Cada opción repite lo que ya
 * está en los paneles, a mano donde se está trabajando.
 */
import type { AgendaDocument } from '@core/document';
import type { WritingStyle } from '@core/design/themes';
import type { BlockLineKey } from '@core/design/schema';
import type { ResolvedLink } from '@core/document/links';
import type { Block, PageModel, Prim } from '@core/layout/prims';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  ClipboardPaste,
  Copy,
  Crosshair,
  EyeOff,
  FilePlus2,
  Grid3x3,
  Grip,
  Image as ImageIcon,
  ImagePlus,
  Link2,
  MousePointerClick,
  RotateCcw,
  Scaling,
  Scissors,
  SlidersHorizontal,
  Square,
  SquareDashedMousePointer,
  StretchHorizontal,
  Trash2,
  Type,
} from 'lucide-react';
import { blockLabel } from '../../i18n/messages';
import { pageTitle, sectionName, type UiKey } from '../../i18n/ui';
import {
  addCustomBlock,
  alignBlocks,
  allLinesRecipe,
  clearBlockLinks,
  linkScope,
  setBlockLink,
  centerBlocks,
  distributeBlocks,
  duplicateCustomBlock,
  hideBlocks,
  matchScale,
  pageStyleOf,
  resetBlocks,
  setPageStyle,
  similarBlocks,
  tidyBlocks,
  type Scope,
} from '../../state/actions';
import { copySelection, cutSelection, pasteSelection } from '../../state/clipboard';
import { customPageHere } from '../../state/customPages';
import { reveal } from '../../state/reveal';
import { exportPageSvg, fileBase } from '../../state/exporter';
import { useStore } from '../../state/store';
import { addAssetFiles, pickFiles } from '../../state/uploads';
import type { MenuItem } from '../ContextMenu';
import { jumpToPage } from '../../state/navigation';

type T = (key: UiKey, vars?: Record<string, string | number>) => string;

export interface MenuContext {
  t: T;
  doc: AgendaDocument;
  page: PageModel;
  scope: Scope;
  /** Punto del clic en mm de página. */
  at: { x: number; y: number };
}

const labelsFor = (t: T) => ({ text: t('insp.addText'), image: t('insp.addImage'), rect: t('insp.addRect'), lines: t('insp.addLines'), dots: t('insp.addDots') });

const openProperties = (): void => useStore.getState().setInspectorOpen(true);

/** Clases de línea con dibujo propio (renglones, separadores, tablas, marcos) que usa un elemento. */
function lineUsesOf(prims: readonly Prim[]): BlockLineKey[] {
  const found = new Set<BlockLineKey>();
  const walk = (ps: readonly Prim[]): void => {
    for (const p of ps) {
      if (p.t === 'group') walk(p.children);
      else if ((p.t === 'line' || p.t === 'rect') && p.stroke?.use) found.add(p.stroke.use);
    }
  };
  walk(prims);
  return [...found];
}

/** Elige el elemento, muestra sus zonas tocables y lleva a la sección «Enlaces» de su panel. */
function editLinks(page: PageModel, block: Block): void {
  const st = useStore.getState();
  st.select({ pageKey: page.key, pageType: page.type, blockId: block.id, role: block.role });
  st.setShowLinks(true);
  st.setInspectorOpen(true);
  void reveal({ inspector: true, selector: '[data-reveal="links"] select' });
}

function selectBlocks(page: PageModel, blocks: Block[], primary: Block): void {
  useStore.getState().setSelection(
    { pageKey: page.key, pageType: page.type, blockId: primary.id, role: primary.role },
    blocks.map((b) => b.id),
  );
}

async function uploadImage(t: T): Promise<string | undefined> {
  const files = await pickFiles('image/*,.svg', false);
  if (files.length === 0) return undefined;
  const r = await addAssetFiles(files, (name) => t('assets.unsupported', { name }));
  if (r.messages.length > 0) useStore.getState().setNotice(r.messages.join(' '));
  return r.ids[0];
}

/** Opciones para varios elementos seleccionados. */
export function multiMenu(c: MenuContext, blocks: Block[], primary: Block): MenuItem[] {
  const { t, page, scope } = c;
  const n = blocks.length;
  const align = (mode: Parameters<typeof alignBlocks>[2]) => () => alignBlocks(page, blocks, mode, 'selection', scope);
  return [
    { heading: t('multi.count', { n }) },
    { label: t('align.left'), icon: <AlignStartVertical size={14} />, onSelect: align('left') },
    { label: t('align.centerH'), icon: <AlignCenterVertical size={14} />, onSelect: align('centerH') },
    { label: t('align.right'), icon: <AlignEndVertical size={14} />, onSelect: align('right') },
    { label: t('align.top'), icon: <AlignStartHorizontal size={14} />, onSelect: align('top') },
    { label: t('align.middle'), icon: <AlignCenterHorizontal size={14} />, onSelect: align('middle') },
    { label: t('align.bottom'), icon: <AlignEndHorizontal size={14} />, onSelect: align('bottom') },
    { separator: true },
    { label: t('align.distributeH'), icon: <AlignHorizontalDistributeCenter size={14} />, disabled: n < 3, onSelect: () => distributeBlocks(page, blocks, 'x', scope) },
    { label: t('align.distributeV'), icon: <AlignVerticalDistributeCenter size={14} />, disabled: n < 3, onSelect: () => distributeBlocks(page, blocks, 'y', scope) },
    { label: t('align.tidy'), icon: <Grid3x3 size={14} />, onSelect: () => tidyBlocks(page, blocks, scope) },
    { label: t('align.centerMargins'), icon: <Crosshair size={14} />, onSelect: () => centerBlocks(page, blocks, 'margins', 'x', scope) },
    { label: t('align.matchScale', { name: blockLabel(t, primary.id, primary.label) }), icon: <Scaling size={14} />, onSelect: () => matchScale(page, blocks, primary, scope) },
    { separator: true },
    { label: t('multi.reset'), icon: <RotateCcw size={14} />, onSelect: () => resetBlocks(page, blocks.map((b) => b.id), scope) },
    {
      label: t('multi.hide'),
      icon: <EyeOff size={14} />,
      onSelect: () => {
        hideBlocks(page, blocks, scope);
        useStore.getState().select(null);
      },
    },
    { separator: true },
    { label: t('menu.properties'), icon: <SlidersHorizontal size={14} />, onSelect: openProperties },
  ];
}

/** Opciones para un elemento. */
export function blockMenu(c: MenuContext, block: Block): MenuItem[] {
  const { t, page, scope } = c;
  const design = useStore.getState().design!;
  const update = useStore.getState().update;
  const items: MenuItem[] = [{ heading: blockLabel(t, block.id, block.label) }];
  const hideHere = { label: t('menu.hideHere'), icon: <EyeOff size={14} />, onSelect: () => hideBlocks(page, [block], 'page') };
  const hideType = { label: t('menu.hideType', { type: sectionName(t, page.type) }), icon: <EyeOff size={14} />, onSelect: () => hideBlocks(page, [block], 'type') };

  if (block.role === 'watermark' && block.id.startsWith('wm.')) {
    const wmId = block.id.slice(3);
    const wm = design.watermarks.find((w) => w.id === wmId);
    const setAsset = (assetId: string): void =>
      update((d) => {
        const w = d.watermarks.find((x) => x.id === wmId);
        if (w) w.assetId = assetId;
      });
    items.push(
      { heading: t('wm.image') },
      ...design.assets.filter((a) => a.kind !== 'pdf').map((a) => ({ label: a.name, checked: wm?.assetId === a.id, icon: <ImageIcon size={14} />, onSelect: () => setAsset(a.id) })),
      { label: t('wm.upload'), icon: <ImagePlus size={14} />, onSelect: () => void uploadImage(t).then((id) => id && setAsset(id)) },
      { separator: true },
      hideHere,
      hideType,
      {
        label: t('wm.delete'),
        icon: <Trash2 size={14} />,
        danger: true,
        onSelect: () => {
          update((d) => void (d.watermarks = d.watermarks.filter((w) => w.id !== wmId)));
          useStore.getState().select(null);
        },
      },
    );
  } else if (block.role === 'writing') {
    const tokens = pageStyleOf(design, page, 'type') as { writing?: { style?: WritingStyle } };
    const current = tokens.writing?.style;
    items.push({ heading: t('writing.styleFor', { type: sectionName(t, page.type) }) });
    for (const style of ['lines', 'dots', 'grid', 'blank'] as const)
      items.push({ label: t(`val.${style}`), checked: current === style, onSelect: () => setPageStyle(page, 'type', ['writing', 'style'], style) });
    items.push({ label: t('writing.more'), icon: <SlidersHorizontal size={14} />, onSelect: openProperties }, { separator: true }, hideHere, hideType);
  } else if (block.role === 'custom') {
    items.push(
      { label: t('menu.copy'), icon: <Copy size={14} />, onSelect: () => void copySelection() },
      { label: t('menu.cut'), icon: <Scissors size={14} />, onSelect: () => void cutSelection() },
      { label: t('menu.duplicate'), icon: <Copy size={14} />, onSelect: () => duplicateCustomBlock(page, block) },
      {
        label: t('insp.delete'),
        icon: <Trash2 size={14} />,
        danger: true,
        onSelect: () => {
          hideBlocks(page, [block], scope);
          useStore.getState().select(null);
        },
      },
    );
  } else if (block.editable) {
    const similar = similarBlocks(page, block);
    if (similar.length > 1) items.push({ label: t('menu.selectSimilar', { n: similar.length }), icon: <SquareDashedMousePointer size={14} />, onSelect: () => selectBlocks(page, similar, block) });
    items.push(
      { label: t('align.centerMargins'), icon: <Crosshair size={14} />, onSelect: () => centerBlocks(page, [block], 'margins', 'x', scope) },
      { label: t('insp.reset'), icon: <RotateCcw size={14} />, onSelect: () => resetBlocks(page, [block.id], scope) },
      { separator: true },
    );
    // Dibujo de todas las líneas del elemento de una vez (el detalle por clase de línea está en el panel).
    const uses = lineUsesOf(block.prims);
    if (uses.length > 0) {
      items.push({ heading: t('bstyle.linesMenu') });
      for (const p of ['solid', 'dashed', 'dotted', 'double'] as const)
        items.push({ label: t(`bstyle.pattern.${p}`), onSelect: () => update(allLinesRecipe(page, block.id, scope, uses, { pattern: p }), `bstyle:${block.id}:all:pattern`) });
    }
    items.push({ label: t('bstyle.open'), icon: <SlidersHorizontal size={14} />, onSelect: () => void reveal({ inspector: true, selector: '[data-reveal="blockstyle"]' }) }, { separator: true }, hideHere, hideType);
  } else items.push({ label: t('insp.locked'), disabled: true });
  items.push(
    { separator: true },
    { label: t('menu.editLinks'), icon: <Link2 size={14} />, onSelect: () => editLinks(page, block) },
    { label: t('menu.properties'), icon: <SlidersHorizontal size={14} />, onSelect: openProperties },
  );
  return items;
}

/** Opciones sobre una zona tocable del PDF (un día, un mes…) de un elemento. */
export function zoneMenu(c: MenuContext, link: ResolvedLink, follow: () => void): MenuItem[] {
  const { t, page, scope } = c;
  const design = useStore.getState().design!;
  const level = linkScope(design, page, link.blockId, scope);
  const set = (mode: 'none' | 'auto', area: string): void => setBlockLink(page, link.blockId, level, { mode }, `link:${link.blockId}:${area}:${mode}`, area);
  return [
    { heading: t('link.zone') },
    { label: t('link.zoneGo'), icon: <MousePointerClick size={14} />, onSelect: follow },
    { label: t('link.zoneChange'), icon: <Link2 size={14} />, onSelect: () => void reveal({ inspector: true, selector: '[data-reveal="links"] select' }) },
    { separator: true },
    { label: t('link.zoneRemove'), icon: <Trash2 size={14} />, onSelect: () => set('none', link.area) },
    { label: t('link.zoneAuto'), icon: <RotateCcw size={14} />, disabled: link.cat !== 'manual', onSelect: () => set('auto', link.area) },
    { label: t('link.zoneRemoveAll'), icon: <Trash2 size={14} />, danger: true, onSelect: () => (clearBlockLinks(page, link.blockId, level), set('none', '')) },
  ];
}

/** Opciones sobre un lugar vacío de la página. */
export function pageMenu(c: MenuContext): MenuItem[] {
  const { t, doc, page, scope, at } = c;
  const labels = labelsFor(t);
  const add = (kind: 'text' | 'lines' | 'dots' | 'rect') => () => void addCustomBlock(page, kind, labels, scope, at);
  return [
    { heading: t('menu.page', { n: page.index + 1, title: pageTitle(t, page) }) },
    { label: t('menu.addTextHere'), icon: <Type size={14} />, onSelect: add('text') },
    {
      label: t('menu.addImageHere'),
      icon: <ImagePlus size={14} />,
      onSelect: () => void uploadImage(t).then((id) => id && addCustomBlock(page, 'image', labels, scope, at, id)),
    },
    { label: t('menu.addLinesHere'), icon: <StretchHorizontal size={14} />, onSelect: add('lines') },
    { label: t('menu.addDotsHere'), icon: <Grip size={14} />, onSelect: add('dots') },
    { label: t('menu.addFrameHere'), icon: <Square size={14} />, onSelect: add('rect') },
    { label: t('menu.paste'), icon: <ClipboardPaste size={14} />, onSelect: () => void pasteSelection() },
    { separator: true },
    { label: t('menu.insertPage'), icon: <FilePlus2 size={14} />, onSelect: () => insertPageAfter(doc, page.index) },
    {
      label: t('menu.selectAll'),
      icon: <MousePointerClick size={14} />,
      onSelect: () => {
        const all = page.blocks.filter((b) => b.editable && b.role !== 'chrome');
        if (all.length > 0) selectBlocks(page, all, all[all.length - 1]!);
      },
    },
    { label: t('export.svg'), onSelect: () => exportPageSvg(doc, page.index, `${fileBase(useStore.getState().design!)}-p${page.index + 1}.svg`) },
  ];
}

function insertPageAfter(doc: AgendaDocument, index: number): void {
  const st = useStore.getState();
  const cp = customPageHere(doc, index, { assetId: st.design?.assets.find((a) => !a.builtin)?.id ?? null });
  st.update((d) => void d.customPages.push(cp));
  st.setGoToKey(`custom:${cp.id}`);
}

/** Opciones sobre una miniatura del navegador. */
export function thumbMenu(t: T, doc: AgendaDocument, index: number): MenuItem[] {
  const plan = doc.plan.pages[index];
  return [
    { heading: t('menu.page', { n: index + 1, title: plan ? pageTitle(t, plan) : '' }) },
    { label: t('menu.goTo'), onSelect: () => jumpToPage(index) },
    { label: t('menu.insertPage'), icon: <FilePlus2 size={14} />, onSelect: () => insertPageAfter(doc, index) },
    { label: t('export.svg'), onSelect: () => exportPageSvg(doc, index, `${fileBase(useStore.getState().design!)}-p${index + 1}.svg`) },
  ];
}
