/**
 * Versión del programa. En el paquete del servidor la fija esbuild al compilar (`define`, desde
 * package.json); al correr desde el código fuente se lee de package.json.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../node/env';

export function appVersion(): string {
  if (typeof __APP_VERSION__ === 'string') return __APP_VERSION__;
  return (JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string }).version;
}
