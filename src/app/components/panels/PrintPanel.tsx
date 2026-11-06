import type { ExportKind } from "@core/document";
import {
  designDefaults,
  PAPER_PRESETS,
  type PaperPresetId,
} from "@core/design/schema";
import {
  Download,
  FileDown,
  Link2,
  Printer,
  Ruler,
  Scissors,
} from "lucide-react";
import { useState } from "react";
import { uiText, useT, type UiKey } from "../../i18n/ui";
import { useDocument } from "../../state/doc";
import { openFile, revealFile } from "../../state/desktopBridge";
import {
  deliverPdf,
  exportPageSvg,
  exportPdf,
  fileBase,
} from "../../state/exporter";
import { scrub } from "../../state/scrub";
import { useStore } from "../../state/store";
import {
  Button,
  Field,
  Group,
  NumberInput,
  Segmented,
  Select,
  Slider,
  TextInput,
  Toggle,
} from "../ui";

export function PrintPanel() {
  const t = useT();
  const design = useStore((s) => s.design)!;
  const update = useStore((s) => s.update);
  const pageIndex = useStore((s) => s.pageIndex);
  const showLinks = useStore((s) => s.showLinks);
  const setShowLinks = useStore((s) => s.setShowLinks);
  const { doc } = useDocument();
  const b = design.binding;
  const screen = b.target === "screen";
  const L = design.links;
  const [status, setStatus] = useState<string | null>(null);
  const lastExport = useStore((s) => s.lastExport);
  const setLastExport = useStore((s) => s.setLastExport);
  const [busy, setBusy] = useState(false);
  const [sigNo, setSigNo] = useState(1);
  const [customText, setCustomText] = useState<string | null>(null);
  // Al apagar «todos los meses» vuelve lo que había antes (la pestaña del mes, o nada).
  const [tabsBefore, setTabsBefore] = useState<boolean | null>(null);

  const run = async (
    kind: ExportKind,
    suffix: string,
    signature?: number,
  ): Promise<void> => {
    setBusy(true);
    setLastExport(null);
    setStatus(t("export.working", { done: 0, total: "…" }));
    try {
      const bytes = await exportPdf(
        design,
        kind,
        (done, total) => setStatus(t("export.working", { done, total })),
        signature !== undefined ? { signature } : {},
      );
      const name = `${fileBase(design)}-${suffix}.pdf`;
      const done = await deliverPdf(bytes, name);
      setLastExport(
        done.kind === "saved" ? { name: done.name, path: done.path } : null,
      );
      setStatus(
        done.kind === "saved"
          ? t("export.saved")
          : done.kind === "cancelled"
            ? t("export.cancelled")
            : t("export.done", { name }),
      );
    } catch (err) {
      setStatus(t("export.error", { msg: (err as Error).message }));
    } finally {
      setBusy(false);
    }
  };

  const plan = doc?.plan;
  const sigCount = plan?.signatures.signatures.length ?? 0;
  // Si la cantidad de cuadernillos baja, el número elegido se acomoda.
  const sig = Math.min(Math.max(1, sigNo), Math.max(1, sigCount));
  const thickness = plan
    ? (plan.signatures.totalSheets * 2 * (b.creep.caliper || 0.1)).toFixed(1)
    : "—";
  const presets = Object.entries(PAPER_PRESETS) as Array<
    [PaperPresetId, (typeof PAPER_PRESETS)[PaperPresetId]]
  >;

  /** Sin páginas no hay nada que exportar (la hoja de calibración y la plantilla de costura sí se pueden). */
  const empty = (doc?.pageCount ?? 0) === 0;
  return (
    <div>
      <Group title={t("print.target")}>
        <Segmented
          value={b.target}
          onChange={(v) => update((d) => void (d.binding.target = v))}
          options={[
            { value: "print", label: t("print.target.print") },
            { value: "screen", label: t("print.target.screen") },
          ]}
        />
        <p className="mt-1.5 text-[11.5px] leading-snug text-ink-soft">
          {screen ? t("print.target.screenHelp") : t("print.target.printHelp")}
        </p>
      </Group>

      <Group title={t("print.summary")}>
        {plan && (
          <ul className="space-y-0.5 text-[12px]">
            <li>
              <b>{t("print.pagesTotal", { n: plan.pages.length })}</b> ·{" "}
              {doc!.format.w.toFixed(1)} × {doc!.format.h.toFixed(1)} mm
            </li>
            {!screen && (
              <>
                <li>
                  {t("print.sheetsTotal", { n: plan.signatures.totalSheets })}
                </li>
                {plan.signatures.signatures.length > 0 && (
                  <li className="text-ink-soft">
                    {describe(plan.signatures.signatures.map((s) => s.sheets))}
                  </li>
                )}
                <li className="text-ink-soft">
                  {t("print.fillers", {
                    n: plan.parityFillers + plan.signatureFillers,
                  })}
                </li>
                <li className="text-ink-soft">
                  {t("print.thickness", { mm: thickness })}
                </li>
              </>
            )}
          </ul>
        )}
      </Group>

      <Group title={t("print.exports")}>
        {empty && (
          <p className="mb-1.5 text-[11.5px] leading-snug text-warn" data-testid="export-empty">
            {t("export.empty")}
          </p>
        )}
        <div className="grid gap-1.5">
          {screen ? (
            <Button
              variant="primary"
              disabled={busy || empty}
              onClick={() => void run("pages", t("file.pages"))}
            >
              <FileDown size={14} /> {t("export.pagesScreen")}
            </Button>
          ) : (
            <>
              <Button
                variant="primary"
                disabled={busy || empty}
                onClick={() => void run("imposed", t("file.imposed"))}
              >
                <Printer size={14} /> {t("export.imposed")}
              </Button>
              <Button
                disabled={busy}
                onClick={() => void run("calibration", t("file.calibration"))}
              >
                <Ruler size={14} /> {t("export.calibration")}
              </Button>
              <Button
                disabled={busy || empty}
                onClick={() => void run("pages", t("file.pages"))}
              >
                <FileDown size={14} /> {t("export.pages")}
              </Button>
              {b.duplex === "manual" && (
                <div className="grid grid-cols-2 gap-1.5">
                  <Button
                    disabled={busy || empty}
                    onClick={() => void run("fronts", t("file.fronts"))}
                  >
                    {t("export.fronts")}
                  </Button>
                  <Button
                    disabled={busy || empty}
                    onClick={() => void run("backs", t("file.backs"))}
                  >
                    {t("export.backs")}
                  </Button>
                </div>
              )}
              {sigCount > 1 && (
                <div className="flex items-center gap-1.5">
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void run(
                        "signature",
                        t("file.signature", { n: sig }),
                        sig - 1,
                      )
                    }
                  >
                    <Download size={14} /> {t("export.signature")}
                  </Button>
                  <div className="w-16">
                    <NumberInput
                      value={sig}
                      min={1}
                      max={sigCount}
                      integer
                      ariaLabel={t("export.signature")}
                      onChange={(v) => setSigNo(v)}
                    />
                  </div>
                  <span className="text-[11px] text-ink-soft">
                    / {sigCount}
                  </span>
                </div>
              )}
              {b.method === "sewn" && (
                <Button
                  disabled={busy}
                  onClick={() => void run("sewing", t("file.sewing"))}
                >
                  <Scissors size={14} /> {t("export.sewing")}
                </Button>
              )}
              <Button
                disabled={busy || empty}
                onClick={() => void run("cover", t("file.cover"))}
              >
                {t("export.cover")}
              </Button>
              {doc?.hasSeparate() && (
                <Button
                  disabled={busy || empty}
                  onClick={() => void run("separate", t("file.separate"))}
                >
                  {t("export.separate")}
                </Button>
              )}
            </>
          )}
          {doc && (
            <Button
              variant="ghost"
              onClick={() =>
                exportPageSvg(
                  doc,
                  pageIndex,
                  `${fileBase(design)}-p${pageIndex + 1}.svg`,
                )
              }
            >
              {t("export.svg")}
            </Button>
          )}
        </div>
        {status && (
          <p className="mt-2 text-[11.5px] text-ink-soft" role="status">
            {status}
          </p>
        )}
        {lastExport && (
          <div className="mt-1 text-[11.5px]" data-testid="last-export">
            <button
              type="button"
              className="font-semibold text-accent underline"
              title={t("export.openFile")}
              onClick={() => void openFile(lastExport.path)}
            >
              {lastExport.name}
            </button>
            <span className="block break-all text-ink-soft">
              {lastExport.path}
            </span>
            <div className="mt-1">
              <Button
                variant="outline"
                onClick={() => void revealFile(lastExport.path)}
              >
                {t("export.openFolder")}
              </Button>
            </div>
          </div>
        )}
      </Group>

      <Group title={t("links.title")} defaultOpen={false}>
        <p className="mb-1.5 text-[11.5px] leading-snug text-ink-soft">
          {t("links.help")}
        </p>
        <Toggle
          label={t("links.enabled")}
          checked={L.enabled}
          onChange={(v) => update((d) => void (d.links.enabled = v))}
        />
        {L.enabled && (
          <div className="mb-1 border-l-2 border-line pl-2">
            <Toggle
              label={t("links.days")}
              checked={L.days}
              onChange={(v) => update((d) => void (d.links.days = v))}
            />
            {L.days && (
              <Field label={t("links.dayTarget")}>
                <Select
                  value={L.dayTarget}
                  onChange={(v) => update((d) => void (d.links.dayTarget = v))}
                  options={(["auto", "week", "month"] as const).map((v) => ({
                    value: v,
                    label: t(`links.day.${v}`),
                  }))}
                />
              </Field>
            )}
            <Toggle
              label={t("links.months")}
              checked={L.months}
              onChange={(v) => update((d) => void (d.links.months = v))}
            />
            {L.months && (
              <Field label={t("links.monthTarget")}>
                <Select
                  value={L.monthTarget}
                  onChange={(v) =>
                    update((d) => void (d.links.monthTarget = v))
                  }
                  options={(["first", "log", "grid"] as const).map((v) => ({
                    value: v,
                    label: t(`links.month.${v}`),
                  }))}
                />
              </Field>
            )}
            <Toggle
              label={t("links.up")}
              hint={t("links.upHint")}
              checked={L.up}
              onChange={(v) => update((d) => void (d.links.up = v))}
            />
            <Toggle
              label={t("links.toc")}
              checked={L.toc}
              onChange={(v) => update((d) => void (d.links.toc = v))}
            />
            <Field
              label={t("links.pageNumber")}
              hint={
                b.pageNumbers.enabled ? undefined : t("links.pageNumberOff")
              }
            >
              <Select
                value={L.pageNumber}
                onChange={(v) => update((d) => void (d.links.pageNumber = v))}
                options={(["toc", "year", "month", "none"] as const).map(
                  (v) => ({ value: v, label: t(`links.pn.${v}`) }),
                )}
              />
            </Field>
          </div>
        )}
        <Toggle
          label={t("links.bookmarks")}
          hint={t("links.bookmarksHint")}
          checked={L.bookmarks}
          onChange={(v) => update((d) => void (d.links.bookmarks = v))}
        />
        <Toggle
          label={t("links.tabs")}
          hint={t("links.tabsHint")}
          checked={b.thumbIndex.enabled && b.thumbIndex.months === "all"}
          onChange={(v) => {
            if (v) setTabsBefore(b.thumbIndex.enabled);
            update((d) => {
              d.binding.thumbIndex.enabled = v ? true : (tabsBefore ?? false);
              d.binding.thumbIndex.months = v ? "all" : "current";
            });
          }}
        />
        <Button variant="ghost" onClick={() => setShowLinks(!showLinks)}>
          <Link2 size={14} />{" "}
          {showLinks ? t("links.hideOnPage") : t("links.showOnPage")}
        </Button>
      </Group>

      <Group title={t("print.navigation")}>
        <Toggle
          label={t("print.pageNumbers")}
          checked={b.pageNumbers.enabled}
          onChange={(v) =>
            update((d) => void (d.binding.pageNumbers.enabled = v))
          }
        />
        <Toggle
          label={t("print.thumbIndex")}
          checked={b.thumbIndex.enabled}
          onChange={(v) =>
            update((d) => void (d.binding.thumbIndex.enabled = v))
          }
        />
        {b.thumbIndex.enabled && (
          <Field label={t("print.thumbMonths")}>
            <Select
              value={b.thumbIndex.months}
              onChange={(v) =>
                update((d) => void (d.binding.thumbIndex.months = v))
              }
              options={(["current", "all"] as const).map((v) => ({
                value: v,
                label: t(`thumb.${v}`),
              }))}
            />
          </Field>
        )}
      </Group>

      <Group title={t("print.paper")}>
        <Select
          value={design.paper.preset}
          onChange={(v) => update((d) => void (d.paper.preset = v))}
          options={presets.map(([id, p]) => ({
            value: id,
            label: uiText(t, `paper.${id}`, p.label),
          }))}
        />
        {design.paper.preset === "CUSTOM" && (
          <div className="mt-1 grid grid-cols-2 gap-2">
            <Field label={t("print.width")}>
              <NumberInput
                value={design.paper.width}
                min={50}
                max={1000}
                onChange={(v) =>
                  update((d) => void (d.paper.width = v), "paper:w")
                }
              />
            </Field>
            <Field label={t("print.height")}>
              <NumberInput
                value={design.paper.height}
                min={50}
                max={1500}
                onChange={(v) =>
                  update((d) => void (d.paper.height = v), "paper:h")
                }
              />
            </Field>
          </div>
        )}
      </Group>

      {screen ? (
        <p className="mb-2 rounded-md border border-line bg-white px-2 py-1.5 text-[11.5px] leading-snug text-ink-soft">
          {t("print.target.screenOnly")}
        </p>
      ) : (
        <>
          <Group title={t("print.binding")}>
            <Select
              value={b.method}
              onChange={(v) => update((d) => void (d.binding.method = v))}
              options={(["sewn", "saddle", "cut-stack", "single"] as const).map(
                (v) => ({ value: v, label: t(`bind.${v}` as UiKey) }),
              )}
            />
            {b.method === "sewn" && (
              <div className="mt-2">
                <Field label={t("print.mode")} group>
                  <Segmented
                    value={b.signature.mode}
                    onChange={(v) =>
                      update((d) => void (d.binding.signature.mode = v))
                    }
                    options={(["uniform", "balanced", "custom"] as const).map(
                      (v) => ({ value: v, label: t(`sig.${v}`) }),
                    )}
                  />
                </Field>
                {b.signature.mode !== "custom" ? (
                  <>
                    <Slider
                      label={t("print.sheets")}
                      value={b.signature.sheets}
                      min={1}
                      max={16}
                      step={1}
                      integer
                      {...scrub<number>(
                        (v) => (d) => void (d.binding.signature.sheets = v),
                        "sig:sheets",
                      )}
                      defaultValue={designDefaults().binding.signature.sheets}
                    />
                    <p className="text-[11.5px] text-ink-soft">
                      {t("print.pagesPer", { n: b.signature.sheets * 4 })}
                    </p>
                  </>
                ) : (
                  <Field label={t("print.customList")}>
                    <TextInput
                      // Mientras se escribe se conserva el texto tal cual (comas y espacios); la agenda se actualiza en vivo.
                      value={customText ?? b.signature.custom.join(", ")}
                      onChange={(v) => {
                        setCustomText(v);
                        update((d) => {
                          d.binding.signature.custom = v
                            .split(/[\s,;]+/)
                            .filter((x) => x !== "")
                            .map((x) => Math.round(Number(x)))
                            .filter(
                              (x) => Number.isFinite(x) && x >= 1 && x <= 32,
                            );
                        }, "sig:custom");
                      }}
                      onBlur={() => setCustomText(null)}
                    />
                  </Field>
                )}
                <Field label={t("print.last")}>
                  <Select
                    value={b.signature.last}
                    onChange={(v) =>
                      update((d) => void (d.binding.signature.last = v))
                    }
                    options={[
                      { value: "shrink", label: t("last.shrink") },
                      { value: "pad", label: t("last.pad") },
                    ]}
                  />
                </Field>
              </div>
            )}
            <Field label={t("print.fill")}>
              <Select
                value={b.fillWith}
                onChange={(v) => update((d) => void (d.binding.fillWith = v))}
                options={(["dots", "lines", "grid", "blank"] as const).map(
                  (v) => ({ value: v, label: t(`val.${v}`) }),
                )}
              />
            </Field>
          </Group>

          <Group title={t("print.duplex")}>
            <Select
              value={b.duplex}
              onChange={(v) => update((d) => void (d.binding.duplex = v))}
              options={(["short-edge", "long-edge", "manual"] as const).map(
                (v) => ({ value: v, label: t(`duplex.${v}` as UiKey) }),
              )}
            />
            {b.duplex === "manual" && (
              <>
                <Toggle
                  label={t("print.reverseBacks")}
                  checked={b.manualReverseBacks}
                  onChange={(v) =>
                    update((d) => void (d.binding.manualReverseBacks = v))
                  }
                />
                <Toggle
                  label={t("print.rotateBacks")}
                  checked={b.manualRotateBacks}
                  onChange={(v) =>
                    update((d) => void (d.binding.manualRotateBacks = v))
                  }
                />
              </>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Field label={`${t("print.backOffset")} X`}>
                <NumberInput
                  value={b.backOffset.x}
                  step={0.1}
                  min={-20}
                  max={20}
                  onChange={(v) =>
                    update((d) => void (d.binding.backOffset.x = v), "bo:x")
                  }
                />
              </Field>
              <Field label={`${t("print.backOffset")} Y`}>
                <NumberInput
                  value={b.backOffset.y}
                  step={0.1}
                  min={-20}
                  max={20}
                  onChange={(v) =>
                    update((d) => void (d.binding.backOffset.y = v), "bo:y")
                  }
                />
              </Field>
            </div>
          </Group>

          <Group title={t("print.creep")} defaultOpen={false}>
            <Select
              value={b.creep.mode}
              onChange={(v) => update((d) => void (d.binding.creep.mode = v))}
              options={(["off", "caliper", "measured"] as const).map((v) => ({
                value: v,
                label: t(`creep.${v}`),
              }))}
            />
            <Field label={t("print.caliper")} hint={t("print.caliperHelp")}>
              <NumberInput
                value={b.creep.caliper}
                step={0.005}
                min={0.02}
                max={1}
                onChange={(v) =>
                  update((d) => void (d.binding.creep.caliper = v), "creep:cal")
                }
              />
            </Field>
            {b.creep.mode === "measured" && (
              <Field label={t("print.measured")}>
                <NumberInput
                  value={b.creep.measured}
                  step={0.1}
                  min={0}
                  max={20}
                  onChange={(v) =>
                    update(
                      (d) => void (d.binding.creep.measured = v),
                      "creep:m",
                    )
                  }
                />
              </Field>
            )}
          </Group>

          <Group title={t("print.marks")} defaultOpen={false}>
            {(["fold", "crop", "collation", "signatureLabel"] as const).map(
              (k) => (
                <Toggle
                  key={k}
                  label={t(`mark.${k}`)}
                  checked={b.marks[k]}
                  onChange={(v) => update((d) => void (d.binding.marks[k] = v))}
                />
              ),
            )}
            <div className="grid grid-cols-3 gap-2">
              {(["top", "bottom", "outer"] as const).map((k) => (
                <Field key={k} label={`${t("print.trim")} ${t(`margin.${k}`)}`}>
                  <NumberInput
                    value={b.trim[k]}
                    step={0.5}
                    min={0}
                    max={30}
                    onChange={(v) =>
                      update((d) => void (d.binding.trim[k] = v), `trim:${k}`)
                    }
                  />
                </Field>
              ))}
            </div>
            <Field label={t("print.nonPrintable")}>
              <NumberInput
                value={b.nonPrintable}
                step={0.1}
                min={0}
                max={20}
                onChange={(v) =>
                  update((d) => void (d.binding.nonPrintable = v), "np")
                }
              />
            </Field>
          </Group>

          {b.method === "sewn" && (
            <Group title={t("print.sewing")} defaultOpen={false}>
              <Slider
                label={t("print.stations")}
                value={b.sewing.stations}
                min={2}
                max={12}
                step={1}
                integer
                {...scrub<number>(
                  (v) => (d) => void (d.binding.sewing.stations = v),
                  "sew:n",
                )}
                defaultValue={designDefaults().binding.sewing.stations}
              />
              <Toggle
                label={t("print.pairs")}
                checked={b.sewing.pairs}
                onChange={(v) =>
                  update((d) => void (d.binding.sewing.pairs = v))
                }
              />
            </Group>
          )}
        </>
      )}

      <Group title={t("print.howTo")} defaultOpen={false}>
        <ol className="list-decimal space-y-1.5 pl-4 text-[11.5px] leading-snug">
          <li>{t("print.howTo.1")}</li>
          <li>{t("print.howTo.2")}</li>
          <li>{t("print.howTo.linux")}</li>
          <li>{t("print.howTo.windows")}</li>
          <li>{t("print.howTo.android")}</li>
          <li>{t("print.howTo.fold")}</li>
        </ol>
      </Group>
    </div>
  );
}

function describe(sizes: number[]): string {
  const groups: Array<{ n: number; c: number }> = [];
  for (const s of sizes) {
    const last = groups[groups.length - 1];
    if (last && last.n === s) last.c++;
    else groups.push({ n: s, c: 1 });
  }
  return groups.map((g) => `${g.c} × ${g.n} (${g.n * 4} p.)`).join(" + ");
}
