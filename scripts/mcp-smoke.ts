/**
 * Prueba de humo del servidor MCP: lo arranca como lo haría un cliente de IA (Claude Desktop,
 * Claude Code…) y comprueba, de punta a punta, que funciona.
 *
 * - La salida estándar es solo del protocolo: cada línea tiene que ser un mensaje JSON-RPC.
 * - Ejercita lo que más depende de cómo esté empaquetado: las fuentes y los feriados (carpeta de
 *   recursos), la maquetación, el PDF (pdfkit y fontkit), el PNG (resvg en WebAssembly) y las guías.
 * - La versión que dice es la de package.json.
 * - Al cerrar su entrada, termina solo.
 *
 * Sirve para el código fuente, el paquete (`dist-mcp/main.mjs`) y la aplicación de escritorio
 * instalada o empaquetada (con `--mcp`):
 *
 *   tsx scripts/mcp-smoke.ts [--env CLAVE=valor]… [--timeout segundos] -- <comando> [argumentos…]
 *   tsx scripts/mcp-smoke.ts -- tsx src/mcp/main.ts
 *   tsx scripts/mcp-smoke.ts --env AGENDA_PUBLIC_DIR=public -- node dist-mcp/main.mjs
 *   tsx scripts/mcp-smoke.ts -- "release/linux-unpacked/heritage-studio" --no-sandbox --mcp
 */
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

export interface SmokeOptions {
  command: string;
  args?: readonly string[];
  /** Variables de entorno que se suman a las del proceso (p. ej. `AGENDA_PUBLIC_DIR`). */
  env?: Readonly<Record<string, string>>;
  /** Tiempo máximo de cada paso, en milisegundos. */
  stepTimeoutMs?: number;
}

export interface SmokeReport {
  ok: boolean;
  problems: string[];
  serverVersion: string | null;
  tools: string[];
  /** Líneas que escribió en la salida estándar. */
  stdoutLines: number;
  /** Lo que escribió en la salida de errores (avisos para la persona). */
  stderr: string;
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

const isObject = (v: Json | undefined): v is JsonObject => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Una respuesta JSON-RPC: el resultado o el error. */
interface Reply {
  result: Json | undefined;
  error: Json | undefined;
}

function packageVersion(): string {
  return (JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string }).version;
}

