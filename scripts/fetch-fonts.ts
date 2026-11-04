/**
 * Descarga las familias tipográficas integradas (todas con licencia SIL OFL 1.1)
 * desde la API de Google Fonts como instancias estáticas TrueType, las recorta
 * a los alfabetos latinos (es, pt, it, en, fr, de, ca, gl, eu…) con HarfBuzz
 * (`subset-font`) conservando kerning, ligaduras y cifras tabulares, y escribe
 * `public/fonts/fonts.json` con el manifiesto que usa la aplicación.
 *
 * Uso:  npm run fonts            (vuelve a descargar todo)
 *
 * Las fuentes resultantes se versionan en git: el script solo hace falta para
 * actualizarlas o agregar familias nuevas.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import subsetFont from 'subset-font';

interface FamilySpec {
  family: string;
  dir: string;
  /** Nombre del archivo base en google/fonts (para OFL.txt). */
  oflPath: string;
  normal: number[];
  italic: number[];
  category: 'serif' | 'sans' | 'handwriting';
  designer: string;
  note: string;
}

const FAMILIES: FamilySpec[] = [
  {
    family: 'Cormorant Garamond',
    dir: 'cormorant-garamond',
    oflPath: 'ofl/cormorantgaramond/OFL.txt',
    normal: [300, 400, 500, 600, 700],
    italic: [300, 400, 500, 600, 700],
    category: 'serif',
    designer: 'Christian Thalmann (Catharsis Fonts)',
    note: 'Títulos del tema Heritage.',
  },
  {
    family: 'Manrope',
    dir: 'manrope',
    oflPath: 'ofl/manrope/OFL.txt',
    normal: [200, 300, 400, 500, 600, 700, 800],
    italic: [],
    category: 'sans',
    designer: 'Mikhail Sharanda',
    note: 'Datos y rótulos del tema Heritage.',
  },
  {
    family: 'Atkinson Hyperlegible Next',
    dir: 'atkinson-hyperlegible-next',
    oflPath: 'ofl/atkinsonhyperlegiblenext/OFL.txt',
    normal: [300, 400, 500, 600, 700],
    italic: [400, 700],
    category: 'sans',
    designer: 'Braille Institute, Applied Design Works, Elliott Scott, Megan Eiswerth, Linus Boman, Theodore Petrosky',
    note: 'Máxima legibilidad (baja visión, personas mayores).',
  },
  {
    family: 'EB Garamond',
    dir: 'eb-garamond',
    oflPath: 'ofl/ebgaramond/OFL.txt',
    normal: [400, 500, 600, 700],
    italic: [400, 600],
    category: 'serif',
    designer: 'Georg Duffner, Octavio Pardo',
    note: 'Garamond clásica para textos largos.',
  },
  {
    family: 'Caveat',
    dir: 'caveat',
    oflPath: 'ofl/caveat/OFL.txt',
    normal: [400, 600],
    italic: [],
    category: 'handwriting',
    designer: 'Impallari Type',
    note: 'Manuscrita para frases y acentos.',
  },
];

/** Rangos Unicode que se conservan (alfabetos latinos + signos útiles en una agenda). */
const RANGES: Array<[number, number]> = [
  [0x0020, 0x007e], // Latín básico
  [0x00a0, 0x024f], // Latín-1, Extendido A y B
  [0x0250, 0x02ff], // IPA y modificadores
  [0x0300, 0x036f], // Diacríticos combinables
  [0x1e00, 0x1eff], // Latín extendido adicional
  [0x2000, 0x206f], // Puntuación general (comillas, guiones, …)
  [0x20a0, 0x20cf], // Monedas
  [0x2100, 0x218f], // Letras y formas numéricas (№, ℃, ½…)
  [0x2190, 0x21ff], // Flechas
  [0x2200, 0x22ff], // Operadores
  [0x2300, 0x23ff], // Técnicos (⌚…)
  [0x25a0, 0x25ff], // Formas geométricas (○ ● □ ■)
  [0x2600, 0x27bf], // Símbolos y dingbats (☀ ☾ ✓ ✗ ★)
  [0xfb00, 0xfb06], // Ligaduras latinas
];

