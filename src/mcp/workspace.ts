/**
 * Carpeta de trabajo del servidor MCP: todo archivo que lee o escribe tiene que estar adentro
 * (también siguiendo enlaces simbólicos), y cada herramienta solo escribe su tipo de archivo. Así
 * un pedido no puede leer ni pisar otros archivos de la computadora ni del programa.
 */
import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';

/**
 * Tope de lectura: un `.agenda.json` con imágenes y fuentes incrustadas puede pesar decenas de MB (una
 * fuente grande, como Arial Unicode, son unos 30 MB en base64). Lo que este servidor escribe como texto
 * no puede pasarlo: si no, no lo podría volver a abrir.
 */
export const MAX_READ_BYTES = 128 * 1024 * 1024;

export class Workspace {
  readonly root: string;

  constructor(root: string) {
    // La versión nativa: en Windows es la única que expande los nombres cortos (`RUNNER~1`) igual
    // que `realpath` de las lecturas; con la de JavaScript la raíz y las rutas no coincidirían.
    this.root = realpathSync.native(resolve(root));
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
    const full = await this.checkedFile(path, extensions, MAX_READ_BYTES);
    return { full, text: await readFile(full, 'utf8') };
  }

  /** Como `read`, los bytes tal cual (una fuente, una imagen), con su propio tope de tamaño. */
  async readBytes(path: string, extensions: readonly string[], maxBytes: number): Promise<{ full: string; bytes: Uint8Array }> {
    const full = await this.checkedFile(path, extensions, maxBytes);
    return { full, bytes: new Uint8Array(await readFile(full)) };
  }

  /** La ruta real de un archivo de la carpeta de trabajo con una de esas extensiones y no más grande que `maxBytes`. */
  private async checkedFile(path: string, extensions: readonly string[], maxBytes: number): Promise<string> {
    if (!extensions.some((e) => path.toLowerCase().endsWith(e))) throw new Error(`Solo se leen archivos ${extensions.join(' o ')}.`);
    const full = await realpath(this.lexical(path)).catch(() => {
      throw new Error(`No existe «${path}» en la carpeta de trabajo.`);
    });
    if (!this.inside(full)) throw new Error(`«${path}» lleva fuera de la carpeta de trabajo.`);
    const info = await lstat(full);
    if (!info.isFile()) throw new Error(`«${path}» no es un archivo.`);
    if (info.size > maxBytes) throw new Error(`«${path}» pesa más de ${Math.round(maxBytes / 1024 / 1024)} MB.`);
    return full;
  }

  /**
   * Escribe un archivo con una de las extensiones permitidas. Un archivo existente solo se pisa
   * con `overwrite`, y nunca a través de un enlace simbólico.
   */
  async write(path: string, data: string | Uint8Array, opts: { extensions: readonly string[]; overwrite: boolean }): Promise<string> {
    const full = this.lexical(path);
    const lower = full.toLowerCase();
    if (!opts.extensions.some((e) => lower.endsWith(e))) throw new Error(`El archivo tiene que terminar en ${opts.extensions.join(' o ')}.`);
    if (typeof data === 'string' && Buffer.byteLength(data, 'utf8') > MAX_READ_BYTES) {
      throw new Error(`«${path}» quedaría de ${Math.round(Buffer.byteLength(data, 'utf8') / 1024 / 1024)} MB, más de lo que se puede volver a abrir (${MAX_READ_BYTES / 1024 / 1024} MB): sacá imágenes o fuentes incrustadas que no uses, o usá archivos más livianos.`);
    }
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
