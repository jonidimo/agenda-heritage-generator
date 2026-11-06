/** Capas de la página: el orden de apilado de sus elementos, y los campos de apilado y fusión de uno. */
import { BLEND_MODES, type BlendMode } from "@core/design/blend";
import type { AgendaDocument } from "@core/document";
import type { Block, PageModel } from "@core/layout/prims";
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpToLine,
  Eye,
  EyeOff,
  Lock,
  RotateCcw,
} from "lucide-react";
import { useRef, useState } from "react";
import { blockLabel } from "../i18n/messages";
import { useT, type UiKey } from "../i18n/ui";
import {
  currentOverride,
  hideBlock,
  moveInStack,
  renameBlock,
  resetStack,
  setBlend,
  showHiddenElements,
} from "../state/actions";
import { useStore } from "../state/store";
import { Button, Field, Segmented, Select, TextInput } from "./ui";

/** Los elementos que se pueden ocultar con el ojo: no los propios (que se borran) ni las marcas de agua (que tienen su panel). */
const hideable = (b: Block): boolean =>
  b.editable && b.role !== "custom" && b.role !== "watermark";

function StackButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-line bg-white hover:bg-paper disabled:opacity-35"
    >
      {children}
    </button>
  );
}

/** Subir, bajar, llevar al frente o al fondo: los cuatro movimientos del apilado. */
function StackButtons({
  page,
  block,
  scope,
}: {
  page: PageModel;
  block: Block;
  scope: "type" | "page";
}) {
  const t = useT();
  const at = page.blocks.findIndex((b) => b.id === block.id);
  const top = at === page.blocks.length - 1;
  const bottom = at === 0;
  return (
    <span className="flex shrink-0 items-center gap-0.5">
      <StackButton
        label={t("layers.front")}
        disabled={top}
        onClick={() => moveInStack(page, block.id, "front", scope)}
      >
        <ArrowUpToLine size={12} />
      </StackButton>
      <StackButton
        label={t("layers.up")}
        disabled={top}
        onClick={() => moveInStack(page, block.id, "up", scope)}
      >
        <ArrowUp size={12} />
      </StackButton>
      <StackButton
        label={t("layers.down")}
        disabled={bottom}
        onClick={() => moveInStack(page, block.id, "down", scope)}
      >
        <ArrowDown size={12} />
      </StackButton>
      <StackButton
        label={t("layers.back")}
        disabled={bottom}
        onClick={() => moveInStack(page, block.id, "back", scope)}
      >
        <ArrowDownToLine size={12} />
      </StackButton>
    </span>
  );
}

function Row({
  page,
  block,
  scope,
  selected,
}: {
  page: PageModel;
  block: Block;
  scope: "type" | "page";
  selected: boolean;
}) {
  const t = useT();
  const select = useStore((s) => s.setSelection);
  const [renaming, setRenaming] = useState<string | null>(null);
  const nameButton = useRef<HTMLButtonElement>(null);
  /** Guardar con Enter y después perder el foco no guarda dos veces; Esc no guarda nada. */
  const finished = useRef(false);
  const startRename = (): void => {
    if (!block.editable) return;
    finished.current = false;
    setRenaming(blockLabel(t, block.id, block.label, block.renamed));
  };
  const finishRename = (save: boolean): void => {
    if (finished.current || renaming === null) return;
    finished.current = true;
    if (save) renameBlock(page, block.id, scope, renaming);
    setRenaming(null);
    // El campo desaparece: el foco vuelve a la fila para seguir con el teclado.
    requestAnimationFrame(() => nameButton.current?.focus());
  };
  const pick = (): void =>
    select({
      pageKey: page.key,
      pageType: page.type,
      blockId: block.id,
      role: block.role,
    });
  return (
    <li
      data-testid="layer-row"
      data-block-id={block.id}
      aria-current={selected ? "true" : undefined}
      className={`flex items-center gap-1 rounded-md border px-1 py-0.5 text-[12px] ${selected ? "border-accent bg-accent/10" : "border-transparent hover:bg-black/5"} ${block.editable ? "" : "text-ink-soft"}`}
    >
      {hideable(block) ? (
        <StackButton
          label={t("layers.hide")}
          onClick={() => hideBlock(page, block, scope)}
        >
          <Eye size={12} />
        </StackButton>
      ) : (
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center text-ink-soft"
          title={block.editable ? undefined : t("layers.locked")}
        >
          {block.editable ? null : <Lock size={11} />}
        </span>
      )}
      {renaming !== null ? (
        <div className="min-w-0 flex-1">
          <TextInput
            value={renaming}
            ariaLabel={t("layers.name")}
            onChange={setRenaming}
            autoFocus
            onKeyDown={(e) => {
              // Enter guarda, Esc deja el nombre como estaba; los dos devuelven el foco a la fila.
              if (e.key === "Enter") finishRename(true);
              else if (e.key === "Escape") finishRename(false);
              else return;
              e.preventDefault();
              e.stopPropagation();
            }}
            onBlur={() => finishRename(true)}
          />
        </div>
      ) : (
        <button
          type="button"
          className="min-w-0 flex-1 truncate text-left"
          title={t("layers.rename")}
          ref={nameButton}
          onClick={pick}
          onDoubleClick={startRename}
          onKeyDown={(e) => {
            // F2 renombra, como en los administradores de archivos.
            if (e.key !== "F2") return;
            e.preventDefault();
            startRename();
          }}
        >
          {blockLabel(t, block.id, block.label, block.renamed)}
        </button>
      )}
      {block.editable && (
        <StackButtons page={page} block={block} scope={scope} />
      )}
    </li>
  );
}

