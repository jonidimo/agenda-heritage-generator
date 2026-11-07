#!/usr/bin/env node
/**
 * CLI de Agenda Heritage Studio: genera PDFs y archivos de diseño sin
 * interfaz, con el mismo motor que la aplicación web.
 *
 *   npm run agenda -- new --template heritage-norma --year 2027 --out designs/mi-agenda-2027.agenda.json
 *   npm run agenda -- info designs/mi-agenda-2027.agenda.json
 *   npm run agenda -- check designs/mi-agenda-2027.agenda.json [--json] [--strict]
 *   npm run agenda -- schema --out agenda.schema.json
 *   npm run agenda -- catalog [--out catalogo.json]
 *   npm run pdf -- designs/mi-agenda-2027.agenda.json --kind imposed --out output/mi-agenda-imprimir.pdf
 *   npm run agenda -- svg designs/mi-agenda-2027.agenda.json --page 12 --out output/p12.svg
 *
 * Modos de PDF: pages, imposed, fronts, backs, signature (--signature N),
 * calibration, sewing, cover, separate.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createDesign, TEMPLATES, type TemplateId } from '../core/design/defaults';
import { designJsonSchema } from '../core/design/jsonSchema';
import { cachedResampler, parseImageDpi } from '../core/assets/resample';
import { defaultImageDpi, EXPORT_KINDS, type ExportKind } from '../core/document';
import { documentSummary, formatSummary } from '../core/document/summary';
import { pageToSvg } from '../core/render/svg';
import { fileBase } from '../core/util/filename';
import { checkDesignJson } from '../node/check';
import { nodeResampler } from '../node/resample';
import { fullCatalogue, loadFonts, openNodeDocument, readDesignFile } from '../node/env';

function flag(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

const has = (name: string): boolean => process.argv.includes(`--${name}`);

/** Con `--all-fonts`, carga todas las fuentes integradas (para comparar con la aplicación). */
const allFonts = async () => (has('all-fonts') ? loadFonts() : undefined);

async function writeOut(path: string, data: string | Uint8Array): Promise<string> {
  const out = resolve(path);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, data);
  return out;
}

/** JSON a un archivo (con `--out`) o a la salida estándar. */
async function emitJson(value: unknown, what: string): Promise<void> {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  const path = flag('out');
  if (!path) return void process.stdout.write(text);
  console.log(`${what}: ${await writeOut(path, text)}`);
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
  const out = await writeOut(flag('out', `designs/${template}-${design.calendar.year}.agenda.json`)!, `${JSON.stringify(design, null, 2)}\n`);
  console.log(`Diseño creado: ${out}`);
}

async function cmdInfo(path: string): Promise<void> {
  const { doc, errors } = await openNodeDocument(await readDesignFile(path), await allFonts(), { baseDir: dirname(resolve(path)) });
  for (const line of formatSummary(documentSummary(doc, errors))) console.log(line);
}

/**
 * Revisa un archivo: si abre, qué valores se ignoran o corrigen al abrirlo, y los avisos de la
 * agenda armada. Sale con código 1 si no abre (con `--strict`, también si hay valores ajustados).
 */
async function cmdCheck(path: string): Promise<void> {
  const { design, issues } = checkDesignJson(await readFile(resolve(path), 'utf8'));
  const opened = design ? await openNodeDocument(design, await allFonts(), { baseDir: dirname(resolve(path)) }) : null;
  const summary = opened ? documentSummary(opened.doc, opened.errors) : null;
  const failed = !design || (has('strict') && issues.length > 0);
  if (has('json')) process.stdout.write(`${JSON.stringify({ ok: !failed, opens: Boolean(design), issues, summary }, null, 2)}\n`);
  else {
    console.log(design ? (issues.length === 0 ? 'El archivo es válido.' : `El archivo abre, con ${issues.length} valor(es) que se ignoran o corrigen:`) : 'El archivo no se puede abrir:');
    for (const i of issues) console.log(`  · ${i.path}: ${i.message}`);
    if (summary) for (const line of formatSummary(summary)) console.log(line);
  }
  if (failed) process.exitCode = 1;
}

