/**
 * Piezas puras del editor: preferencias guardadas en el equipo, tamaño de la interfaz, rutas de
 * ajustes anidados, estilos por página, plataforma de la aplicación de escritorio y los valores
 * por defecto a los que vuelve un «restablecer».
 */
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OVERRIDE_DEFAULTS, WATERMARK_DEFAULTS, designDefaults, parseDesign, type PageStyle } from '../src/core/design/schema';
import { withPageStyle } from '../src/core/design/pageStyles';
import { deleteAtPath, getAtPath, setAtPath, type PlainRecord } from '../src/core/util/path';
import { PANEL_LIMITS, prefs, UI_SCALE, WELCOME_ON_START_DEFAULT } from '../src/app/state/prefs';
import { DATA_FOLDERS, dataFolderFor, detectPlatform, isDesktopApp } from '../src/app/state/platform';
import { DESKTOP_BREAKPOINT, effectiveUiScale } from '../src/app/state/uiScaleMath';
import { ROOT } from './helpers/node-env';
import { join } from 'node:path';

describe('rutas de ajustes anidados', () => {
  it('lee, escribe y quita por ruta', () => {
    const tokens: PlainRecord = {};
    setAtPath(tokens, ['dots', 'pitch'], 5);
    setAtPath(tokens, ['dots', 'radius'], 0.4);
    setAtPath(tokens, ['writing', 'style'], 'dots');
    expect(tokens).toEqual({ dots: { pitch: 5, radius: 0.4 }, writing: { style: 'dots' } });
    expect(getAtPath(tokens, ['dots', 'pitch'])).toBe(5);
    expect(getAtPath(tokens, ['dots', 'nada'])).toBeUndefined();
    expect(getAtPath(tokens, ['nada', 'de', 'nada'])).toBeUndefined();
    expect(getAtPath(tokens, [])).toBe(tokens);
  });

  it('al quitar el último valor de un objeto, también quita el objeto vacío', () => {
    const tokens: PlainRecord = { dots: { pitch: 5 }, writing: { style: 'dots', pitch: 6 } };
    expect(deleteAtPath(tokens, ['dots', 'pitch'])).toBe(true);
    expect(tokens).toEqual({ writing: { style: 'dots', pitch: 6 } });
    expect(deleteAtPath(tokens, ['writing', 'pitch'])).toBe(true);
    expect(tokens).toEqual({ writing: { style: 'dots' } });
    expect(deleteAtPath(tokens, ['writing', 'nada'])).toBe(false);
    expect(deleteAtPath(tokens, ['nada', 'nada'])).toBe(false);
    // La raíz queda aunque se vacíe.
    expect(deleteAtPath(tokens, ['writing', 'style'])).toBe(true);
    expect(tokens).toEqual({});
  });

  it('reemplaza un valor que no es un objeto en el camino y rechaza claves del prototipo', () => {
    const tokens: PlainRecord = { dots: 3 };
    setAtPath(tokens, ['dots', 'pitch'], 5);
    expect(tokens).toEqual({ dots: { pitch: 5 } });
    for (const key of ['__proto__', 'constructor', 'prototype']) {
      expect(() => setAtPath({}, [key, 'x'], 1)).toThrow(/no permitida/);
      expect(() => getAtPath({}, ['a', key])).toThrow(/no permitida/);
      expect(() => deleteAtPath({}, [key])).toThrow(/no permitida/);
    }
    expect(({} as PlainRecord).x).toBeUndefined();
    expect(() => setAtPath({}, [], 1)).toThrow(/vacía/);
  });
});

describe('estilos por tipo de página o por página', () => {
  const type = { pageType: 'notes', pageKey: null };
  const page = { pageType: 'notes', pageKey: 'notes:3' };

  it('agrega, cambia y quita sin tocar la lista original', () => {
    const empty: PageStyle[] = [];
    const one = withPageStyle(empty, type, ['dots', 'pitch'], 5);
    expect(empty).toEqual([]);
    expect(one).toEqual([{ pageType: 'notes', pageKey: null, tokens: { dots: { pitch: 5 } } }]);
    const two = withPageStyle(one, type, ['dots', 'radius'], 0.4);
    expect(two).toHaveLength(1);
    expect(two[0]!.tokens).toEqual({ dots: { pitch: 5, radius: 0.4 } });
    expect(one[0]!.tokens).toEqual({ dots: { pitch: 5 } });
    const three = withPageStyle(two, page, ['writing', 'style'], 'grid');
    expect(three).toHaveLength(2);
  });

  it('quitar el último valor de un estilo lo saca de la lista (el archivo no guarda entradas vacías)', () => {
    let styles = withPageStyle([], type, ['dots', 'pitch'], 5);
    styles = withPageStyle(styles, page, ['writing', 'style'], 'grid');
    styles = withPageStyle(styles, type, ['dots', 'pitch'], undefined);
    expect(styles).toEqual([{ pageType: 'notes', pageKey: 'notes:3', tokens: { writing: { style: 'grid' } } }]);
    expect(withPageStyle(styles, type, ['dots', 'pitch'], undefined)).toEqual(styles);
    expect(withPageStyle(styles, page, ['writing', 'style'], undefined)).toEqual([]);
  });
});