/** La pestaña «Capas» del panel derecho. */
export function LayersPanel({
  doc,
  page,
}: {
  doc: AgendaDocument;
  page: PageModel;
}) {
  const t = useT();
  const scope = useStore((s) => s.scope);
  const setScope = useStore((s) => s.setScope);
  const selectedIds = useStore((s) => s.selectedIds);
  const design = useStore((s) => s.design)!;
  const hidden = doc.hidden(page.index);
  // De arriba hacia abajo: el último que se dibuja es el que se ve encima.
  const rows = [...page.blocks].reverse();
  const level = page.type === "custom" ? "page" : scope;
  const hasOrder = design.overrides.some(
    (o) =>
      o.layer !== null &&
      o.pageType === page.type &&
      (level === "page" ? o.pageKey === page.key : o.pageKey === null),
  );
  return (
    <div data-testid="layers-panel">
      <p className="mb-2 text-[11.5px] leading-snug text-ink-soft">
        {t("layers.help")}
      </p>
      {page.type !== "custom" && (
        <Field label={t("insp.scope")} group>
          <Segmented
            value={scope}
            onChange={setScope}
            options={[
              { value: "type", label: t("insp.scopeType") },
              { value: "page", label: t("insp.scopePage") },
            ]}
          />
        </Field>
      )}
      <ul className="space-y-0.5">
        {rows.map((b) => (
          <Row
            key={b.id}
            page={page}
            block={b}
            scope={scope}
            selected={selectedIds.includes(b.id)}
          />
        ))}
      </ul>
      {hasOrder && (
        <div className="mt-2">
          <Button variant="ghost" onClick={() => resetStack(page, scope)}>
            <RotateCcw size={13} /> {t("layers.reset")}
          </Button>
        </div>
      )}
      {hidden.length > 0 && (
        <div
          className="mt-3 border-t border-line pt-2"
          data-testid="layers-hidden"
        >
          <h4 className="mb-1 text-[11px] font-extrabold tracking-[0.08em] uppercase">
            {t("layers.hidden")}
          </h4>
          <ul className="space-y-0.5">
            {hidden.map((h) => (
              <li
                key={`${h.kind}:${h.id}`}
                className="flex items-center gap-1 text-[12px] text-ink-soft"
              >
                <StackButton
                  label={t("layers.show")}
                  onClick={() => showHiddenElements(page, [h])}
                >
                  <EyeOff size={12} />
                </StackButton>
                <span className="min-w-0 flex-1 truncate">{blockLabel(t, h.id, h.label)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** En el panel del elemento: su nombre, su lugar en el apilado y cómo se fusiona con lo de abajo. */
export function StackFields({
  page,
  block,
  scope,
}: {
  page: PageModel;
  block: Block;
  scope: "type" | "page";
}) {
  const t = useT();
  const design = useStore((s) => s.design)!;
  const level: "type" | "page" = page.type === "custom" ? "page" : scope;
  const own =
    currentOverride(design, page, block.id, level) ??
    currentOverride(design, page, block.id, "type");
  const blend: BlendMode = own?.blend ?? "normal";
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div className="mt-2 border-t border-line pt-2" data-testid="stack-fields">
      <h4 className="mb-1 text-[11px] font-extrabold tracking-[0.08em] uppercase">
        {t("layers.stack")}
      </h4>
      <div className="mb-1">
        <StackButtons page={page} block={block} scope={scope} />
      </div>
      <Field label={t("layers.name")}>
        {/* Un borrador local: el nombre se guarda al salir del campo (al escribir no se puede recortar). */}
        <TextInput
          value={draft ?? own?.label ?? ""}
          placeholder={blockLabel(t, block.id, block.label, block.renamed)}
          ariaLabel={t("layers.name")}
          onChange={setDraft}
          onKeyDown={(e) => {
            // Enter guarda (al soltar el foco); Esc descarta lo escrito.
            if (e.key === "Enter") e.currentTarget.blur();
            else if (e.key === "Escape") {
              setDraft(null);
              e.stopPropagation();
            }
          }}
          onBlur={() => {
            if (draft !== null) renameBlock(page, block.id, scope, draft);
            setDraft(null);
          }}
        />
      </Field>
      <Field label={t("layers.blend")}>
        <Select
          value={blend}
          ariaLabel={t("layers.blend")}
          onChange={(v) => setBlend(page, block.id, scope, v)}
          options={BLEND_MODES.map((m) => ({
            value: m,
            label: t(`blend.${m}` as UiKey),
          }))}
        />
      </Field>
    </div>
  );
}
