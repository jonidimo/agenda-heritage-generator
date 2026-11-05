/** Panel derecho: elemento seleccionado (valores exactos), elementos propios y verificación previa. */
import { PROP_DEFAULTS, PROP_RANGES, TEXT_ROLES } from '@core/design/customBlocks';
import type { AgendaDocument } from '@core/document';
import { OVERRIDE_DEFAULTS, WATERMARK_DEFAULTS, type CustomBlock, type WatermarkPlacement } from '@core/design/schema';
import { getAtPath } from '@core/util/path';
import { isProblem, type Block, type PageModel, type PageWarning, type Prim } from '@core/layout/prims';
import type { AlignMode } from '@core/layout/align';
import type { WritingStyle } from '@core/design/themes';
import {
  AlertTriangle,
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  CheckCircle2,
  Crosshair,
  EyeOff,
  Grid3x3,
  Image as ImageIcon,
  Info,
  Minus,
  Play,
  RotateCcw,
  Scaling,
  Square,
  StretchHorizontal,
  Trash2,
  Type,
} from 'lucide-react';
import { pageLinks, safeUrl } from '@core/document/links';
import { ElementFields, ELEMENT_ICONS, type MonthChoice } from './ElementFields';
import { LayersPanel, StackFields } from './LayersPanel';
import { ELEMENT_KINDS, ELEMENT_LABELS, elementProps, elementSize, isElementKind, type ElementKind } from '../state/elements';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { blockLabel, warningText } from '../i18n/messages';
import { sectionName, uiText, useT } from '../i18n/ui';
import { IMAGE_ACCEPT, uploadOne } from '../state/uploads';
import {
  addCustomBlock,
  alignBlocks,
  centerBlocks,
  currentBlockLink,
  linkScope,
  currentOverride,
  distributeBlocks,
  hideBlock,
  hideBlocks,
  matchScale,
  overrideRecipe,
  pageStyleOf,
  pageStyleRecipe,
  patchOverride,
  resetBlock,
  resetBlocks,
  resetPageStyle,
  resizeBox,
  setBlockLink,
  setPageStyle,
  tidyBlocks,
  typeMirrored,
  type AlignRef,
} from '../state/actions';
import { useDocument } from '../state/doc';
import { scrub, type Scrubbing } from '../state/scrub';
import { useStore, type Recipe } from '../state/store';
import { Button, ColorInput, Field, NumberInput, Segmented, Select, Slider, TextArea, TextInput, Toggle } from './ui';
import { jumpToPage } from '../state/navigation';
import { reflowable } from '@core/layout/handles';
import { BlockStyleFields } from './BlockStyleFields';
import { MIN_BOX } from '@core/layout/box';
import { parseFontSpec } from '@core/text/fonts';
import { normalizeColor } from '@core/util/color';
import type { TextRole } from '@core/layout/context';
import { reveal } from '../state/reveal';
import { resources } from '../state/resources';
import { FontRow, useFamilies } from './FontPicker';

