/**
 * Paleta derivada de un color, en OKLCH (luminosidad, croma y tono perceptuales: dos colores con
 * la misma L se ven igual de claros). Del color base salen los tonos de la armonía elegida y a
 * cada uso se le da una luminosidad fija pensada para el papel: textos oscuros (se leen bien
 * impresos), líneas medias, fondos muy claros. Con un color sin croma (negro, gris) da una escala
 * de grises, ideal para impresoras láser monocromo.
 */
import { normalizeColor } from '../util/color';
import type { Harmony, ThemeTokens } from './themes';

interface Oklch {
  l: number;
  c: number;
  h: number;
}

const toLinear = (v: number): number => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toGamma = (v: number): number => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

/** `#rrggbb` → OKLCH (fórmulas de Björn Ottosson, 2020). */
export function hexToOklch(hex: string): Oklch {
  const n = normalizeColor(hex) ?? '#000000';
  const [r, g, b] = [1, 3, 5].map((i) => toLinear(parseInt(n.slice(i, i + 2), 16) / 255)) as [number, number, number];
  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  const c = Math.hypot(A, B);
  return { l: L, c, h: c < 1e-4 ? 0 : ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 };
}

/** OKLCH → sRGB lineal (puede quedar fuera de rango si el color no existe en pantalla). */
function oklchToLinear({ l, c, h }: Oklch): [number, number, number] {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_, -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_, -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_];
}

const inGamut = (rgb: [number, number, number]): boolean => rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4);

/** OKLCH → `#rrggbb`; si el color no se puede mostrar, baja el croma (mismo tono y luminosidad). */
export function oklchToHex(color: Oklch): string {
  let c = color.c;
  let rgb = oklchToLinear({ ...color, c });
  for (let i = 0; i < 24 && !inGamut(rgb); i++) {
    c *= 0.85;
    rgb = oklchToLinear({ ...color, c });
  }
  return `#${rgb.map((v) => Math.round(Math.min(1, Math.max(0, toGamma(Math.min(1, Math.max(0, v))))) * 255).toString(16).padStart(2, '0')).join('')}`;
}

/** Tonos de una armonía (en grados, a partir del tono base). */
export function harmonyHues(h: number, harmony: Harmony): number[] {
  const at = (d: number): number => (((h + d) % 360) + 360) % 360;
  switch (harmony) {
    case 'analogous':
      return [h, at(30), at(-30)];
    case 'complementary':
      return [h, at(180)];
    case 'split':
      return [h, at(150), at(210)];
    case 'triadic':
      return [h, at(120), at(240)];
    default:
      return [h];
  }
}

export interface DerivedPalette {
  colors: Omit<ThemeTokens['colors'], 'roles'>;
  roles: ThemeTokens['colors']['roles'];
  dots: string;
}

/**
 * Colores de la agenda a partir de un color y una armonía. Las luminosidades son fijas por uso
 * (texto ≤ 0,45: contraste alto sobre papel blanco); el croma del base se respeta en los títulos y
 * se modera en el resto, para que la página no se vuelva estridente.
 */
export function derivePalette(base: string, harmony: Harmony): DerivedPalette {
  const b = hexToOklch(base);
  const hues = harmonyHues(b.h, harmony);
  const h1 = hues[0] ?? b.h;
  const h2 = hues[1] ?? h1;
  const h3 = hues[2] ?? h2;
  const c0 = Math.min(b.c, 0.16);
  const col = (l: number, c: number, h: number): string => oklchToHex({ l, c: Math.min(c0, c), h });
  const ink = col(0.22, 0.03, h1);
  const primary = col(Math.min(0.45, Math.max(0.3, b.l)), 0.16, h1);
  return {
    colors: {
      ink,
      soft: col(0.32, 0.05, h1),
      rule: col(0.7, 0.03, h1),
      ruleSoft: col(0.83, 0.02, h1),
      weekend: col(0.94, 0.015, h1),
      accent: col(0.5, 0.16, h2),
    },
    roles: {
      display: primary,
      title: primary,
      heading: col(0.35, 0.12, h2),
      labelStrong: col(0.25, 0.06, h1),
      label: col(0.4, 0.04, h1),
      body: ink,
      number: ink,
      quote: col(0.42, 0.1, h3),
    },
    dots: col(0.45, 0.03, h1),
  };
}
