/** El programa servido en app://heritage/: qué archivo nombra cada ruta (nunca uno fuera de dist/) y con qué tipo. */
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { contentTypeOf, resolveAppPath } from '../electron/lib/serve.mjs';

const DIST = path.resolve('/opt/heritage/dist');

describe('rutas del programa', () => {
  it('la raíz es index.html y las demás rutas son archivos de dist', () => {
    expect(resolveAppPath(DIST, '/')).toBe(path.join(DIST, 'index.html'));
    expect(resolveAppPath(DIST, '/assets/engine-s_8PJttH.js')).toBe(path.join(DIST, 'assets', 'engine-s_8PJttH.js'));
    expect(resolveAppPath(DIST, '/fonts/manrope/Manrope%20Regular.ttf')).toBe(path.join(DIST, 'fonts', 'manrope', 'Manrope Regular.ttf'));
  });

  it('nada fuera de dist, ni rutas mal formadas', () => {
    expect(resolveAppPath(DIST, '/../package.json')).toBeNull();
    expect(resolveAppPath(DIST, '/assets/../../secret')).toBeNull();
    expect(resolveAppPath(DIST, '/%2e%2e/%2e%2e/etc/passwd')).toBeNull();
    expect(resolveAppPath(DIST, '/a%00b')).toBeNull();
    expect(resolveAppPath(DIST, '/%E0%A4%A')).toBeNull();
  });
});

describe('tipos de contenido', () => {
  it('los módulos de JavaScript y WebAssembly llevan su tipo exacto (sin él no cargan)', () => {
    expect(contentTypeOf('/d/assets/engine-x.js')).toBe('text/javascript; charset=utf-8');
    expect(contentTypeOf('/d/assets/worker.MJS')).toBe('text/javascript; charset=utf-8');
    expect(contentTypeOf('/d/resvg.wasm')).toBe('application/wasm');
    expect(contentTypeOf('/d/index.html')).toBe('text/html; charset=utf-8');
    expect(contentTypeOf('/d/holidays/AR.json')).toBe('application/json');
    expect(contentTypeOf('/d/fonts/x.woff2')).toBe('font/woff2');
  });

  it('una extensión desconocida queda con el tipo que dé el sistema', () => {
    expect(contentTypeOf('/d/LICENSE')).toBeUndefined();
    expect(contentTypeOf('/d/file.xyz')).toBeUndefined();
  });
});