export function Inspector({ doc }: { doc: AgendaDocument }) {
  const t = useT();
  const design = useStore((s) => s.design)!;
  const selection = useStore((s) => s.selection);
  const selectedIds = useStore((s) => s.selectedIds);
  const scope = useStore((s) => s.scope);
  const setScope = useStore((s) => s.setScope);
  const select = useStore((s) => s.select);
  const pageIndex = useStore((s) => Math.min(s.pageIndex, doc.pageCount - 1));
  const selPageIndex = selection ? doc.indexOfKey(selection.pageKey) : -1;
  const page: PageModel = doc.page(selPageIndex >= 0 ? selPageIndex : pageIndex);
  const block = selection ? page.blocks.find((b) => b.id === selection.blockId) : undefined;
  const group = selection ? page.blocks.filter((b) => selectedIds.includes(b.id)) : [];
  const [tab, setTab] = useState<'element' | 'layers'>('element');

  // Un elemento que solo tiene una clase de línea (un filete, un ornamento): si el panel de Estilo está
  // abierto, se desplaza solo al estilo de esa línea, para no buscarlo (sin quitarle el foco al lienzo).
  const autoReveal = useStore((s) => s.autoReveal);
  const sidebarPanel = useStore((s) => (s.sidebarOpen ? s.panel : null));
  const lineUse = block && group.length <= 1 && block.uses?.length === 1 && !block.prims.some((p) => p.t === 'text') ? block.uses[0] : undefined;
  const revealKey = lineUse ? `${page.key}:${block!.id}` : '';
  useEffect(() => {
    if (!autoReveal || !lineUse || sidebarPanel !== 'style') return;
    void reveal({ selector: `[data-reveal="line.${lineUse}"]`, focus: false });
    // Solo cuando se elige otro elemento (o se abre el panel de Estilo), no con cada cambio del diseño.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealKey, sidebarPanel]);

  const addCustom = (kind: CustomBlock['kind']): void =>
    void addCustomBlock(page, kind, { text: t('insp.addText'), image: t('insp.addImage'), rect: t('insp.addRect'), lines: t('insp.addLines'), dots: t('insp.addDots') }, selection?.pageKey === page.key ? scope : 'type');

  const addElement = (kind: ElementKind): void =>
    void addCustomBlock(page, kind, { text: '', image: '', rect: '', lines: '', dots: '' }, selection?.pageKey === page.key ? scope : 'type', undefined, undefined, {
      size: elementSize(kind, page.content.w),
      props: elementProps(kind, t),
    });

  const sideLabel = page.side === 'recto' ? t('insp.recto') : t('insp.verso');
  const header = (
    <>
      <div className="border-b border-line px-3 py-2 text-[11.5px] text-ink-soft">{t('insp.page', { n: page.index + 1, type: sectionName(t, page.type), side: sideLabel })}</div>
      <div className="border-b border-line px-3 py-1.5">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'element', label: t('insp.tab.element') },
            { value: 'layers', label: t('insp.tab.layers') },
          ]}
        />
      </div>
    </>
  );
  if (tab === 'layers') {
    return (
      <div className="flex h-full flex-col" data-inspector="">
        {header}
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3 py-2">
          <LayersPanel doc={doc} page={page} />
        </div>
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col" data-inspector="">
      {header}
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3 py-2">
        <h3 className="mb-1 text-[11px] font-extrabold tracking-[0.08em] uppercase">{t('insp.title')}</h3>
        {!block && <p className="text-[12px] leading-snug text-ink-soft">{t('insp.none')}</p>}
        {block && group.length > 1 && <MultiFields page={page} blocks={group} primary={block} scope={scope} setScope={setScope} />}
        {block && group.length <= 1 && (
          <div>
            <p className="mb-2 text-[13px] font-semibold">{blockLabel(t, block.id, block.label)}</p>
            {!block.editable && <p className="text-[12px] text-ink-soft">{t('insp.locked')}</p>}
            {block.editable && block.role === 'writing' && <WritingFields page={page} scope={scope} setScope={setScope} />}
            {block.editable && block.role === 'watermark' && <WatermarkFields id={block.id.slice(3)} />}
            {block.editable && block.role === 'custom' && <CustomFields id={block.id.slice(7)} theme={doc.ctx.theme} block={block} months={doc.ctx.cal.months.map((m) => ({ value: m.key, label: `${m.name} ${m.y}` }))} />}
            {block.editable && block.role !== 'watermark' && block.role !== 'custom' && (
              <>
                <BlockFields page={page} blockId={block.id} scope={scope} setScope={setScope} />
                <BlockStyleFields page={page} block={block} scope={scope} />
              </>
            )}
            {block.editable && block.role !== 'watermark' && <StackFields page={page} block={block} scope={scope} />}
            <TextRoleLinks block={block} />
            <LineUseLinks block={block} />
            {block.editable && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Button
                  variant="outline"
                  onClick={() => {
                    hideBlock(page, block, scope);
                    select(null);
                  }}
                >
                  {block.role === 'custom' ? <Trash2 size={14} /> : <EyeOff size={14} />} {block.role === 'custom' ? t('insp.delete') : t('insp.hide')}
                </Button>
                {block.role !== 'watermark' && block.role !== 'custom' && (
                  <Button variant="ghost" onClick={() => resetBlock(page, block.id, scope)}>
                    <RotateCcw size={14} /> {t('insp.reset')}
                  </Button>
                )}
              </div>
            )}
            <LinkFields doc={doc} page={page} block={block} scope={scope} setScope={setScope} showScope={!(block.editable && block.role !== 'watermark' && block.role !== 'custom')} />
            <p className="mt-3 text-[11px] text-ink-soft">{t('insp.keys')}</p>
            <p className="mt-1 text-[11px] text-ink-soft">{t('multi.hint')}</p>
          </div>
        )}
        <div className="mt-4 border-t border-line pt-3">
          <h3 className="mb-1.5 text-[11px] font-extrabold tracking-[0.08em] uppercase">{t('insp.add')}</h3>
          <div className="flex flex-wrap gap-1.5">
            <Button onClick={() => addCustom('text')}>
              <Type size={14} /> {t('insp.addText')}
            </Button>
            <Button onClick={() => addCustom('image')} disabled={design.assets.length === 0}>
              <ImageIcon size={14} /> {t('insp.addImage')}
            </Button>
            <Button onClick={() => addCustom('lines')}>
              <StretchHorizontal size={14} /> {t('insp.addLines')}
            </Button>
            <Button onClick={() => addCustom('dots')}>
              <Minus size={14} /> {t('insp.addDots')}
            </Button>
            <Button onClick={() => addCustom('rect')}>
              <Square size={14} /> {t('insp.addRect')}
            </Button>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5" data-testid="add-elements">
            {ELEMENT_KINDS.map((kind) => (
              <Button key={kind} onClick={() => addElement(kind)}>
                {ELEMENT_ICONS[kind]} {t(ELEMENT_LABELS[kind])}
              </Button>
            ))}
          </div>
        </div>
        <Preflight doc={doc} />
      </div>
    </div>
  );
}

/** Varios elementos: alinear, repartir, ordenar en cuadrícula, igualar escala, restablecer u ocultar. */
function MultiFields({ page, blocks, primary, scope, setScope }: { page: PageModel; blocks: Block[]; primary: Block; scope: 'type' | 'page'; setScope: (s: 'type' | 'page') => void }) {
  const t = useT();
  const select = useStore((s) => s.select);
  const [ref, setRef] = useState<AlignRef>('selection');
  const editable = blocks.filter((b) => b.editable);
  const align = (mode: AlignMode) => () => alignBlocks(page, editable, mode, ref, scope);
  const tool = (label: string, icon: ReactNode, onClick: () => void, disabled = false) => (
    <button type="button" title={label} aria-label={label} disabled={disabled} onClick={onClick} className="flex h-8 w-8 items-center justify-center rounded-md border border-line bg-white text-ink hover:bg-paper disabled:opacity-40">
      {icon}
    </button>
  );
  return (
    <div>
      <p className="mb-2 text-[13px] font-semibold">{t('multi.count', { n: blocks.length })}</p>
      {page.type !== 'custom' && (
        <Field label={t('insp.scope')} group>
          <Segmented value={scope} onChange={setScope} options={[{ value: 'type', label: t('insp.scopeType') }, { value: 'page', label: t('insp.scopePage') }]} />
        </Field>
      )}
      <Field label={t('align.ref')} group>
        <Segmented value={ref} onChange={setRef} options={[{ value: 'selection', label: t('align.refSelection') }, { value: 'margins', label: t('align.refMargins') }, { value: 'page', label: t('align.refPage') }]} />
      </Field>
      <div className="mb-2 flex flex-wrap gap-1">
        {tool(t('align.left'), <AlignStartVertical size={16} />, align('left'))}
        {tool(t('align.centerH'), <AlignCenterVertical size={16} />, align('centerH'))}
        {tool(t('align.right'), <AlignEndVertical size={16} />, align('right'))}
        {tool(t('align.top'), <AlignStartHorizontal size={16} />, align('top'))}
        {tool(t('align.middle'), <AlignCenterHorizontal size={16} />, align('middle'))}
        {tool(t('align.bottom'), <AlignEndHorizontal size={16} />, align('bottom'))}
        {tool(t('align.distributeH'), <AlignHorizontalDistributeCenter size={16} />, () => distributeBlocks(page, editable, 'x', scope), editable.length < 3)}
        {tool(t('align.distributeV'), <AlignVerticalDistributeCenter size={16} />, () => distributeBlocks(page, editable, 'y', scope), editable.length < 3)}
      </div>
      <div className="grid gap-1.5">
        <Button onClick={() => tidyBlocks(page, editable, scope)}>
          <Grid3x3 size={14} /> {t('align.tidy')}
        </Button>
        <p className="-mt-0.5 text-[11px] leading-snug text-ink-soft">{t('align.tidyHint')}</p>
        <Button onClick={() => centerBlocks(page, editable, ref === 'page' ? 'page' : 'margins', 'x', scope)}>
          <Crosshair size={14} /> {t('align.centerMargins')}
        </Button>
        <Button onClick={() => matchScale(page, editable, primary, scope)}>
          <Scaling size={14} /> {t('align.matchScale', { name: blockLabel(t, primary.id, primary.label) })}
        </Button>
        <div className="flex flex-wrap gap-1.5">
          <Button variant="ghost" onClick={() => resetBlocks(page, editable.map((b) => b.id), scope)}>
            <RotateCcw size={14} /> {t('multi.reset')}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              hideBlocks(page, editable, scope);
              select(null);
            }}
          >
            <EyeOff size={14} /> {t('multi.hide')}
          </Button>
          <Button variant="ghost" onClick={() => select(null)}>
            {t('multi.deselect')}
          </Button>
        </div>
      </div>
      <p className="mt-3 text-[11px] text-ink-soft">{t('multi.hint')}</p>
    </div>
  );
}