export async function smokeMcp(opts: SmokeOptions): Promise<SmokeReport> {
  const stepMs = opts.stepTimeoutMs ?? 180_000;
  const workspace = await mkdtemp(join(tmpdir(), 'agenda-mcp-smoke-'));
  const problems: string[] = [];
  const report: SmokeReport = { ok: false, problems, serverVersion: null, tools: [], stdoutLines: 0, stderr: '' };
  const child = spawn(opts.command, [...(opts.args ?? [])], {
    // Se lanza desde la raíz del repositorio (para que valgan las rutas relativas del comando);
    // la carpeta de trabajo del servidor es otra y la fija AGENDA_MCP_ROOT.
    cwd: ROOT,
    env: { ...process.env, AGENDA_MCP_ROOT: workspace, ...opts.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => (report.stderr += chunk));

  // Salida estándar: una línea por mensaje, y nada más que mensajes.
  const waiting = new Map<number, (reply: Reply) => void>();
  let buffer = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    buffer += chunk;
    for (let nl = buffer.indexOf('\n'); nl >= 0; nl = buffer.indexOf('\n')) {
      const line = buffer.slice(0, nl).replace(/\r$/, '');
      buffer = buffer.slice(nl + 1);
      if (line === '') continue;
      report.stdoutLines++;
      let message: Json;
      try {
        message = JSON.parse(line) as Json;
      } catch {
        problems.push(`La salida estándar tiene texto que no es JSON: ${JSON.stringify(line.slice(0, 120))}`);
        continue;
      }
      if (!isObject(message) || message.jsonrpc !== '2.0') {
        problems.push(`La salida estándar tiene JSON que no es un mensaje JSON-RPC: ${line.slice(0, 120)}`);
        continue;
      }
      if (typeof message.id === 'number') waiting.get(message.id)?.({ result: message.result, error: message.error });
    }
  });

  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    child.on('exit', (code, signal) => resolve({ code, signal }));
    child.on('error', (err) => {
      problems.push(`No se pudo iniciar «${opts.command}»: ${err.message}`);
      resolve({ code: null, signal: null });
    });
  });

  let nextId = 1;
  const send = (message: JsonObject): void => void child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
  const request = (method: string, params: JsonObject = {}): Promise<Reply> =>
    new Promise<Reply>((resolve, reject) => {
      const id = nextId++;
      const timer = setTimeout(() => {
        waiting.delete(id);
        reject(new Error(`«${method}» no respondió en ${stepMs / 1000} s`));
      }, stepMs);
      waiting.set(id, (reply) => {
        clearTimeout(timer);
        waiting.delete(id);
        resolve(reply);
      });
      send({ id, method, params });
    });
  /** Llama a una herramienta y devuelve su contenido (o anota el problema). */
  const call = async (name: string, args: JsonObject): Promise<{ text: Json | null; content: JsonObject[] }> => {
    const { result, error } = await request('tools/call', { name, arguments: args });
    const content = isObject(result) && Array.isArray(result.content) ? result.content.filter(isObject) : [];
    if (error !== undefined || (isObject(result) && result.isError === true)) {
      const first = content.find((c) => c.type === 'text');
      problems.push(`${name} falló: ${JSON.stringify(error ?? first?.text ?? result).slice(0, 300)}`);
      return { text: null, content };
    }
    const first = content.find((c) => c.type === 'text');
    let text: Json | null = null;
    if (typeof first?.text === 'string') {
      try {
        text = JSON.parse(first.text) as Json;
      } catch {
        text = first.text;
      }
    }
    return { text, content };
  };

  try {
    const init = await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'mcp-smoke', version: '1.0.0' } });
    const info = isObject(init.result) && isObject(init.result.serverInfo) ? init.result.serverInfo : null;
    report.serverVersion = typeof info?.version === 'string' ? info.version : null;
    if (info?.name !== 'agenda-heritage-studio') problems.push(`Nombre inesperado del servidor: ${JSON.stringify(info?.name)}`);
    if (report.serverVersion !== packageVersion()) problems.push(`La versión del servidor (${report.serverVersion}) no es la de package.json (${packageVersion()}).`);
    send({ method: 'notifications/initialized' });

    const list = await request('tools/list');
    const tools = isObject(list.result) && Array.isArray(list.result.tools) ? list.result.tools.filter(isObject).map((t) => String(t.name)) : [];
    report.tools = tools;
    for (const want of ['create_design', 'update_design', 'check_design', 'list_pages', 'render_page', 'export_pdf', 'export_theme', 'list_catalogue', 'get_schema'])
      if (!tools.includes(want)) problems.push(`Falta la herramienta ${want}.`);

    // Recursos integrados: el catálogo lee las fuentes de la carpeta de recursos.
    const catalogue = (await call('list_catalogue', {})).text;
    const fonts = isObject(catalogue) && Array.isArray(catalogue.fonts) ? catalogue.fonts.filter(isObject).map((f) => String(f.family)) : [];
    if (!fonts.includes('Cormorant Garamond')) problems.push(`El catálogo no trae las fuentes integradas (hay: ${fonts.join(', ') || 'ninguna'}).`);

    // Una agenda chica (un mes) para que el PDF salga rápido.
    await call('create_design', { template: 'heritage', year: 2027, locale: 'en-US', out: 'humo.agenda.json' });
    await call('update_design', { path: 'humo.agenda.json', patch: [{ op: 'replace', path: '/calendar/monthCount', value: 1 }] });
    const checked = (await call('check_design', { path: 'humo.agenda.json' })).text;
    const summary = isObject(checked) && isObject(checked.summary) ? checked.summary : null;
    const pages = isObject(summary?.pages) ? summary.pages.total : null;
    if (typeof pages !== 'number' || pages < 8) problems.push(`La agenda de prueba tiene un número raro de páginas: ${JSON.stringify(pages)}`);
    const issues = isObject(checked) && Array.isArray(checked.issues) ? checked.issues : [];
    if (issues.length > 0) problems.push(`check_design informa problemas en una agenda recién creada: ${JSON.stringify(issues).slice(0, 300)}`);
    const warnings = Array.isArray(summary?.warnings) ? summary.warnings.filter(isObject) : [];
    if (warnings.length > 0) problems.push(`La agenda de prueba trae avisos (¿faltan los feriados o las fuentes?): ${JSON.stringify(warnings.map((w) => w.message)).slice(0, 300)}`);

    // PNG con resvg (WebAssembly).
    const shown = await call('render_page', { path: 'humo.agenda.json', page: 3, width: 300 });
    const image = shown.content.find((c) => c.type === 'image');
    if (typeof image?.data !== 'string' || !Buffer.from(image.data, 'base64').subarray(1, 4).equals(Buffer.from('PNG'))) problems.push('render_page no devolvió una imagen PNG.');

    // PDF con pdfkit y las fuentes incrustadas.
    await call('export_pdf', { path: 'humo.agenda.json', mode: 'pages', out: 'humo.pdf' });
    const pdf = await readFile(join(workspace, 'humo.pdf')).catch(() => null);
    if (!pdf || pdf.subarray(0, 5).toString() !== '%PDF-' || pdf.length < 20_000) problems.push(`export_pdf no escribió un PDF válido (${pdf?.length ?? 0} bytes).`);

    // Las guías van dentro del paquete.
    const guide = await request('resources/read', { uri: 'agenda://guide' });
    const body = isObject(guide.result) && Array.isArray(guide.result.contents) ? guide.result.contents.filter(isObject)[0]?.text : null;
    if (typeof body !== 'string' || !body.includes('update_design')) problems.push('El recurso agenda://guide no trae la guía.');
  } catch (err) {
    problems.push((err as Error).message);
  }

  // Cerrar la entrada tiene que terminar el programa.
  child.stdin.end();
  const timeout = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 30_000));
  const end = await Promise.race([exited, timeout]);
  if (end === 'timeout') {
    problems.push('El servidor no terminó al cerrarse su entrada.');
    child.kill('SIGKILL');
    await exited;
  } else if (end.code !== 0) problems.push(`El servidor terminó con código ${end.code ?? end.signal}.`);
  if (buffer.trim() !== '') problems.push(`Quedó texto sin terminar en la salida estándar: ${JSON.stringify(buffer.slice(0, 120))}`);
  await rm(workspace, { recursive: true, force: true });
  report.ok = problems.length === 0;
  return report;
}