describe('preferencias de la interfaz', () => {
  class MemoryStorage {
    private readonly data = new Map<string, string>();
    getItem = (k: string): string | null => this.data.get(k) ?? null;
    setItem = (k: string, v: string): void => void this.data.set(k, v);
    removeItem = (k: string): void => void this.data.delete(k);
  }
  let storage: MemoryStorage;
  beforeEach(() => {
    storage = new MemoryStorage();
    vi.stubGlobal('localStorage', storage);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('sin nada guardado, valen los valores por defecto', () => {
    expect(prefs.welcomeOnStart.read()).toBe(WELCOME_ON_START_DEFAULT);
    expect(prefs.uiScale.read()).toBe(UI_SCALE.default);
    expect(prefs.panel.left.read()).toBe(PANEL_LIMITS.left.default);
    expect(prefs.uiLang.read()).toBeNull();
    expect(prefs.uiLang.isSet()).toBe(false);
  });

  it('guarda, lee y borra', () => {
    prefs.welcomeOnStart.write(false);
    prefs.uiScale.write(1.25);
    prefs.panel.right.write(300);
    prefs.uiLang.write('pt');
    expect(prefs.welcomeOnStart.read()).toBe(false);
    expect(prefs.uiScale.read()).toBe(1.25);
    expect(prefs.panel.right.read()).toBe(300);
    expect(prefs.uiLang.read()).toBe('pt');
    expect(prefs.uiLang.isSet()).toBe(true);
    prefs.uiLang.clear();
    expect(prefs.uiLang.read()).toBeNull();
    // La clave del idioma es la de siempre y un texto plano: lo guardado por versiones anteriores se sigue leyendo.
    storage.setItem('agenda-studio.uiLang', 'it');
    expect(prefs.uiLang.read()).toBe('it');
  });

  it('un valor ilegible se ignora y uno fuera de rango se acomoda', () => {
    storage.setItem('agenda-studio.welcomeOnStart', 'quizás');
    storage.setItem('agenda-studio.uiScale', 'grande');
    storage.setItem('agenda-studio.uiLang', 'fr');
    storage.setItem('agenda-studio.panel.left', '99999');
    storage.setItem('agenda-studio.panel.right', '-5');
    storage.setItem('agenda-studio.panel.thumbs', '');
    expect(prefs.welcomeOnStart.read()).toBe(WELCOME_ON_START_DEFAULT);
    expect(prefs.uiScale.read()).toBe(UI_SCALE.default);
    expect(prefs.uiLang.read()).toBeNull();
    expect(prefs.panel.left.read()).toBe(PANEL_LIMITS.left.max);
    expect(prefs.panel.right.read()).toBe(PANEL_LIMITS.right.min);
    expect(prefs.panel.thumbs.read()).toBe(PANEL_LIMITS.thumbs.default);
  });

  it('sin almacenamiento disponible nada falla', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('bloqueado');
      },
      removeItem: () => {
        throw new Error('bloqueado');
      },
    });
    expect(() => prefs.welcomeOnStart.write(false)).not.toThrow();
    expect(prefs.welcomeOnStart.read()).toBe(WELCOME_ON_START_DEFAULT);
    expect(prefs.uiLang.isSet()).toBe(false);
    expect(() => prefs.uiLang.clear()).not.toThrow();
  });

  it('los tamaños por defecto están dentro de sus límites', () => {
    for (const { min, max, default: d } of Object.values(PANEL_LIMITS)) {
      expect(min).toBeLessThan(max);
      expect(d).toBeGreaterThanOrEqual(min);
      expect(d).toBeLessThanOrEqual(max);
    }
    expect(UI_SCALE.presets).toContain(UI_SCALE.default);
    for (const p of UI_SCALE.presets) expect(p >= UI_SCALE.min && p <= UI_SCALE.max).toBe(true);
  });
});

