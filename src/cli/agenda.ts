#!/usr/bin/env node
/**
 * CLI de Agenda Heritage Studio: genera PDFs y archivos de diseño sin
 * interfaz, con el mismo motor que la aplicación web.
 *
 *   npm run agenda -- new --template heritage-norma --year 2027 --out designs/norma-2027.agenda.json
 *   npm run agenda -- info designs/norma-2027.agenda.json
 *   npm run pdf -- designs/norma-2027.agenda.json --mode imposed --out output/norma-2027-imprimir.pdf
 *   npm run pdf -- designs/norma-2027.agenda.json --mode pages
 *   npm run pdf -- designs/norma-2027.agenda.json --mode calibration
 *   npm run agenda -- svg designs/norma-2027.agenda.json --page 12 --out output/p12.svg
 *
 * Modos de PDF: pages, imposed, fronts, backs, signature (--signature N),
 * calibration, sewing, cover, separate.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDesign, TEMPLATES, type TemplateId } from '../core/design/defaults';
import { parseDesign, type Design } from '../core/design/schema';
import { AgendaDocument, type ExportKind } from '../core/document';
import { describeSignatures } from '../core/imposition/signatures';
import { pageToSvg } from '../core/render/svg';
import { facesForDesign, loadAssets, loadBuiltinFonts, loadFontManifest, loadHolidayData, type ResourceIO } from '../core/resources';
import { FontRegistry } from '../core/text/fonts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const io: ResourceIO = { read: async (p) => new Uint8Array(await readFile(join(root, 'public', p))) };

function flag(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

async function loadDesign(path: string): Promise<Design> {
  return parseDesign(JSON.parse(await readFile(resolve(path), 'utf8')));
}

async function openDocument(design: Design): Promise<{ doc: AgendaDocument; bytes: Map<string, Uint8Array>; errors: string[] }> {
  const fonts = new FontRegistry();
  const manifest = await loadFontManifest(io);
  await loadBuiltinFonts(io, fonts, manifest, process.argv.includes('--all-fonts') ? undefined : facesForDesign(design));
  const holidays = await loadHolidayData(io, design.holidays.country);
  const assets = await loadAssets(io, design);
  const doc = new AgendaDocument(design, { fonts, holidays, assets: assets.infos });
  return { doc, bytes: assets.bytes, errors: assets.errors };
}

async function cmdNew(): Promise<void> {
  const template = (flag('template', 'heritage') as TemplateId) ?? 'heritage';
  if (!TEMPLATES.some((t) => t.id === template)) throw new Error(`Plantilla desconocida: ${template}. Opciones: ${TEMPLATES.map((t) => t.id).join(', ')}`);
  const design = createDesign(template, {
    year: Number(flag('year', String(new Date().getFullYear() + 1))),
    ...(flag('locale') ? { locale: flag('locale')! } : {}),
    ...(flag('country') ? { country: flag('country') === 'none' ? null : flag('country')! } : {}),
    ...(flag('name') ? { name: flag('name')! } : {}),
  });
  const out = resolve(flag('out', `designs/${template}-${design.calendar.year}.agenda.json`)!);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(design, null, 2)}\n`);
  console.log(`Diseño creado: ${out}`);
}

async function cmdInfo(path: string): Promise<void> {
  const design = await loadDesign(path);
  const { doc, errors } = await openDocument(design);
  const p = doc.plan;
  console.log(`${design.name} — ${design.locale}, ${design.holidays.country ?? 'sin país'}, ${design.calendar.year}`);
  console.log(`Páginas: ${p.pages.length} (contenido ${p.contentPages}, relleno de paridad ${p.parityFillers}, relleno de cuadernillo ${p.signatureFillers})`);
  console.log(`Página: ${doc.format.w.toFixed(1)} × ${doc.format.h.toFixed(1)} mm · hoja ${doc.format.sheetW.toFixed(1)} × ${doc.format.sheetH.toFixed(1)} mm · ${doc.format.nUp} por cara`);
  console.log(`Hojas de papel: ${p.signatures.totalSheets} · ${describeSignatures(p.signatures)}`);
  const warnings = doc.warnings();
  console.log(`Avisos: ${warnings.length + errors.length}`);
  for (const e of errors) console.log(`  · ${e}`);
  const grouped = new Map<string, number[]>();
  for (const w of warnings) grouped.set(w.message, [...(grouped.get(w.message) ?? []), w.page + 1]);
  for (const [msg, pages] of grouped) console.log(`  · ${msg} (págs. ${pages.slice(0, 12).join(', ')}${pages.length > 12 ? '…' : ''})`);
}

async function cmdPdf(path: string): Promise<void> {
  const design = await loadDesign(path);
  const mode = (flag('mode', 'imposed') as ExportKind) ?? 'imposed';
  const { doc, bytes } = await openDocument(design);
  const out = resolve(flag('out', `output/${(design.name || 'agenda').replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase()}-${mode}.pdf`)!);
  await mkdir(dirname(out), { recursive: true });
  const t0 = Date.now();
  const pdf = await doc.exportPdf(mode, {
    assetBytes: (id) => bytes.get(id),
    ...(flag('signature') ? { signature: Number(flag('signature')) - 1 } : {}),
    onProgress: (d, n) => {
      if (d === n || d % 25 === 0) process.stdout.write(`\r  ${d}/${n} páginas`);
    },
  });
  process.stdout.write('\n');
  await writeFile(out, pdf);
  console.log(`PDF (${mode}) escrito en ${out} — ${(pdf.length / 1024).toFixed(0)} KB en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

async function cmdSvg(path: string): Promise<void> {
  const design = await loadDesign(path);
  const { doc } = await openDocument(design);
  const index = Number(flag('page', '1')) - 1;
  const page = doc.page(index);
  const out = resolve(flag('out', `output/page-${index + 1}.svg`)!);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, pageToSvg(page, { fonts: doc.ctx.fonts }, { background: '#ffffff' }));
  console.log(`SVG de la página ${index + 1} (${page.type}, ${page.key}) en ${out}`);
}

async function main(): Promise<void> {
  const [cmd, arg] = process.argv.slice(2);
  switch (cmd) {
    case 'new':
      return cmdNew();
    case 'info':
      if (!arg) throw new Error('Uso: agenda info <diseño.agenda.json>');
      return cmdInfo(arg);
    case 'pdf':
      if (!arg) throw new Error('Uso: agenda pdf <diseño.agenda.json> [--mode imposed|pages|…] [--out archivo.pdf]');
      return cmdPdf(arg);
    case 'svg':
      if (!arg) throw new Error('Uso: agenda svg <diseño.agenda.json> --page N');
      return cmdSvg(arg);
    default:
      console.log('Comandos: new, info, pdf, svg. Ver encabezado de src/cli/agenda.ts.');
  }
}

main().catch((err: unknown) => {
  console.error((err as Error).message ?? err);
  process.exitCode = 1;
});