async function cmdPdf(path: string): Promise<void> {
  const design = await readDesignFile(path);
  // `--kind` (como el servidor MCP), o `--mode`, su nombre anterior.
  const mode = (flag('kind') ?? flag('mode', 'imposed')) as ExportKind;
  if (!EXPORT_KINDS.includes(mode)) throw new Error(`Modo desconocido: ${mode}. Opciones: ${EXPORT_KINDS.join(', ')}`);
  const sigFlag = flag('signature');
  const signature = sigFlag === undefined ? undefined : Number(sigFlag);
  if (mode === 'signature' && (signature === undefined || !Number.isInteger(signature) || signature < 1))
    throw new Error('Con --kind signature indicá el cuadernillo con --signature N (1, 2, 3…).');
  // Las imágenes a 300 ppp para imprimir o 150 para pantalla (o `original`, sin tocarlas).
  const imageFlag = flag('image-dpi');
  const imageDpi = imageFlag === undefined ? defaultImageDpi(design.binding) : parseImageDpi(imageFlag);
  const { doc, bytes } = await openNodeDocument(design, await allFonts(), { baseDir: dirname(resolve(path)) });
  const t0 = Date.now();
  const pdf = await doc.exportPdf(mode, {
    assetBytes: (id) => bytes.get(id),
    imageDpi,
    resample: cachedResampler(nodeResampler),
    ...(signature !== undefined ? { signature: signature - 1 } : {}),
    onProgress: (d, n) => {
      if (d === n || d % 25 === 0) process.stdout.write(`\r  ${d}/${n} páginas`);
    },
  });
  process.stdout.write('\n');
  const out = await writeOut(flag('out', `output/${fileBase(design)}-${mode}.pdf`)!, pdf);
  console.log(`PDF (${mode}) escrito en ${out} — ${(pdf.length / 1024).toFixed(0)} KB en ${((Date.now() - t0) / 1000).toFixed(1)} s (imágenes: ${imageDpi === 'original' ? 'originales' : `hasta ${imageDpi} ppp`})`);
}

async function cmdSvg(path: string): Promise<void> {
  const { doc, assetHref } = await openNodeDocument(await readDesignFile(path), await allFonts(), { baseDir: dirname(resolve(path)) });
  const index = Number(flag('page', '1')) - 1;
  const page = doc.page(index);
  const out = await writeOut(flag('out', `output/page-${index + 1}.svg`)!, pageToSvg(page, { fonts: doc.ctx.fonts, assetHref }, { background: '#ffffff' }));
  console.log(`SVG de la página ${index + 1} (${page.type}, ${page.key}) en ${out}`);
}

const USAGE: Record<string, string> = {
  info: 'agenda info <diseño.agenda.json>',
  check: 'agenda check <diseño.agenda.json> [--json] [--strict]',
  pdf: 'agenda pdf <diseño.agenda.json> [--kind imposed|pages|…] [--image-dpi original|300|150] [--out archivo.pdf]',
  svg: 'agenda svg <diseño.agenda.json> --page N',
};

async function main(): Promise<void> {
  const [cmd, arg] = process.argv.slice(2);
  const needFile = (): string => {
    if (!arg || arg.startsWith('--')) throw new Error(`Uso: ${USAGE[cmd!]}`);
    return arg;
  };
  switch (cmd) {
    case 'new':
      return cmdNew();
    case 'info':
      return cmdInfo(needFile());
    case 'check':
      return cmdCheck(needFile());
    case 'schema':
      return emitJson(designJsonSchema(), 'Esquema JSON');
    case 'catalog':
      return emitJson(await fullCatalogue(), 'Catálogo');
    case 'pdf':
      return cmdPdf(needFile());
    case 'svg':
      return cmdSvg(needFile());
    default:
      console.log('Comandos: new, info, check, schema, catalog, pdf, svg. Ver encabezado de src/cli/agenda.ts.');
  }
}

// Con la salida cortada (`… | head`), terminar en silencio en lugar de mostrar el error del sistema.
process.stdout.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EPIPE') process.exit(process.exitCode ?? 0);
  throw err;
});

main().catch((err: unknown) => {
  console.error((err as Error).message ?? err);
  process.exitCode = 1;
});