describe('tamaño de la interfaz', () => {
  it('por debajo de 100 % se aplica tal cual', () => {
    expect(effectiveUiScale(0.8, 500)).toBe(0.8);
    expect(effectiveUiScale(1, 300)).toBe(1);
  });

  it('por encima de 100 % la maquetación no baja del ancho de escritorio', () => {
    // 1280 px con 150 %: la maquetación quedaría en 853 px, por encima de 768: se aplica entera.
    expect(effectiveUiScale(1.5, 1280)).toBe(1.5);
    // 1000 px: a lo sumo 1000 / 768 ≈ 1,30.
    expect(effectiveUiScale(1.5, 1000)).toBeCloseTo(1000 / DESKTOP_BREAKPOINT, 10);
    expect(1000 / effectiveUiScale(1.5, 1000)).toBeGreaterThanOrEqual(DESKTOP_BREAKPOINT);
    // Una ventana angosta (un teléfono): sin zoom.
    expect(effectiveUiScale(1.5, 400)).toBe(1);
    expect(effectiveUiScale(1.25, 768)).toBe(1);
  });
});

describe('plataforma de la aplicación de escritorio', () => {
  const UA = {
    linux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) heritage-studio/2.0.0 Chrome/156.0.0.0 Electron/45.2.2 Safari/537.36',
    windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) heritage-studio/2.0.0 Chrome/156.0.0.0 Electron/45.2.2 Safari/537.36',
    mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) heritage-studio/2.0.0 Chrome/156.0.0.0 Electron/45.2.2 Safari/537.36',
    chromeLinux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36',
    android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Mobile Safari/537.36',
    iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  } as const;

  it('reconoce el sistema y la carpeta de datos solo en la aplicación de escritorio', () => {
    expect(dataFolderFor(UA.linux)).toBe(DATA_FOLDERS.linux);
    expect(dataFolderFor(UA.windows)).toBe(DATA_FOLDERS.windows);
    expect(dataFolderFor(UA.mac)).toBe(DATA_FOLDERS.mac);
    // Un navegador no tiene carpeta: guarda en su propio almacenamiento.
    expect(dataFolderFor(UA.chromeLinux)).toBeNull();
    expect(isDesktopApp(UA.chromeLinux)).toBe(false);
    expect(isDesktopApp(UA.linux)).toBe(true);
  });

  it('un teléfono no es un sistema de escritorio (Android dice «Linux» y el iPhone «Mac OS X»)', () => {
    expect(detectPlatform(UA.android)).toBeNull();
    expect(detectPlatform(UA.iphone)).toBeNull();
    expect(detectPlatform(UA.chromeLinux)).toBe('linux');
  });

  it('las carpetas son las que fija el proceso principal de Electron', () => {
    const main = readFileSync(join(ROOT, 'electron/desktop.mjs'), 'utf8');
    const appName = /const APP_NAME = '([^']+)'/.exec(main)?.[1];
    expect(appName).toBeTruthy();
    for (const folder of Object.values(DATA_FOLDERS)) expect(folder.endsWith(appName!)).toBe(true);
    // userData = <appData>/<APP_NAME>: %APPDATA%, ~/Library/Application Support y ~/.config.
    expect(main).toContain("app.getPath('appData')");
    expect(DATA_FOLDERS.windows.startsWith('%APPDATA%')).toBe(true);
    expect(DATA_FOLDERS.mac).toContain('Library/Application Support');
    expect(DATA_FOLDERS.linux).toContain('.config');
  });
});

describe('valores por defecto para restablecer', () => {
  it('salen del esquema', () => {
    expect(OVERRIDE_DEFAULTS).toMatchObject({ dx: 0, dy: 0, scale: 1, rotation: 0, opacity: 1, hidden: false });
    expect(WATERMARK_DEFAULTS).toMatchObject({ width: 12, opacity: 1, rotation: 0, minStrokePt: 0.3 });
    const d = designDefaults();
    expect(d.binding.signature.sheets).toBeGreaterThan(0);
    expect(d.binding.gutter).toBeGreaterThanOrEqual(0);
    expect(designDefaults()).toBe(d);
  });

  it('una agenda recién creada parte de esos mismos valores', () => {
    const d = parseDesign({ overrides: [{ pageType: 'notes', blockId: 'x' }], watermarks: [{ id: 'w', assetId: 'a' }] });
    expect(d.overrides[0]).toMatchObject({ scale: OVERRIDE_DEFAULTS.scale, opacity: OVERRIDE_DEFAULTS.opacity });
    expect(d.watermarks[0]).toMatchObject({ width: WATERMARK_DEFAULTS.width });
  });
});
