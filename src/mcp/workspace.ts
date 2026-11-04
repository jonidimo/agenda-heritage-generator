/**
 * Carpeta de trabajo del servidor MCP: todo archivo que lee o escribe tiene que estar adentro
 * (también siguiendo enlaces simbólicos), y cada herramienta solo escribe su tipo de archivo. Así
 * un pedido no puede leer ni pisar otros archivos de la computadora ni del programa.
 */
import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';

/** Tope de lectura: un `.agenda.json` con imágenes incrustadas puede pesar varios MB. */
const MAX_READ_BYTES = 64 * 1024 * 1024;

export class Workspace {
  readonly root: string;

  constructor(root: string) {
    this.root = realpathSync(resolve(root));
  }

  private inside(full: string): boolean {
    return full === this.root || full.startsWith(this.root + sep);
  }

  /** Ruta para mostrar (relativa a la carpeta de trabajo). */
  show(full: string): string {
    return relative(this.root, full) || '.';
  }

  private lexical(path: string): string {
    const full = resolve(this.root, path);
    if (!this.inside(full)) throw new Error(`«${path}» está fuera de la carpeta de trabajo (${this.root}).`);
    return full;
  }

  /** Lee un archivo de texto con una de las extensiones permitidas. */
  async read(path: string, extensions: readonly string[]): Promise<{ full: string; text: string }> {
    if (!extensions.some((e) => path.toLowerCase().endsWith(e))) throw new Error(`Solo se leen archivos ${extensions.join(' o ')}.`);
    const full = await realpath(this.lexical(path)).catch(() => {
      throw new Error(`No existe «${path}» en la carpeta de trabajo.`);
    });
    if (!this.inside(full)) throw new Error(`«${path}» lleva fuera de la carpeta de trabajo.`);
    const info = await lstat(full);
    if (!info.isFile()) throw new Error(`«${path}» no es un archivo.`);
    if (info.size > MAX_READ_BYTES) throw new Error(`«${path}» pesa más de ${MAX_READ_BYTES / 1024 / 1024} MB.`);
    return { full, text: await readFile(full, 'utf8') };
  }

  /**
   * Escribe un archivo con una de las extensiones permitidas. Un archivo existente solo se pisa
   * con `overwrite`, y nunca a través de un enlace simbólico.
   */
  async write(path: string, data: string | Uint8Array, opts: { extensions: readonly string[]; overwrite: boolean }): Promise<string> {
    const full = this.lexical(path);
    const lower = full.toLowerCase();
    if (!opts.extensions.some((e) => lower.endsWith(e))) throw new Error(`El archivo tiene que terminar en ${opts.extensions.join(' o ')}.`);
    // Antes de crear carpetas: la más cercana que ya existe tiene que estar adentro (un enlace
    // simbólico en el camino no puede hacer crear carpetas en otro lado).
    let existing = dirname(full);
    while (!(await lstat(existing).catch(() => null))) existing = dirname(existing);
    if (!this.inside(await realpath(existing))) throw new Error(`«${path}» lleva fuera de la carpeta de trabajo.`);
    await mkdir(dirname(full), { recursive: true });
    const parent = await realpath(dirname(full));
    if (!this.inside(parent)) throw new Error(`«${path}» lleva fuera de la carpeta de trabajo.`);
    const current = await lstat(full).catch(() => null);
    if (current?.isSymbolicLink()) throw new Error(`«${path}» es un enlace simbólico: no se escribe a través de él.`);
    if (current && !opts.overwrite) throw new Error(`«${path}» ya existe (para reemplazarlo, pedilo con overwrite).`);
    await writeFile(full, data);
    return full;
  }
}
