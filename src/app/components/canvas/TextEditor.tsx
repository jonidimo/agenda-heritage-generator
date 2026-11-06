/**
 * Editor de texto en su lugar: un `<textarea>` transparente sobre el bloque, con la misma fuente,
 * cuerpo e interlineado que el dibujo. Lo que se ve son los glifos reales de la página, que se
 * vuelven a maquetar con cada cambio (vista previa transitoria); el cuadro solo pone el cursor, la
 * selección y el teclado. Enter agrega un renglón en los textos de varios renglones y confirma en
 * los de uno; Ctrl/⌘+Enter o salir del cuadro confirma; Esc descarta.
 */
import { blockBounds } from '@core/document/layout';
import type { AgendaDocument } from '@core/document';
import { textSourceKey } from '@core/design/textSource';
import type { Block, PageModel, TextPrim, TextSource } from '@core/layout/prims';
import { applyToPoint } from '@core/util/geometry';
import { useEffect, useRef, useState } from 'react';
import { textSourceRecipe, textSourceValue } from '../../state/actions';
import { ensureCssFace } from '../../state/cssFonts';
import { frameThrottle } from '../../state/frame';
import { useStore } from '../../state/store';

interface Props {
  doc: AgendaDocument;
  page: PageModel;
  blockId: string;
  source: TextSource;
  /** Píxeles por mm. */
  scale: number;
  onDone: () => void;
}

/** Los textos de un solo renglón confirman con Enter (no tienen cómo partirse). */
export function isSingleLine(source: TextSource): boolean {
  return source.kind === 'label' || (source.kind === 'persona' && source.field === 'name') || ((source.kind === 'page' || source.kind === 'template') && source.field === 'title');
}

/** Primeras primitivas de texto del bloque (una por renglón). */
function textLines(block: Block): TextPrim[] {
  return block.prims.filter((p): p is TextPrim => p.t === 'text');
}

/** El bloque se puede editar en su lugar solo si va sin giro ni escala: el cuadro de texto no se transforma. */
export function editableInPlace(block: Block): boolean {
  if (!block.text || !block.editable || block.locked) return false;
  const m = block.m;
  if (!m) return true;
  return Math.abs(m[0] - 1) < 1e-6 && Math.abs(m[3] - 1) < 1e-6 && Math.abs(m[1]) < 1e-6 && Math.abs(m[2]) < 1e-6;
}

export function TextEditor({ doc, page, blockId, source, scale, onDone }: Props) {
  const key = textSourceKey(source);
  const [original] = useState(() => textSourceValue(useStore.getState().design!, source));
  const [draft, setDraft] = useState(original);
  const [family, setFamily] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement | null>(null);
  const done = useRef(false);
  const focused = useRef(false);
  const latest = useRef(draft);
  const last = useRef<Block | null>(null);
  const push = useRef(frameThrottle<string>((v) => useStore.getState().preview(textSourceRecipe(source, v), key)));

  // Un texto vaciado no se muestra vacío mientras se escribe: el bloque (o la página entera, en la
  // dedicatoria) desaparecería con el cuadro. Se vuelve a mostrar en cuanto hay algo.
  const shown = (v: string): string => (v.trim() === '' ? original : v);

  const finish = (confirm: boolean): void => {
    if (done.current) return;
    done.current = true;
    push.current.cancel();
    const st = useStore.getState();
    st.clearPreview();
    if (confirm && latest.current !== original) st.commit(textSourceRecipe(source, latest.current), key);
    onDone();
  };

  const block = page.blocks.find((b) => b.id === blockId) ?? last.current;
  if (block) last.current = block;
  const first = block ? textLines(block)[0] : undefined;
  const face = first ? doc.ctx.fonts.get(first.run.face) : undefined;

  useEffect(() => {
    let live = true;
    // Si la letra no se puede cargar, el cuadro igual se abre (con la del sistema): editar no depende de ella.
    if (face) ensureCssFace(face).then((name) => live && setFamily(name), () => live && setFamily('sans-serif'));
    return () => {
      live = false;
    };
  }, [face]);

  useEffect(() => {
    const pending = push.current;
    // En desarrollo, React monta, desmonta y vuelve a montar: el estado de «cerrado» empieza limpio cada vez.
    done.current = false;
    return () => {
      // Si el cuadro desaparece sin cerrarse (se cambió de página), lo escrito se confirma.
      if (!done.current) {
        done.current = true;
        pending.cancel();
        const st = useStore.getState();
        st.clearPreview();
        if (latest.current !== original) st.commit(textSourceRecipe(source, latest.current), key);
      }
    };
    // Una sola vez: el origen y el valor inicial no cambian mientras el cuadro está abierto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!block || !first || !face || !family) return null;

  const lines = textLines(block);
  const bounds = blockBounds(block);
  const m = block.m;
  const at = (x: number, y: number) => (m ? applyToPoint(m, x, y) : { x, y });
  const sizePx = first.run.size * scale;
  const lead = lines.length > 1 ? Math.abs(lines[1]!.y - lines[0]!.y) * scale : sizePx * 1.3;
  const upm = face.font.unitsPerEm || 1000;
  const ascent = (face.font.ascent / upm) * sizePx;
  const descent = (Math.abs(face.font.descent) / upm) * sizePx;
  // La línea de base del primer renglón cae donde la dibujó la página.
  const top = at(first.x, first.y).y * scale - ((lead - (ascent + descent)) / 2 + ascent);
  const anchor = first.anchor ?? 'start';
  const width = Math.max(bounds.w * scale + 4, 96);
  const left = anchor === 'middle' ? (bounds.x + bounds.w / 2) * scale - width / 2 : anchor === 'end' ? (bounds.x + bounds.w) * scale - width : bounds.x * scale;
  const rows = Math.max(lines.length, draft.split('\n').length);

  return (
    <textarea
      ref={(el) => {
        area.current = el;
        if (el && !focused.current) {
          focused.current = true;
          el.focus();
          el.select();
        }
      }}
      data-text-editor=""
      aria-label={block.label}
      className="text-editor absolute resize-none overflow-hidden whitespace-pre-wrap rounded-[2px] border border-dashed border-accent bg-transparent p-0 outline-none"
      style={{
        left,
        top,
        width,
        height: Math.max(bounds.h * scale, rows * lead) + 2,
        font: `${face.style === 'italic' ? 'italic ' : ''}${face.weight} ${sizePx}px/${lead}px "${family}"`,
        letterSpacing: first.run.tracking * scale,
        textAlign: anchor === 'middle' ? 'center' : anchor === 'end' ? 'right' : 'left',
        color: 'transparent',
        caretColor: first.color,
        touchAction: 'none',
      }}
      value={draft}
      spellCheck={false}
      // El cuadro no es de la página: sus clics no arrastran ni seleccionan, y sus teclas no son atajos.
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
      onChange={(e) => {
        latest.current = e.target.value;
        setDraft(e.target.value);
        push.current.push(shown(e.target.value));
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          e.preventDefault();
          finish(false);
        } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || (isSingleLine(source) && !e.shiftKey))) {
          e.preventDefault();
          finish(true);
        }
      }}
      onBlur={() => finish(true)}
    />
  );
}
