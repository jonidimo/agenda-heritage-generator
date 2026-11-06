/**
 * Genera la biblioteca de íconos (`public/icons/lucide/*.svg`) desde el paquete `lucide-react`: lee los
 * datos de cada ícono de la lista de `src/core/assets/icons.ts` y escribe un SVG estático de trazo
 * (`currentColor`), sin nada de React. Los SVG se guardan en el repositorio; la integración continua
 * vuelve a correr este script y exige que no cambien.
 *
 *   npx tsx scripts/build-icons.ts
 */
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ICONS } from '../src/core/assets/icons';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'icons', 'lucide');
const require = createRequire(import.meta.url);
const PKG = dirname(require.resolve('lucide-react/package.json'));

type IconNode = Array<[string, Record<string, string | number>]>;

const escape = (v: string): string => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function toSvg(node: IconNode): string {
  const children = node.map(([tag, attrs]) => {
    const list = Object.entries(attrs)
      .filter(([k]) => k !== 'key')
      .map(([k, v]) => `${k}="${escape(String(v))}"`)
      .join(' ');
    return `  <${tag} ${list}/>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">\n${children.join('\n')}\n</svg>\n`;
}

/** Los datos de un ícono; algunos nombres son alias de otro archivo (`export { default } from './otro.mjs'`). */
async function iconData(name: string, depth = 0): Promise<IconNode | null> {
  if (depth > 3) return null;
  const file = join(PKG, 'dist', 'esm', 'icons', `${name}.mjs`);
  const mod = (await import(pathToFileURL(file).href)) as { __iconData?: { node: IconNode } };
  if (mod.__iconData) return mod.__iconData.node;
  const alias = /from '\.\/([a-z0-9-]+)\.mjs'/.exec(await readFile(file, 'utf8'));
  return alias ? iconData(alias[1]!, depth + 1) : null;
}

async function main(): Promise<void> {
  const version = (JSON.parse(await readFile(join(PKG, 'package.json'), 'utf8')) as { version: string }).version;
  await mkdir(OUT, { recursive: true });
  // Lo que ya no está en la lista se borra (así la carpeta es exactamente la lista).
  const wanted = new Set(ICONS.map((i) => `${i.id}.svg`));
  for (const f of await readdir(OUT)) if (f.endsWith('.svg') && !wanted.has(f)) await rm(join(OUT, f));
  for (const icon of ICONS) {
    const data = await iconData(icon.id);
    if (!data) throw new Error(`lucide-react ${version} no trae los datos del ícono «${icon.id}»`);
    await writeFile(join(OUT, `${icon.id}.svg`), toSvg(data));
  }
  const license = await readFile(join(PKG, 'LICENSE'), 'utf8');
  await writeFile(join(OUT, 'LICENSE.txt'), `Íconos de Lucide (https://lucide.dev), versión ${version} de lucide-react.\n\n${license}`);
  console.log(`${ICONS.length} íconos escritos en ${OUT}`);
}

await main();
