/**
 * Preferencias de la interfaz guardadas en este equipo (localStorage): idioma, tamaño de la
 * interfaz, anchos de los paneles y si el asistente se muestra al iniciar. No viajan con las
 * agendas: son de quien usa el programa.
 *
 * Cada preferencia declara su clave, su valor por defecto y cómo se lee y se escribe. Un valor
 * ilegible o fuera de rango se ignora o se acomoda (nunca impide el arranque) y, sin
 * almacenamiento disponible (modo privado, datos bloqueados), todo sigue funcionando con los
 * valores por defecto.
 */
import { LANGUAGES, type Lang } from '@core/i18n';

export interface Pref<T> {
  /** El valor guardado, o el valor por defecto. */
  read(): T;
  /** Hay un valor guardado y válido (no se está usando el por defecto). */
  isSet(): boolean;
  write(value: T): void;
  clear(): void;
}

interface Codec<T> {
  /** `undefined` si el texto guardado no sirve. */
  decode(raw: string): T | undefined;
  encode(value: T): string;
}

const boolCodec: Codec<boolean> = {
  decode: (raw) => (raw === 'true' ? true : raw === 'false' ? false : undefined),
  encode: String,
};

/** Un número dentro de [min, max]: uno guardado fuera de ese rango se acomoda a él. */
function rangeCodec(min: number, max: number): Codec<number> {
  return {
    decode(raw) {
      const n = Number(raw);
      return raw.trim() !== '' && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : undefined;
    },
    encode: String,
  };
}

function choiceCodec<T extends string>(values: readonly T[]): Codec<T> {
  return { decode: (raw) => values.find((v) => v === raw), encode: (v) => v };
}

function definePref<T>(key: string, fallback: T, codec: Codec<T>): Pref<T> {
  const stored = (): T | undefined => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? undefined : codec.decode(raw);
    } catch {
      return undefined;
    }
  };
  return {
    read: () => stored() ?? fallback,
    isSet: () => stored() !== undefined,
    write(value) {
      try {
        localStorage.setItem(key, codec.encode(value));
      } catch {
        /* sin almacenamiento: el valor vale hasta cerrar el programa */
      }
    },
    clear() {
      try {
        localStorage.removeItem(key);
      } catch {
        /* sin almacenamiento */
      }
    },
  };
}

/** Tamaño de la interfaz (1 = 100 %), independiente del zoom de la página. */
export const UI_SCALE = { min: 0.8, max: 1.5, default: 1, presets: [0.9, 1, 1.1, 1.25, 1.5] } as const;

/** Tamaños de los paneles, en píxeles (el ancho de las columnas y el de las miniaturas de abajo). */
export const PANEL_LIMITS = {
  /** Panel izquierdo (ancho). */
  left: { min: 260, max: 520, default: 330 },
  /** Panel derecho (ancho). */
  right: { min: 240, max: 480, default: 280 },
  /** Tira de miniaturas de abajo (ancho de cada miniatura). */
  thumbs: { min: 28, max: 130, default: 46 },
} as const;

export type PanelId = keyof typeof PANEL_LIMITS;

/** Si el asistente de «Nueva agenda» se muestra al abrir el programa. */
export const WELCOME_ON_START_DEFAULT = true;

export const prefs = {
  /** Idioma elegido a mano; sin valor, la interfaz sigue al idioma de la agenda abierta. */
  uiLang: definePref<Lang | null>('agenda-studio.uiLang', null, choiceCodec<Lang>(LANGUAGES)),
  welcomeOnStart: definePref<boolean>('agenda-studio.welcomeOnStart', WELCOME_ON_START_DEFAULT, boolCodec),
  /** Al elegir un filete u ornamento, el panel de Estilo se desplaza solo a su editor. */
  autoReveal: definePref<boolean>('agenda-studio.autoReveal', true, boolCodec),
  /** Permitir que un modelo de IA (servidor MCP) lea y edite la agenda abierta en la aplicación de escritorio. */
  liveLink: definePref<boolean>('agenda-studio.liveLink', true, boolCodec),
  /** Qué se está haciendo con la agenda: diseñarla o prepararla para imprimir. */
  mode: definePref<'design' | 'print'>('agenda-studio.mode', 'design', choiceCodec(['design', 'print'] as const)),
  uiScale: definePref<number>('agenda-studio.uiScale', UI_SCALE.default, rangeCodec(UI_SCALE.min, UI_SCALE.max)),
  panel: {
    left: definePref<number>('agenda-studio.panel.left', PANEL_LIMITS.left.default, rangeCodec(PANEL_LIMITS.left.min, PANEL_LIMITS.left.max)),
    right: definePref<number>('agenda-studio.panel.right', PANEL_LIMITS.right.default, rangeCodec(PANEL_LIMITS.right.min, PANEL_LIMITS.right.max)),
    thumbs: definePref<number>('agenda-studio.panel.thumbs', PANEL_LIMITS.thumbs.default, rangeCodec(PANEL_LIMITS.thumbs.min, PANEL_LIMITS.thumbs.max)),
  },
} as const;