/** Renglones, puntos o cuadrícula de este tipo de página (o de esta página): estilo, pasos, tamaño y grosor. */
function WritingFields({ page, scope, setScope }: { page: PageModel; scope: 'type' | 'page'; setScope: (s: 'type' | 'page') => void }) {
  const t = useT();
  const design = useStore((s) => s.design)!;
  const { doc } = useDocument();
  const theme = doc?.ctx.theme;
  const tokens = pageStyleOf(design, page, scope) as { writing?: { style?: WritingStyle; pitch?: number }; dots?: { pitch?: number; pitchY?: number; radius?: number }; strokes?: { hair?: number } };
  const style = tokens.writing?.style ?? theme?.writing.style ?? 'lines';
  const set = (path: string[], v: unknown): void => setPageStyle(page, scope, path, v, `ps:${page.type}:${path.join('.')}`);
  /** Un deslizador del estilo de escritura: se ve en el lienzo mientras se arrastra y se confirma una vez al soltar. */
  const drag = (path: string[]): Scrubbing<number> => scrub<number>((v) => pageStyleRecipe(page, scope, path, v), `ps:${page.type}:${path.join('.')}`);
  // Un valor propio de este tipo (o de esta página) se restablece quitándolo: vuelve a salir del tema.
  const reset = (path: string[]): { modified: boolean; onReset: () => void } => ({ modified: getAtPath(tokens, path) !== undefined, onReset: () => set(path, undefined) });
  return (
    <div className="mb-2 rounded-md border border-line bg-white/60 p-2">
      <h4 className="mb-1 text-[11px] font-extrabold tracking-[0.08em] uppercase">{t('writing.title')}</h4>
      {page.type !== 'custom' && (
        <Field label={t('insp.scope')} group>
          <Segmented value={scope} onChange={setScope} options={[{ value: 'type', label: t('insp.scopeType') }, { value: 'page', label: t('insp.scopePage') }]} />
        </Field>
      )}
      <Field label={t('writing.style')} group>
        <Segmented value={style} onChange={(v) => set(['writing', 'style'], v)} options={(['lines', 'dots', 'grid', 'blank'] as const).map((v) => ({ value: v, label: t(`val.${v}`) }))} />
      </Field>
      {style === 'lines' && <Slider label={t('writing.pitch')} value={tokens.writing?.pitch ?? theme?.writing.pitch ?? 6} min={3} max={15} step={0.1} {...drag(['writing', 'pitch'])} {...reset(['writing', 'pitch'])} />}
      {style === 'lines' && <Slider label={t('writing.lineWeight')} value={(tokens.strokes?.hair ?? theme?.strokes.hair ?? 0.3)} min={0.1} max={1.5} step={0.05} {...drag(['strokes', 'hair'])} {...reset(['strokes', 'hair'])} />}
      {(style === 'dots' || style === 'grid') && <Slider label={t('writing.dotPitchX')} value={tokens.dots?.pitch ?? theme?.dots.pitch ?? 5} min={2} max={15} step={0.1} {...drag(['dots', 'pitch'])} {...reset(['dots', 'pitch'])} />}
      {style === 'dots' && <Slider label={t('writing.dotPitchY')} value={tokens.dots?.pitchY ?? theme?.dots.pitchY ?? 0} min={0} max={15} step={0.1} {...drag(['dots', 'pitchY'])} {...reset(['dots', 'pitchY'])} />}
      {style === 'dots' && <Slider label={t('writing.dotSize')} value={tokens.dots?.radius ?? theme?.dots.radius ?? 0.5} min={0.1} max={2.5} step={0.05} {...drag(['dots', 'radius'])} {...reset(['dots', 'radius'])} />}
      <p className="text-[11px] leading-snug text-ink-soft">{t('writing.hint')}</p>
      <Button variant="ghost" onClick={() => resetPageStyle(page, scope)}>
        <RotateCcw size={14} /> {t('writing.reset')}
      </Button>
    </div>
  );
}

