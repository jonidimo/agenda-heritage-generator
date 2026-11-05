/**
 * Estilo propio del elemento seleccionado: dibujo, color y grosor de cada clase de línea que tiene,
 * relleno de sus recuadros y color de su texto. Se guarda por tipo de página o solo en esta página
 * (el alcance lo elige el panel del elemento) y se ve mientras se arrastra, sin llenar el historial.
 */
import type { BlockLineKey } from '@core/design/schema';
import type { Block, PageModel, Prim } from '@core/layout/prims';
import { ptToMm } from '@core/util/geometry';
import { RotateCcw } from 'lucide-react';
import { useMemo } from 'react';
import { useT } from '../i18n/ui';
import { blockStyleOf, fillStyleRecipe, lineStyleRecipe, resetBlockStyle, textColorRecipe, type Scope } from '../state/actions';
import { scrub } from '../state/scrub';
import { useStore } from '../state/store';
import { Button, ColorInput, Field, Select, Slider } from './ui';

interface Used {
  /** Clases de línea que tiene el elemento, con el color y el grosor (mm) del primer trazo de cada una. */
  lines: Map<BlockLineKey, { color: string; width: number }>;
  rect: boolean;
  textColor: string | null;
}

function usedBy(prims: readonly Prim[], out: Used = { lines: new Map(), rect: false, textColor: null }): Used {
  for (const p of prims) {
    if (p.t === 'group') usedBy(p.children, out);
    else if (p.t === 'text') out.textColor ??= p.color;
    else if (p.t === 'line' || p.t === 'rect' || p.t === 'circle' || p.t === 'path') {
      if (p.t === 'rect' && (p.fill || p.stroke?.use !== 'frame')) out.rect = true;
      if (p.stroke) {
        const key: BlockLineKey = p.stroke.use ?? 'other';
        if (!out.lines.has(key)) out.lines.set(key, { color: p.stroke.color, width: p.stroke.width });
      }
    }
  }
  return out;
}

/** Dibujos que se ofrecen: los que no necesitan ornamento. El del tema se vuelve a elegir quitando el campo. */
const PATTERNS = ['theme', 'solid', 'dashed', 'dotted', 'double'] as const;
/** Más los dibujos con ornamento, que solo llegan por un archivo: se muestran si el elemento los trae. */
type Pattern = (typeof PATTERNS)[number] | 'repeat' | 'center';

const MM_PER_PT = ptToMm(1);

export function BlockStyleFields({ page, block, scope }: { page: PageModel; block: Block; scope: Scope }) {
  const t = useT();
  const stored = useStore((s) => (s.design ? blockStyleOf(s.design, page, block.id, scope) : undefined));
  const used = useMemo(() => usedBy(block.prims), [block.prims]);
  const hasText = used.textColor !== null;
  if (used.lines.size === 0 && !used.rect && !hasText) return null;
  const id = block.id;
  return (
    <div className="mt-3 border-t border-line pt-2" data-reveal="blockstyle">
      <h3 className="mb-1 text-[11px] font-extrabold tracking-[0.08em] uppercase">{t('bstyle.title')}</h3>
      {[...used.lines].map(([key, now]) => {
        const own = stored?.lines[key];
        const real = key !== 'other';
        return (
          <fieldset key={key} className="mb-2 rounded-md border border-line px-2 pb-1">
            <legend className="px-1 text-[11px] font-semibold text-ink-soft">{t(`bstyle.use.${key}`)}</legend>
            {real && (
              <Field label={t('bstyle.pattern')}>
                <Select<Pattern>
                  value={own?.pattern ?? 'theme'}
                  onChange={(v) => useStore.getState().update(lineStyleRecipe(page, id, scope, key, { pattern: v === 'theme' ? undefined : v }), `bstyle:${id}:${key}:pattern`)}
                  options={[...PATTERNS, ...(own?.pattern === 'repeat' || own?.pattern === 'center' ? [own.pattern] : [])].map((p) => ({ value: p, label: t(`bstyle.pattern.${p}`) }))}
                />
              </Field>
            )}
            <ColorInput
              label={t('bstyle.color')}
              value={own?.color ?? now.color}
              {...scrub<string>((v) => lineStyleRecipe(page, id, scope, key, { color: v }), `bstyle:${id}:${key}:color`)}
              modified={own?.color !== undefined}
              onReset={() => useStore.getState().update(lineStyleRecipe(page, id, scope, key, { color: undefined }), `bstyle:${id}:${key}:color`)}
            />
            <Slider
              label={t('bstyle.width')}
              value={own?.widthPt ?? Math.round((now.width / MM_PER_PT) * 100) / 100}
              min={0.1}
              max={6}
              step={0.05}
              {...scrub<number>((v) => lineStyleRecipe(page, id, scope, key, { widthPt: v }), `bstyle:${id}:${key}:width`)}
              modified={own?.widthPt !== undefined}
              onReset={() => useStore.getState().update(lineStyleRecipe(page, id, scope, key, { widthPt: undefined }), `bstyle:${id}:${key}:width`)}
            />
          </fieldset>
        );
      })}
      {used.rect && (
        <div className="mb-2 flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <ColorInput
              label={t('bstyle.fill')}
              value={stored?.fill?.color ?? '#ffffff'}
              {...scrub<string>((v) => fillStyleRecipe(page, id, scope, v), `bstyle:${id}:fill`)}
              modified={stored?.fill !== undefined}
              onReset={() => useStore.getState().update(fillStyleRecipe(page, id, scope, undefined), `bstyle:${id}:fill`)}
            />
          </div>
          <Button variant="ghost" onClick={() => useStore.getState().update(fillStyleRecipe(page, id, scope, null), `bstyle:${id}:fill`)}>
            {t('bstyle.noFill')}
          </Button>
        </div>
      )}
      {hasText && (
        <ColorInput
          label={t('bstyle.textColor')}
          value={stored?.text?.color ?? used.textColor ?? '#000000'}
          {...scrub<string>((v) => textColorRecipe(page, id, scope, v), `bstyle:${id}:text`)}
          modified={stored?.text?.color !== undefined}
          onReset={() => useStore.getState().update(textColorRecipe(page, id, scope, undefined), `bstyle:${id}:text`)}
        />
      )}
      {stored && (
        <Button variant="ghost" onClick={() => resetBlockStyle(page, id, scope)}>
          <RotateCcw size={14} /> {t('bstyle.reset')}
        </Button>
      )}
    </div>
  );
}
