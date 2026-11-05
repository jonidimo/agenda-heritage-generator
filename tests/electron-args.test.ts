/**
 * Línea de comandos de la aplicación de escritorio: `--mcp` la arranca como servidor MCP, y en
 * Linux sin pantalla hay que decir cómo hacerlo andar. Funciones puras, sin Electron.
 */
import { describe, expect, it } from 'vitest';
import { HEADLESS_FLAG, MCP_FLAG, MISSING_DISPLAY_MESSAGE, missingDisplay, wantsMcp } from '../electron/lib/args.mjs';

describe('wantsMcp', () => {
  it('detecta --mcp en la aplicación instalada y en `electron .`', () => {
    expect(wantsMcp(['/opt/Heritage Studio/agenda-heritage-studio', '--mcp'])).toBe(true);
    expect(wantsMcp(['/usr/bin/electron', '.', '--no-sandbox', '--mcp'])).toBe(true);
  });

  it('sin la opción abre la ventana', () => {
    expect(wantsMcp(['/opt/Heritage Studio/agenda-heritage-studio'])).toBe(false);
    expect(wantsMcp(['/usr/bin/electron', '.', '--disable-gpu'])).toBe(false);
  });

  it('el ejecutable mismo no cuenta, ni una opción parecida', () => {
    expect(wantsMcp([MCP_FLAG])).toBe(false);
    expect(wantsMcp(['app', '--mcp-debug', 'mcp'])).toBe(false);
  });
});

describe('missingDisplay', () => {
  const argv = ['app', MCP_FLAG];

  it('Linux sin X11 ni Wayland falla, salvo que se pida sin pantalla', () => {
    expect(missingDisplay(argv, {}, 'linux')).toBe(true);
    expect(missingDisplay([...argv, HEADLESS_FLAG], {}, 'linux')).toBe(false);
  });

  it('con X11 o Wayland no hay problema', () => {
    expect(missingDisplay(argv, { DISPLAY: ':0' }, 'linux')).toBe(false);
    expect(missingDisplay(argv, { WAYLAND_DISPLAY: 'wayland-0' }, 'linux')).toBe(false);
  });

  it('Windows y macOS no dependen de DISPLAY', () => {
    expect(missingDisplay(argv, {}, 'win32')).toBe(false);
    expect(missingDisplay(argv, {}, 'darwin')).toBe(false);
  });

  it('el mensaje dice qué agregar', () => {
    expect(MISSING_DISPLAY_MESSAGE).toContain(HEADLESS_FLAG);
    expect(MISSING_DISPLAY_MESSAGE).toContain(MCP_FLAG);
  });
});