function parseArgs(argv: readonly string[]): SmokeOptions {
  const sep = argv.indexOf('--');
  if (sep < 0 || sep === argv.length - 1) throw new Error('Uso: mcp-smoke [--env CLAVE=valor]… [--timeout segundos] -- <comando> [argumentos…]');
  const env: Record<string, string> = {};
  let stepTimeoutMs: number | undefined;
  for (let i = 0; i < sep; i++) {
    if (argv[i] === '--env') {
      const [key, ...value] = (argv[++i] ?? '').split('=');
      if (!key) throw new Error('--env necesita CLAVE=valor');
      env[key] = value.join('=');
    } else if (argv[i] === '--timeout') stepTimeoutMs = Number(argv[++i]) * 1000;
    else throw new Error(`Opción desconocida: ${argv[i]}`);
  }
  return { command: argv[sep + 1]!, args: argv.slice(sep + 2), env, ...(stepTimeoutMs ? { stepTimeoutMs } : {}) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const options = parseArgs(process.argv.slice(2));
  const report = await smokeMcp(options);
  console.log(`Servidor ${report.serverVersion ?? '?'} · ${report.tools.length} herramientas · ${report.stdoutLines} mensajes por la salida estándar`);
  if (report.stderr.trim() !== '') console.log(`Salida de errores (informativa):\n${report.stderr.trim().split('\n').slice(0, 8).map((l) => `  ${l}`).join('\n')}`);
  if (report.ok) console.log('OK: el servidor MCP funciona y su salida estándar es solo del protocolo.');
  else {
    console.error(`FALLÓ:\n${report.problems.map((p) => `  · ${p}`).join('\n')}`);
    process.exitCode = 1;
  }
}
