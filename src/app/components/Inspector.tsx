/** Panel derecho: elemento seleccionado (valores exactos), elementos propios y verificación previa. */
import type { AgendaDocument } from '@core/document';
import type { CustomBlock } from '@core/design/schema';
import type { PageModel, PageWarning } from '@core/layout/prims';
import { newId } from '@core/util/hash';
import { AlertTriangle, CheckCircle2, EyeOff, Image as ImageIcon, Info, Minus, Play, RotateCcw, Square, StretchHorizontal, Trash2, Type } from 'lucide-react';
import { useEffect, useState } from 'react';
import { blockLabel, warningText } from '../i18n/messages';
import { sectionName, useT } from '../i18n/ui';
import { currentOverride, hideBlock, moveBlock, patchOverride, resetBlock, typeMirrored } from '../state/actions';
import { useStore } from '../state/store';
import { Button, Field, NumberInput, Segmented, Select, Slider, TextArea, Toggle } from './ui';

export function Inspector({ doc }: { doc: AgendaDocument }) {
  const t = useT();
  const design = useStore((s) => s.design)!;
  const selection = useStore((s) => s.selection);
  const scope = useStore((s) => s.scope);
  const setScope = useStore((s) => s.setScope);
  const update = useStore((s) => s.update);
  const select = useStore((s) => s.select);
  const pageIndex = useStore((s) => Math.min(s.pageIndex, doc.pageCount - 1));
  const selPageIndex = selection ? doc.indexOfKey(selection.pageKey) : -1;
  const page: PageModel = doc.page(selPageIndex >= 0 ? selPageIndex : pageIndex);
  const block = selection ? page.blocks.find((b) => b.id === selection.blockId) : undefined;

  // Teclado: flechas mueven, Supr oculta, Esc deselecciona.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (!block || !block.editable) {
        if (e.key === 'Escape') select(null);
        return;
      }
      const stepMm = e.shiftKey ? 5 : e.altKey ? 0.1 : 0.5;
      const map: Record<string, [number, number]> = { ArrowLeft: [-stepMm, 0], ArrowRight: [stepMm, 0], ArrowUp: [0, -stepMm], ArrowDown: [0, stepMm] };
      const mv = map[e.key];
      if (mv) {
        moveBlock(page, block, mv[0], mv[1], scope, `nudge:${block.id}`);
        e.preventDefault();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        hideBlock(page, block, scope);
        select(null);
        e.preventDefault();
      } else if (e.key === 'Escape') select(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [block, page, scope, select]);

  const addCustom = (kind: CustomBlock['kind']): void => {
    const c = page.content;
    const id = newId('el');
    const base = { id, pageType: page.type, pageKey: null, kind, mirror: true, props: {} as Record<string, unknown> };
    const blockDef: CustomBlock =
      kind === 'text'
        ? { ...base, x: c.x, y: c.y + c.h - 14, w: c.w, h: 10, props: { text: '{name}', role: 'quote', size: 11, align: 'right', label: t('insp.addText') } }
        : kind === 'image'
          ? { ...base, x: c.x + c.w - 30, y: c.y + c.h - 30, w: 30, h: 30, props: { assetId: design.assets[0]?.id ?? '', fit: 'contain', opacity: 1, label: t('insp.addImage') } }
          : kind === 'rect'
            ? { ...base, x: c.x, y: c.y + c.h - 30, w: c.w, h: 30, props: { label: t('insp.addRect') } }
            : { ...base, x: c.x, y: c.y + c.h - 30, w: c.w, h: 30, props: { label: t(kind === 'lines' ? 'insp.addLines' : 'insp.addDots') } };
    if (selection?.pageKey === page.key) blockDef.pageKey = scope === 'page' ? page.key : null;
    update((d) => {
      d.customBlocks.push(blockDef);
    });
    select({ pageKey: page.key, pageType: page.type, blockId: `custom.${id}`, role: 'custom' });
  };

  const sideLabel = page.side === 'recto' ? t('insp.recto') : t('insp.verso');
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line px-3 py-2 text-[11.5px] text-ink-soft">{t('insp.page', { n: page.index + 1, type: sectionName(t, page.type), side: sideLabel })}</div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3 py-2">
        <h3 className="mb-1 text-[11px] font-extrabold tracking-[0.08em] uppercase">{t('insp.title')}</h3>
        {!block && <p className="text-[12px] leading-snug text-ink-soft">{t('insp.none')}</p>}
        {block && (
          <div>
            <p className="mb-2 text-[13px] font-semibold">{blockLabel(t, block.id, block.label)}</p>
            {!block.editable && <p className="text-[12px] text-ink-soft">{t('insp.locked')}</p>}
            {block.editable && block.role === 'watermark' && <WatermarkFields id={block.id.slice(3)} />}
            {block.editable && block.role === 'custom' && <CustomFields id={block.id.slice(7)} />}
            {block.editable && block.role !== 'watermark' && block.role !== 'custom' && (
              <BlockFields page={page} blockId={block.id} scope={scope} setScope={setScope} />
            )}
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
            <p className="mt-3 text-[11px] text-ink-soft">{t('insp.keys')}</p>
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
        </div>
        <Preflight doc={doc} />
      </div>
    </div>
  );
}