function BlockFields({ page, blockId, scope, setScope }: { page: PageModel; blockId: string; scope: 'type' | 'page'; setScope: (s: 'type' | 'page') => void }) {
  const t = useT();
  const design = useStore((s) => s.design)!;
  const level: 'type' | 'page' = page.type === 'custom' ? 'page' : scope;
  const typeO = page.type === 'custom' ? undefined : currentOverride(design, page, blockId, 'type');
  const pageO = currentOverride(design, page, blockId, 'page');
  // En páginas izquierdas de tipos espejados, el ajuste «por tipo» se muestra tal como actúa en esta página.
  const mirrored = page.type !== 'custom' && typeMirrored(page);
  // Lo que se muestra es lo que rige en esta página: sin ajuste propio, la página hereda el de su tipo.
  const inherited = level === 'page' && !pageO;
  const o = level === 'page' ? (pageO ?? typeO) : typeO;
  const showFlipped = mirrored && (level === 'type' || inherited);
  // En una página izquierda con ajuste «por tipo», el borde izquierdo es -(dx + dw) (ver `adjuster`).
  const v = { dx: showFlipped ? -((o?.dx ?? 0) + (o?.dw ?? 0)) : (o?.dx ?? 0), dy: o?.dy ?? 0, scale: o?.scale ?? 1, scaleY: o?.scaleY ?? null, deform: o?.deform ?? false, rotation: o?.rotation ?? 0, opacity: o?.opacity ?? 1 };
  const flipOnWrite = mirrored && level === 'type';
  // Los bloques que su sección maqueta dentro de una caja también tienen ancho y alto.
  const block = page.blocks.find((b) => b.id === blockId);
  const box = block && reflowable(block) ? block.box : undefined;
  const set = (patch: Partial<typeof v>, key: string): void =>
    patchOverride(page, blockId, scope, patch.dx !== undefined && flipOnWrite ? { ...patch, dx: -patch.dx - (o?.dw ?? 0) } : patch, `insp:${blockId}:${key}`);
  /** Un deslizador del ajuste (escala, giro, opacidad): vista previa mientras se arrastra, una confirmación al soltar. */
  const drag = (key: 'scale' | 'rotation' | 'opacity'): Scrubbing<number> => scrub<number>((x) => overrideRecipe(page, blockId, scope, { [key]: x }), `insp:${blockId}:${key}`);
  return (
    <div>
      {page.type !== 'custom' && (
        <Field label={t('insp.scope')} group>
          <Segmented
            value={scope}
            onChange={setScope}
            options={[
              { value: 'type', label: t('insp.scopeType') },
              { value: 'page', label: t('insp.scopePage') },
            ]}
          />
        </Field>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Field label={t('insp.dx')}>
          <NumberInput value={v.dx} step={0.5} onChange={(x) => set({ dx: x }, 'dx')} />
        </Field>
        <Field label={t('insp.dy')}>
          <NumberInput value={v.dy} step={0.5} onChange={(x) => set({ dy: x }, 'dy')} />
        </Field>
      </div>
      {box && (
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('insp.boxW')}>
            <NumberInput value={box.w} step={0.5} min={MIN_BOX} onChange={(x) => resizeBox(page, block!, { ...box, w: x }, scope, `insp:${blockId}:w`)} />
          </Field>
          <Field label={t('insp.boxH')}>
            <NumberInput value={box.h} step={0.5} min={MIN_BOX} onChange={(x) => resizeBox(page, block!, { ...box, h: x }, scope, `insp:${blockId}:h`)} />
          </Field>
        </div>
      )}
      {level === 'type' && mirrored && <p className="mb-1 text-[11px] leading-snug text-ink-soft">{t('insp.mirrored')}</p>}
      {level === 'type' && pageO && (
        <p className="mb-1 text-[11px] leading-snug text-warn">
          {t('insp.pageWins')}{' '}
          <button type="button" className="font-semibold underline" onClick={() => setScope('page')}>
            {t('insp.editThisPage')}
          </button>
        </p>
      )}
      {inherited && typeO && <p className="mb-1 text-[11px] leading-snug text-ink-soft">{t('insp.inherits')}</p>}
      <Toggle label={t('insp.deform')} hint={t('insp.deformHint')} checked={v.deform} onChange={(on) => patchOverride(page, blockId, scope, on ? { deform: true } : { deform: false, scaleY: null }, `insp:${blockId}:deform`)} />
      <Slider label={v.deform ? t('insp.scaleX') : t('insp.scale')} value={v.scale} min={0.2} max={3} step={0.01} {...drag('scale')} defaultValue={OVERRIDE_DEFAULTS.scale} />
      {v.deform && <Slider label={t('insp.scaleY')} value={v.scaleY ?? v.scale} min={0.2} max={3} step={0.01} {...scrub<number>((x) => overrideRecipe(page, blockId, scope, { scaleY: x }), `insp:${blockId}:scaleY`)} onReset={() => patchOverride(page, blockId, scope, { scaleY: null }, `insp:${blockId}:scaleY`)} modified={v.scaleY !== null && Math.abs(v.scaleY - v.scale) > 1e-4} />}
      <Slider label={t('insp.rotation')} value={v.rotation} min={-180} max={180} step={1} {...drag('rotation')} defaultValue={OVERRIDE_DEFAULTS.rotation} />
      <Slider label={t('insp.opacity')} value={v.opacity} min={0} max={1} step={0.05} {...drag('opacity')} defaultValue={OVERRIDE_DEFAULTS.opacity} />
    </div>
  );
}

/** Receta que cambia un ajuste de una marca de agua. */
function watermarkRecipe<K extends keyof WatermarkPlacement>(id: string, k: K, v: WatermarkPlacement[K]): Recipe {
  return (d) => {
    const w = d.watermarks.find((x) => x.id === id);
    if (w) w[k] = v;
  };
}

export function WatermarkFields({ id }: { id: string }) {
  const t = useT();
  const wm = useStore((s) => s.design?.watermarks.find((w) => w.id === id));
  const assets = useStore((s) => s.design?.assets ?? []);
  const update = useStore((s) => s.update);
  const select = useStore((s) => s.select);
  if (!wm) return null;
  const set = <K extends keyof typeof wm>(k: K, v: (typeof wm)[K]): void => update(watermarkRecipe(id, k, v), `wm:${id}:${String(k)}`);
  /** Un deslizador de la marca de agua: vista previa mientras se arrastra, una confirmación al soltar. */
  const drag = (k: 'width' | 'opacity' | 'rotation' | 'minStrokePt'): Scrubbing<number> => scrub<number>((v) => watermarkRecipe(id, k, v), `wm:${id}:${k}`);
  /** Sube una imagen nueva y la usa en esta marca de agua. */
  const uploadAndUse = async (): Promise<void> => {
    const id = await uploadOne('image/*,.svg', (name) => t('assets.unsupported', { name }));
    if (id) set('assetId', id);
  };
  return (
    <div>
      <Field label={t('wm.image')}>
        <Select value={wm.assetId} onChange={(v) => set('assetId', v)} options={assets.filter((a) => a.kind !== 'pdf').map((a) => ({ value: a.id, label: a.name }))} />
      </Field>
      <div className="mb-1 flex flex-wrap gap-1.5">
        <Button onClick={() => void uploadAndUse()}>
          <ImageIcon size={14} /> {t('wm.upload')}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            update((d) => void (d.watermarks = d.watermarks.filter((w) => w.id !== id)));
            select(null);
          }}
        >
          <Trash2 size={14} /> {t('wm.delete')}
        </Button>
      </div>
      {wm.excludePages.length > 0 && (
        <p className="mb-1 text-[11px] leading-snug text-ink-soft">
          {t('wm.hiddenPages', { n: wm.excludePages.length })}{' '}
          <button type="button" className="font-semibold text-accent underline" onClick={() => set('excludePages', [])}>
            {t('wm.showAgain')}
          </button>
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Field label={t('wm.hAnchor')}>
          <Select
            value={wm.hAnchor}
            onChange={(v) => set('hAnchor', v)}
            options={(['outer', 'inner', 'left', 'right', 'center'] as const).map((v) => ({ value: v, label: t(`wm.${v}`) }))}
          />
        </Field>
        <Field label={t('wm.vAnchor')}>
          <Select value={wm.vAnchor} onChange={(v) => set('vAnchor', v)} options={(['top', 'middle', 'bottom'] as const).map((v) => ({ value: v, label: t(`wm.${v}`) }))} />
        </Field>
        <Field label={t('wm.dx')}>
          <NumberInput value={wm.dx} step={0.5} onChange={(v) => set('dx', v)} />
        </Field>
        <Field label={t('wm.dy')}>
          <NumberInput value={wm.dy} step={0.5} onChange={(v) => set('dy', v)} />
        </Field>
      </div>
      <Slider label={t('wm.width')} value={wm.width} min={2} max={200} step={0.5} {...drag('width')} defaultValue={WATERMARK_DEFAULTS.width} />
      <Slider label={t('wm.opacity')} value={wm.opacity} min={0.05} max={1} step={0.05} {...drag('opacity')} defaultValue={WATERMARK_DEFAULTS.opacity} />
      <Slider label={t('wm.rotation')} value={wm.rotation} min={-180} max={180} step={1} {...drag('rotation')} defaultValue={WATERMARK_DEFAULTS.rotation} />
      <Slider label={t('wm.minStroke')} value={wm.minStrokePt} min={0} max={1.5} step={0.05} {...drag('minStrokePt')} defaultValue={WATERMARK_DEFAULTS.minStrokePt} />
      <Toggle label={t('wm.mirror')} checked={wm.mirrorOnVerso} onChange={(v) => set('mirrorOnVerso', v)} />
      <Field label={t('wm.layer')}>
        <Select value={wm.layer} onChange={(v) => set('layer', v)} options={[{ value: 'above', label: t('wm.above') }, { value: 'below', label: t('wm.below') }]} />
      </Field>
    </div>
  );
}

/** Receta que cambia (o quita, con `undefined`) una propiedad de un elemento propio. */
function propRecipe(id: string, k: string, v: unknown): Recipe {
  return (d) => {
    const c = d.customBlocks.find((x) => x.id === id);
    if (!c) return;
    const { [k]: _removed, ...rest } = c.props;
    c.props = v === undefined ? rest : { ...rest, [k]: v };
  };
}

function CustomFields({ id, theme, block, months }: { id: string; theme: AgendaDocument['ctx']['theme']; block: Block; months: readonly MonthChoice[] }) {
  const t = useT();
  const cb = useStore((s) => s.design?.customBlocks.find((c) => c.id === id));
  const assets = useStore((s) => s.design?.assets ?? []);
  const update = useStore((s) => s.update);
  if (!cb) return null;
  const set = (patch: Partial<CustomBlock>, key: string): void =>
    update((d) => {
      const c = d.customBlocks.find((x) => x.id === id);
      if (c) Object.assign(c, patch);
    }, `cb:${id}:${key}`);
  // Con `undefined` la propiedad se quita: el elemento vuelve al valor que le da el tema.
  const setProp = (k: string, v: unknown): void => update(propRecipe(id, k, v), `cb:${id}:p:${k}`);
  /** Un deslizador de una propiedad del elemento: vista previa mientras se arrastra, una confirmación al soltar. */
  const dragProp = <T,>(k: string): Scrubbing<T> => scrub<T>((v) => propRecipe(id, k, v), `cb:${id}:p:${k}`);
  const p = cb.props as Record<string, unknown>;
  // El paso de los renglones, los puntos y la cuadrícula, cuando el elemento no tiene uno propio.
  // Con «ajustar», la letra puede dibujarse más chica que el cuerpo pedido: se dice a cuánto.
  const asked = Number(p.size ?? theme.sizes.body);
  const drawn = firstTextSize(block.prims);
  const fitHint = cb.kind === 'text' && p.fit !== false && drawn !== null && drawn < asked - 0.05 ? String(Math.round(drawn * 10) / 10) : '';
  const pitchDefault = cb.kind === 'dots' ? theme.dots.pitch : cb.kind === 'grid' ? PROP_DEFAULTS.gridPitch : theme.writing.pitch;
  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t('insp.x')}>
          <NumberInput value={cb.x} step={0.5} onChange={(v) => set({ x: v }, 'x')} />
        </Field>
        <Field label={t('insp.y')}>
          <NumberInput value={cb.y} step={0.5} onChange={(v) => set({ y: v }, 'y')} />
        </Field>
        <Field label="W (mm)">
          <NumberInput value={cb.w} step={0.5} min={1} onChange={(v) => set({ w: v }, 'w')} />
        </Field>
        {!(cb.kind === 'text' && p.autoHeight === true) && (
          <Field label="H (mm)">
            <NumberInput value={cb.h} step={0.5} min={1} onChange={(v) => set({ h: v }, 'h')} />
          </Field>
        )}
      </div>
      <Toggle label={t('wm.mirror')} checked={cb.mirror} onChange={(v) => set({ mirror: v }, 'mirror')} />
      {cb.kind === 'text' && (
        <>
          <Field label={t('insp.text')} hint={t('insp.textHelp')}>
            <TextArea value={String(p.text ?? '')} onChange={(v) => setProp('text', v)} rows={3} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('insp.role')}>
              <Select
                value={String(p.role ?? 'body')}
                onChange={(v) => setProp('role', v)}
                options={TEXT_ROLES.map((r) => ({ value: r, label: t(`role.${r}`) }))}
              />
            </Field>
            <Field label={t('insp.size')}>
              <NumberInput value={Number(p.size ?? theme.sizes.body)} step={0.5} min={PROP_RANGES.textSize.min} max={PROP_RANGES.textSize.max} onChange={(v) => setProp('size', v)} />
            </Field>
          </div>
          <Field label={t('insp.align')} group>
            <Segmented
              value={String(p.align ?? 'left') as 'left'}
              onChange={(v) => setProp('align', v)}
              options={[
                { value: 'left', label: t('insp.left') },
                { value: 'center' as 'left', label: t('insp.centerA') },
                { value: 'right' as 'left', label: t('insp.right') },
              ]}
            />
          </Field>
          <Toggle label={t('insp.upper')} checked={Boolean(p.upper)} onChange={(v) => setProp('upper', v)} />
          <Toggle label={t('insp.autoHeight')} checked={p.autoHeight === true} onChange={(v) => setProp('autoHeight', v ? true : undefined)} />
          <Toggle
            label={t('insp.fitBox')}
            hint={fitHint ? t('insp.fitDrawn', { pt: fitHint }) : t('insp.fitHint')}
            checked={p.fit !== false}
            onChange={(v) => setProp('fit', v ? undefined : false)}
          />
          <CustomTextStyle p={p} setProp={setProp} dragColor={dragProp<string>('color')} />
        </>
      )}
      {cb.kind === 'drawing' && (
        <>
          <p className="mb-1 text-[11.5px] leading-snug text-ink-soft">
            {(() => {
              const from = p.source as { block?: string; label?: string } | undefined;
              return from?.block ? `${t('insp.drawingFrom', { name: blockLabel(t, from.block, from.label ?? from.block) })} · ` : '';
            })()}
            {t('insp.drawingHint')}
          </p>
          <Slider label={t('insp.opacity')} value={Number(p.opacity ?? 1)} min={0.05} max={1} step={0.05} {...dragProp<number>('opacity')} defaultValue={1} />
          <Toggle label={t('insp.drawingScale')} checked={p.mode === 'scale'} onChange={(v) => setProp('mode', v ? 'scale' : 'stretch')} />
          <div className="mb-1">
            <Button
              variant="outline"
              onClick={() => {
                const w0 = Number(p.w0);
                const h0 = Number(p.h0);
                if (w0 > 0 && h0 > 0) set({ h: Math.round((cb.w * h0) / w0 * 100) / 100 }, 'aspect');
              }}
            >
              {t('insp.keepAspect')}
            </Button>
          </div>
        </>
      )}
      {cb.kind === 'image' && (
        <>
          <Field label={t('cover.image')}>
            <Select value={String(p.assetId ?? '')} onChange={(v) => setProp('assetId', v)} options={assets.filter((a) => a.kind !== 'font').map((a) => ({ value: a.id, label: a.name }))} />
          </Field>
          <div className="mb-1">
            <Button
              onClick={() =>
                void uploadOne(IMAGE_ACCEPT, (name) => t('assets.unsupported', { name })).then((id) => {
                  if (id) setProp('assetId', id);
                })
              }
            >
              <ImageIcon size={14} /> {t('insp.uploadImage')}
            </Button>
          </div>
          <Field label={t('cp.fit')}>
            <Select
              value={String(p.fit ?? 'contain') as 'contain'}
              onChange={(v) => setProp('fit', v)}
              options={[
                { value: 'contain', label: t('cp.fitContain') },
                { value: 'cover' as 'contain', label: t('cp.fitCover') },
                { value: 'fill' as 'contain', label: t('cp.fitFill') },
              ]}
            />
          </Field>
          <Slider label={t('insp.opacity')} value={Number(p.opacity ?? PROP_DEFAULTS.opacity)} min={PROP_RANGES.opacity.min} max={PROP_RANGES.opacity.max} step={0.05} {...dragProp('opacity')} defaultValue={PROP_DEFAULTS.opacity} />
        </>
      )}
      {isElementKind(cb.kind) && <ElementFields kind={cb.kind} props={p} setProp={setProp} months={months} />}
      {(cb.kind === 'lines' || cb.kind === 'dots' || cb.kind === 'grid') && (
        <Slider label={t('style.pitch')} value={Number(p.pitch ?? pitchDefault)} min={PROP_RANGES.pitch.min} max={PROP_RANGES.pitch.max} step={0.1} {...dragProp('pitch')} modified={p.pitch !== undefined} onReset={() => setProp('pitch', undefined)} />
      )}
    </div>
  );
}