const WEIGHT_NAMES: Record<number, string> = {
  100: 'Thin',
  200: 'ExtraLight',
  300: 'Light',
  400: 'Regular',
  500: 'Medium',
  600: 'SemiBold',
  700: 'Bold',
  800: 'ExtraBold',
  900: 'Black',
};

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'fonts');

function rangeText(): string {
  let s = '';
  for (const [a, b] of RANGES) for (let cp = a; cp <= b; cp++) s += String.fromCodePoint(cp);
  return s;
}

interface FaceInfo {
  family: string;
  style: 'normal' | 'italic';
  weight: number;
  url: string;
}

async function fetchCss(spec: FamilySpec): Promise<FaceInfo[]> {
  const axes: string[] = [];
  const hasItalic = spec.italic.length > 0;
  if (hasItalic) {
    const parts = [...spec.normal.map((w) => `0,${w}`), ...spec.italic.map((w) => `1,${w}`)];
    axes.push(`ital,wght@${parts.join(';')}`);
  } else {
    axes.push(`wght@${spec.normal.join(';')}`);
  }
  const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(spec.family).replace(/%20/g, '+')}:${axes[0]}`;
  // Sin User-Agent de navegador la API entrega TrueType estático (no WOFF2 variable).
  const res = await fetch(url, { headers: { 'User-Agent': 'agenda-heritage-studio/fetch-fonts' } });
  if (!res.ok) throw new Error(`Google Fonts respondió ${res.status} para ${spec.family}`);
  const css = await res.text();
  const faces: FaceInfo[] = [];
  for (const block of css.split('@font-face').slice(1)) {
    const style = /font-style:\s*(\w+)/.exec(block)?.[1] === 'italic' ? 'italic' : 'normal';
    const weight = Number(/font-weight:\s*(\d+)/.exec(block)?.[1] ?? 400);
    const src = /url\((https:[^)]+\.ttf)\)/.exec(block)?.[1];
    if (!src) throw new Error(`No se encontró TTF para ${spec.family} ${style} ${weight}`);
    faces.push({ family: spec.family, style, weight, url: src });
  }
  return faces;
}

async function main(): Promise<void> {
  const keep = rangeText();
  const manifest: {
    generatedBy: string;
    families: Array<{
      family: string;
      category: string;
      designer: string;
      license: string;
      note: string;
      faces: Array<{ weight: number; style: string; file: string; bytes: number }>;
    }>;
  } = { generatedBy: 'scripts/fetch-fonts.ts', families: [] };

  for (const spec of FAMILIES) {
    const dir = join(outDir, spec.dir);
    await mkdir(dir, { recursive: true });
    const faces = await fetchCss(spec);
    const entry = {
      family: spec.family,
      category: spec.category,
      designer: spec.designer,
      license: `${spec.dir}/OFL.txt`,
      note: spec.note,
      faces: [] as Array<{ weight: number; style: string; file: string; bytes: number }>,
    };
    for (const face of faces) {
      const res = await fetch(face.url);
      if (!res.ok) throw new Error(`Descarga fallida ${face.url}: ${res.status}`);
      const original = new Uint8Array(await res.arrayBuffer());
      const subset = await subsetFont(Buffer.from(original), keep, { targetFormat: 'truetype' });
      const base = spec.family.replace(/\s+/g, '');
      const fileName = `${base}-${WEIGHT_NAMES[face.weight] ?? face.weight}${face.style === 'italic' ? 'Italic' : ''}.ttf`;
      await writeFile(join(dir, fileName), subset);
      entry.faces.push({ weight: face.weight, style: face.style, file: `${spec.dir}/${fileName}`, bytes: subset.length });
      console.log(`  ${spec.family} ${face.style} ${face.weight}: ${original.length} → ${subset.length} bytes`);
    }
    entry.faces.sort((a, b) => (a.style === b.style ? a.weight - b.weight : a.style === 'normal' ? -1 : 1));
    const ofl = await fetch(`https://raw.githubusercontent.com/google/fonts/main/${spec.oflPath}`);
    if (!ofl.ok) throw new Error(`No se pudo descargar la licencia de ${spec.family}`);
    await writeFile(join(dir, 'OFL.txt'), await ofl.text());
    manifest.families.push(entry);
  }
  await writeFile(join(outDir, 'fonts.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Manifiesto escrito en ${join(outDir, 'fonts.json')}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