function BlockFields({ page, blockId, scope, setScope }: { page: PageModel; blockId: string; scope: 'type' | 'page'; setScope: (s: 'type' | 'page') => void }) {
  const t = useT();
  const design = useStore((s) => s.design)!;
  const o = currentOverride(design, page, blockId, scope);
  // En páginas izquierdas de tipos espejados, el valor «por tipo» se muestra tal como actúa en esta página.
  const flip = scope === 'type' && page.type !== 'custom' && typeMirrored(page);
  const v = { dx: (flip ? -1 : 1) * (o?.dx ?? 0), dy: o?.dy ?? 0, scale: o?.scale ?? 1, rotation: o?.rotation ?? 0, opacity: o?.opacity ?? 1 };
  const set = (patch: Partial<typeof v>, key: string): void =>
    patchOverride(page, blockId, scope, patch.dx !== undefined && flip ? { ...patch, dx: -patch.dx } : patch, `insp:${blockId}:${key}`);
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
      {flip && <p className="mb-1 text-[11px] leading-snug text-ink-soft">{t('insp.mirrored')}</p>}
      <Slider label={t('insp.scale')} value={v.scale} min={0.2} max={3} step={0.01} onChange={(x) => set({ scale: x }, 'scale')} />
      <Slider label={t('insp.rotation')} value={v.rotation} min={-180} max={180} step={1} onChange={(x) => set({ rotation: x }, 'rotation')} />
      <Slider label={t('insp.opacity')} value={v.opacity} min={0} max={1} step={0.05} onChange={(x) => set({ opacity: x }, 'opacity')} />
    </div>
  );
}

export function WatermarkFields({ id }: { id: string }) {
  const t = useT();
  const wm = useStore((s) => s.design?.watermarks.find((w) => w.id === id));
  const update = useStore((s) => s.update);
  if (!wm) return null;
  const set = <K extends keyof typeof wm>(k: K, v: (typeof wm)[K]): void =>
    update((d) => {
      const w = d.watermarks.find((x) => x.id === id);
      if (w) (w as Record<string, unknown>)[k as string] = v;
    }, `wm:${id}:${String(k)}`);
  return (
    <div>
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
      <Slider label={t('wm.width')} value={wm.width} min={2} max={200} step={0.5} onChange={(v) => set('width', v)} />
      <Slider label={t('wm.opacity')} value={wm.opacity} min={0.05} max={1} step={0.05} onChange={(v) => set('opacity', v)} />
      <Slider label={t('wm.rotation')} value={wm.rotation} min={-180} max={180} step={1} onChange={(v) => set('rotation', v)} />
      <Slider label={t('wm.minStroke')} value={wm.minStrokePt} min={0} max={1.5} step={0.05} onChange={(v) => set('minStrokePt', v)} />
      <Toggle label={t('wm.mirror')} checked={wm.mirrorOnVerso} onChange={(v) => set('mirrorOnVerso', v)} />
      <Field label={t('wm.layer')}>
        <Select value={wm.layer} onChange={(v) => set('layer', v)} options={[{ value: 'above', label: t('wm.above') }, { value: 'below', label: t('wm.below') }]} />
      </Field>
    </div>
  );
}

function CustomFields({ id }: { id: string }) {
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
  const setProp = (k: string, v: unknown): void =>
    update((d) => {
      const c = d.customBlocks.find((x) => x.id === id);
      if (c) c.props = { ...c.props, [k]: v };
    }, `cb:${id}:p:${k}`);
  const p = cb.props as Record<string, unknown>;
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
        <Field label="H (mm)">
          <NumberInput value={cb.h} step={0.5} min={1} onChange={(v) => set({ h: v }, 'h')} />
        </Field>
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
                options={(['display', 'title', 'label', 'labelStrong', 'heading', 'body', 'number', 'quote'] as const).map((r) => ({ value: r, label: t(`role.${r}`) }))}
              />
            </Field>
            <Field label={t('insp.size')}>
              <NumberInput value={Number(p.size ?? 10)} step={0.5} min={4} max={120} onChange={(v) => setProp('size', v)} />
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
        </>
      )}
      {cb.kind === 'image' && (
        <>
          <Field label={t('cover.image')}>
            <Select value={String(p.assetId ?? '')} onChange={(v) => setProp('assetId', v)} options={assets.map((a) => ({ value: a.id, label: a.name }))} />
          </Field>
          <Slider label={t('insp.opacity')} value={Number(p.opacity ?? 1)} min={0.05} max={1} step={0.05} onChange={(v) => setProp('opacity', v)} />
        </>
      )}
      {(cb.kind === 'lines' || cb.kind === 'dots' || cb.kind === 'grid') && (
        <Slider label={t('style.pitch')} value={Number(p.pitch ?? 6)} min={3} max={12} step={0.1} onChange={(v) => setProp('pitch', v)} />
      )}
    </div>
  );
}

function Preflight({ doc }: { doc: AgendaDocument }) {
  const t = useT();
  const goToPage = useStore((s) => s.goToPage);
  const [items, setItems] = useState<Array<PageWarning & { page: number }> | null>(null);
  useEffect(() => setItems(null), [doc]);
  const run = (): void => setItems([...doc.documentWarnings().map((w) => ({ ...w, page: -1 })), ...doc.warnings()]);
  // Las abreviaturas son informativas (un feriado largo que se puede renombrar), no errores.
  const warnings = items?.filter((w) => w.code !== 'abbreviated') ?? [];
  const notes = items?.filter((w) => w.code === 'abbreviated') ?? [];
  return (
    <div className="mt-4 border-t border-line pt-3">
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
                <li key={i} className={`flex items-start justify-between gap-2 text-[11.5px] leading-snug ${w.code === 'abbreviated' ? 'text-ink-soft' : ''}`}>
                  <span>
                    <b className="tabular-nums">{w.page >= 0 ? w.page + 1 : t('pre.general')}</b> · {warningText(t, w)}
                  </span>
                  {w.page >= 0 && (
                    <button type="button" className="shrink-0 text-accent underline" onClick={() => goToPage(w.page)}>
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