/**
 * Enlaces del elemento en el PDF de páginas: adónde lleva hoy (automáticos o a mano) y elegir otro
 * destino (una página, una dirección web) o ninguno, para su tipo de página o solo para esta.
 */
function LinkFields(props: { doc: AgendaDocument; page: PageModel; block: Block; scope: 'type' | 'page'; setScope: (s: 'type' | 'page') => void; showScope: boolean }) {
  const { doc, page, block, scope, setScope } = props;
  const t = useT();
  const design = useStore((s) => s.design)!;
  const showLinks = useStore((s) => s.showLinks);
  const setShowLinks = useStore((s) => s.setShowLinks);
  // Un elemento propio de una sola página (o una página propia) se enlaza solo en esa página.
  const level: 'type' | 'page' = linkScope(design, page, block.id, scope);
  // Zona elegida en la página (un día, un mes…): se edita su destino; vacía, el elemento entero.
  const pickedArea = useStore((s) => s.linkArea);
  const links = doc.links(page.index).filter((l) => l.blockId === block.id);
  const area = links.some((l) => l.area === pickedArea) || design.links.blocks.some((l) => l.blockId === block.id && l.area === pickedArea) ? pickedArea : '';
  const setLinkArea = useStore((s) => s.setLinkArea);
  const own = currentBlockLink(design, page, block.id, level, area);
  const byType = level === 'page' ? currentBlockLink(design, page, block.id, 'type', area) : undefined;
  const shown = own ?? byType;
  const mode = shown?.mode ?? 'auto';
  // Un renglón por destino (los siete días de una semana llevan a la misma página).
  const groups = [...links.reduce((m, l) => m.set(l.page ?? l.url ?? '', { l, n: (m.get(l.page ?? l.url ?? '')?.n ?? 0) + 1 }), new Map<number | string, { l: (typeof links)[number]; n: number }>()).values()];
  // Cuántos enlaces automáticos funcionan de verdad en esta página (sin los que no llevan a ningún lado).
  const autoCount = useMemo(() => pageLinks(page, doc.linkResolver, { ...design.links, enabled: true, blocks: [] }).links.filter((l) => l.blockId === block.id).length, [page, doc, design.links, block.id]);
  const pages = useMemo(() => doc.plan.pages.filter((p) => p.type !== 'filler').map((p) => ({ value: p.key, label: `${p.index + 1} · ${doc.pageLabel(p.index)}` })), [doc]);
  const home = doc.plan.pages.find((p) => p.type === 'toc' && p.key !== page.key) ?? doc.plan.pages.find((p) => p.type === 'yearOverview' && p.key !== page.key) ?? doc.plan.pages.find((p) => p.key !== page.key);
  const set = (link: Parameters<typeof setBlockLink>[3]): void => setBlockLink(page, block.id, level, link, `link:${block.id}:${area}:${link.mode}`, area);
  // Zonas del elemento que tienen un destino elegido a mano.
  const edited = design.links.blocks.filter((l) => l.blockId === block.id && l.area !== '' && l.pageType === page.type && (l.pageKey === null || l.pageKey === page.key));
  const urlOk = mode !== 'url' || safeUrl(shown?.url ?? '') !== null;
  const label = (l: (typeof links)[number]): string => (l.page !== undefined ? `${doc.pageLabel(l.page)} · ${t('nav.page', { n: l.page + 1 })}` : (l.url ?? ''));
  return (
    <div className="mt-3 border-t border-line pt-2" data-testid="link-fields" data-reveal="links">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h4 className="text-[11px] font-extrabold tracking-[0.08em] uppercase">{t('link.title')}</h4>
        <button type="button" className="text-[11.5px] text-accent underline" onClick={() => setShowLinks(!showLinks)}>
          {showLinks ? t('link.hide') : t('link.show')}
        </button>
      </div>
      {!design.links.enabled && <p className="mb-1 text-[11px] leading-snug text-warn">{t('link.allOff')}</p>}
      {area !== '' && (
        <div className="mb-1 flex items-center justify-between gap-2 rounded-md bg-accent/10 px-2 py-1 text-[11.5px]">
          <span className="min-w-0 truncate font-semibold" title={area}>
            {t('link.zoneOf', { name: area })}
          </span>
          <button type="button" className="shrink-0 text-accent underline" onClick={() => setLinkArea('')}>
            {t('link.zoneAll')}
          </button>
        </div>
      )}
      {props.showScope && level === scope && page.type !== 'custom' && (
        <Field label={t('insp.scope')} group>
          <Segmented
            value={scope}
            onChange={setScope}
            options={[
              { value: 'type', label: t('insp.scopeType') },
              { value: 'page', label: t('insp.scopePage') },
            ]}
          />
        </Field>
      )}
      <Field label={t('link.mode')}>
        <Select
          value={mode}
          ariaLabel={t('link.mode')}
          onChange={(v) => set(v === 'page' ? { mode: 'page', page: shown?.page || home?.key || '' } : { mode: v })}
          options={[
            { value: 'auto', label: autoCount > 0 ? t('link.auto', { n: autoCount }) : t('link.autoNone') },
            { value: 'none', label: t('link.none') },
            { value: 'page', label: t('link.page') },
            { value: 'url', label: t('link.url') },
          ]}
        />
      </Field>
      {level === 'page' && !own && byType && <p className="mb-1 text-[11px] leading-snug text-ink-soft">{t('insp.inherits')}</p>}
      {mode === 'page' && (
        <Field label={t('link.target')}>
          <Select value={shown?.page ?? ''} ariaLabel={t('link.target')} onChange={(v) => set({ mode: 'page', page: v })} options={pages.some((o) => o.value === shown?.page) ? pages : [{ value: shown?.page ?? '', label: t('link.missing') }, ...pages]} />
        </Field>
      )}
      {mode === 'url' && (
        <Field label={t('link.address')} hint={urlOk ? t('link.urlHint') : t('link.urlBad')}>
          <TextInput value={shown?.url ?? ''} placeholder="https://" ariaLabel={t('link.address')} onChange={(v) => set({ mode: 'url', url: v })} />
        </Field>
      )}
      {edited.length > 0 && area === '' && (
        <div className="mt-1">
          <p className="text-[11px] font-semibold text-ink-soft">{t('link.zoneEdited')}</p>
          <ul className="space-y-0.5 text-[11.5px]">
            {edited.map((l) => (
              <li key={`${l.pageKey}:${l.area}`}>
                <button type="button" className="max-w-full truncate text-accent underline" onClick={() => setLinkArea(l.area)}>
                  {l.area}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {groups.length > 0 ? (
        <ul className="mt-1 space-y-0.5 text-[11.5px]">
          {groups.slice(0, 8).map(({ l, n }, i) => (
            <li key={i} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate" title={label(l)}>
                → {label(l)}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {n > 1 && <span className="text-ink-soft tabular-nums">×{n}</span>}
                {l.page !== undefined && (
                  <button type="button" className="text-accent underline" onClick={() => jumpToPage(l.page!)}>
                    {t('pre.go')}
                  </button>
                )}
              </span>
            </li>
          ))}
          {groups.length > 8 && <li className="text-ink-soft">{t('link.more', { n: groups.length - 8 })}</li>}
        </ul>
      ) : (
        <p className="text-[11px] leading-snug text-ink-soft">{t('link.noneHere')}</p>
      )}
    </div>
  );
}

/**
 * Qué tipos de texto usa el elemento (títulos, rótulos…) y un atajo a su letra y color en Estilo:
 * cambiarlos ahí cambia todos los textos de ese tipo en la agenda.
 */
/** El cuerpo (pt) del primer texto de unas primitivas, o `null` si no hay. */
function firstTextSize(prims: readonly Prim[]): number | null {
  for (const p of prims) {
    if (p.t === 'text') return p.run.sizePt;
    if (p.t === 'group') {
      const inner = firstTextSize(p.children);
      if (inner !== null) return inner;
    }
  }
  return null;
}

/** Lleva al estilo de cada clase de línea del elemento (filetes, ornamentos, marcos), que se cambia para toda la agenda. */
function LineUseLinks({ block }: { block: Block }) {
  const t = useT();
  const uses = block.uses ?? [];
  if (uses.length === 0) return null;
  return (
    <div className="mt-2 rounded-md bg-paper/70 p-2 text-[11.5px]" data-testid="line-uses">
      <div className="mb-1 font-semibold text-ink-soft">{t('insp.lineUses')}</div>
      <div className="flex flex-wrap gap-1.5">
        {uses.map((u) => (
          <Button key={u} variant="outline" onClick={() => void reveal({ panel: 'style', selector: `[data-reveal="line.${u}"]` })}>
            <Minus size={13} /> {t('insp.editLineUse', { use: t(`bstyle.use.${u}`) })}
          </Button>
        ))}
      </div>
      <p className="mt-1 leading-snug text-ink-soft">{t('insp.lineUsesHelp')}</p>
    </div>
  );
}

function TextRoleLinks({ block }: { block: Block }) {
  const t = useT();
  const roles = useMemo(() => {
    const found = new Set<string>();
    const walk = (ps: Prim[]): void => {
      for (const p of ps) {
        if (p.t === 'text' && p.role) found.add(p.role);
        else if (p.t === 'group') walk(p.children);
      }
    };
    walk(block.prims);
    return [...found];
  }, [block]);
  if (roles.length === 0) return null;
  return (
    <div className="mt-2 rounded-md bg-paper/70 p-2 text-[11.5px]" data-testid="text-roles">
      <div className="mb-1 font-semibold text-ink-soft">{t('insp.textRoles')}</div>
      <div className="flex flex-wrap gap-1.5">
        {roles.map((r) => (
          <Button key={r} variant="outline" onClick={() => void reveal({ panel: 'style', selector: `[data-reveal="role.${r}"]` })}>
            <Type size={13} /> {t('insp.editRole', { role: uiText(t, `role.${r}`, r) })}
          </Button>
        ))}
      </div>
      <p className="mt-1 leading-snug text-ink-soft">{t('insp.textRolesHelp')}</p>
    </div>
  );
}

/** Letra y color propios de un texto agregado (si no, los de su tipo de texto en el tema). */
function CustomTextStyle({ p, setProp, dragColor }: { p: Record<string, unknown>; setProp: (k: string, v: unknown) => void; dragColor: Scrubbing<string> }) {
  const t = useT();
  const families = useFamilies();
  const { doc } = useDocument();
  const role = (typeof p.role === 'string' ? p.role : 'body') as TextRole;
  const theme = doc?.ctx.theme;
  const own = parseFontSpec(p.font);
  const ownColor = normalizeColor(p.color);
  return (
    <div className="mt-1 rounded-md bg-paper/60 p-1.5">
      <Toggle label={t('insp.ownFont')} checked={Boolean(own)} onChange={(v) => setProp('font', v ? (theme?.fonts[role] ?? { family: 'Manrope', weight: 400, style: 'normal' }) : undefined)} />
      {own && (
        <FontRow
          label={t('insp.font')}
          spec={own}
          families={families}
          onChange={(spec) => {
            void resources.ensureFamily(spec.family);
            setProp('font', spec);
          }}
        />
      )}
      <div className="flex items-center gap-1.5">
        <div className="flex-1">
          <ColorInput label={t('style.color')} value={ownColor ?? theme?.colors.roles[role] ?? '#000000'} {...dragColor} />
        </div>
        {ownColor && (
          <button type="button" className="text-[11px] text-accent underline" onClick={() => setProp('color', undefined)}>
            {t('insp.colorTheme')}
          </button>
        )}
      </div>
    </div>
  );
}

function Preflight({ doc }: { doc: AgendaDocument }) {
  const t = useT();
  const [items, setItems] = useState<Array<PageWarning & { page: number }> | null>(null);
  useEffect(() => setItems(null), [doc]);
  const run = useCallback((): void => setItems([...doc.documentWarnings().map((w) => ({ ...w, page: -1 })), ...doc.warnings()]), [doc]);
  // El contador del pie de la página pide la revisión (un número nuevo cada vez).
  const request = useStore((s) => s.preflightRequest);
  const handled = useRef(request);
  useEffect(() => {
    if (request === handled.current) return;
    handled.current = request;
    run();
  }, [request, run]);
  // Las abreviaturas son informativas (un feriado largo que se puede renombrar), no errores.
  const warnings = items?.filter(isProblem) ?? [];
  const notes = items?.filter((w) => !isProblem(w)) ?? [];
  return (
    <div className="mt-4 border-t border-line pt-3" data-reveal="preflight">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-extrabold tracking-[0.08em] uppercase">{t('pre.title')}</h3>
        <Button variant="ghost" onClick={run}>
          {items === null ? <Play size={13} /> : <RotateCcw size={13} />} {t('pre.run')}
        </Button>
      </div>
      {items !== null &&
        (items.length === 0 ? (
          <p className="flex items-center gap-1.5 text-[12px] text-accent">
            <CheckCircle2 size={14} /> {t('pre.ok')}
          </p>
        ) : (
          <div>
            <p className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
              {warnings.length > 0 ? (
                <span className="flex items-center gap-1.5 text-warn">
                  <AlertTriangle size={14} /> {t('pre.count', { n: warnings.length })}
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-accent">
                  <CheckCircle2 size={14} /> {t('pre.ok')}
                </span>
              )}
              {notes.length > 0 && (
                <span className="flex items-center gap-1.5 text-ink-soft">
                  <Info size={14} /> {t('pre.notes', { n: notes.length })}
                </span>
              )}
            </p>
            <ul className="space-y-1">
              {[...warnings, ...notes].slice(0, 80).map((w, i) => (
                <li key={i} className={`flex items-start justify-between gap-2 text-[11.5px] leading-snug ${isProblem(w) ? '' : 'text-ink-soft'}`}>
                  <span>
                    <b className="tabular-nums">{w.page >= 0 ? w.page + 1 : t('pre.general')}</b> · {warningText(t, w)}
                  </span>
                  {w.page >= 0 && (
                    <button type="button" className="shrink-0 text-accent underline" onClick={() => jumpToPage(w.page)}>
                      {t('pre.go')}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
    </div>
  );
}
