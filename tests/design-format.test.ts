/**
 * El formato del archivo a largo plazo: migraciones entre versiones, archivos de una versión más nueva,
 * claves que el validador descarta y cambios por JSON Patch con las reglas de afuera del editor.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createDesign } from '../src/core/design/defaults';
import { FormatVersionError, migrateDesignInput, type Migration } from '../src/core/design/migrations';
import { applyDesignPatch } from '../src/core/design/patch';
import { parseDesign, safeParseDesign, SCHEMA_VERSION } from '../src/core/design/schema';
import { strippedKeys } from '../src/core/design/stripped';
import { applyJsonPatch, getAtPointer } from '../src/core/util/jsonPatch';
import { isNewerVersion, versionParts } from '../src/core/util/version';
import { checkDesignData } from '../src/node/check';

const design = () => parseDesign(createDesign('heritage', { year: 2027, locale: 'es-AR', country: 'AR' }));

describe('migraciones del formato', () => {
  it('un archivo de la versión actual, o sin versión, pasa igual', () => {
    const raw = { schemaVersion: SCHEMA_VERSION, name: 'x' };
    expect(migrateDesignInput(raw)).toBe(raw);
    const old = { name: 'sin versión' };
    expect(migrateDesignInput(old)).toBe(old);
    expect(migrateDesignInput('no es un objeto')).toBe('no es un objeto');
  });

  it('corre los pasos en orden hasta la versión actual, sin tocar lo que recibe', () => {
    const steps: Migration[] = [
      { from: 1, describe: 'renombra a → b', up: (r) => ({ ...r, b: r.a, a: undefined }) },
      { from: 2, describe: 'duplica b', up: (r) => ({ ...r, b: Number(r.b) * 2 }) },
    ];
    const raw = { schemaVersion: 1, a: 21 };
    expect(migrateDesignInput(raw, steps, 3)).toEqual({ schemaVersion: 3, b: 42, a: undefined });
    expect(raw).toEqual({ schemaVersion: 1, a: 21 });
    expect(migrateDesignInput({ schemaVersion: 2, b: 5 }, steps, 3)).toEqual({ schemaVersion: 3, b: 10 });
  });

  it('un paso que falta se dice, no se saltea', () => {
    expect(() => migrateDesignInput({ schemaVersion: 1 }, [], 2)).toThrow(/Falta la migración/);
  });

  it('un archivo de una versión más nueva del formato se rechaza con un mensaje claro (abrirlo perdería datos)', () => {
    expect(() => migrateDesignInput({ schemaVersion: SCHEMA_VERSION + 1 })).toThrow(FormatVersionError);
    expect(() => parseDesign({ ...design(), schemaVersion: SCHEMA_VERSION + 1 })).toThrow(/actualizá la aplicación/);
    expect(() => migrateDesignInput({ schemaVersion: 0 })).toThrow(/no existe/);
    expect(() => migrateDesignInput({ schemaVersion: '1' })).toThrow(FormatVersionError);
    // La revisión del MCP lo cuenta como un problema del archivo, no como un error del servidor.
    const check = checkDesignData({ ...design(), schemaVersion: 9 });
    expect(check.design).toBeNull();
    expect(check.issues[0]).toMatchObject({ path: '/schemaVersion', severity: 'error' });
  });

  it('cada migración dice qué cambia', async () => {
    const { MIGRATIONS } = await import('../src/core/design/migrations');
    for (const m of MIGRATIONS) expect(m.describe.length).toBeGreaterThan(10);
    // Una migración por versión anterior a la actual, sin huecos.
    expect(MIGRATIONS.map((m) => m.from)).toEqual(Array.from({ length: SCHEMA_VERSION - 1 }, (_, i) => i + 1));
  });
});

describe('versiones de la aplicación', () => {
  it('compara mayor, menor y parche como números', () => {
    expect(isNewerVersion('2.10.0', '2.9.9')).toBe(true);
    expect(isNewerVersion('2.4.0', '2.4.0')).toBe(false);
    expect(isNewerVersion('2.3.9', '2.4.0')).toBe(false);
    expect(isNewerVersion('3.0.0-beta.1', '2.9.0')).toBe(true);
    expect(isNewerVersion('', '2.4.0')).toBe(false);
    expect(isNewerVersion('mañana', '2.4.0')).toBe(false);
    expect(versionParts('v2.4.1')).toEqual([2, 4, 1]);
  });

  it('es un orden estricto (propiedades)', () => {
    const v = fc.tuple(fc.nat(50), fc.nat(50), fc.nat(50)).map((t) => t.join('.'));
    fc.assert(
      fc.property(v, v, (a, b) => {
        expect(isNewerVersion(a, a)).toBe(false);
        expect(isNewerVersion(a, b) && isNewerVersion(b, a)).toBe(false);
      }),
    );
  });

  it('el archivo recuerda qué versión lo escribió; uno viejo queda vacío', () => {
    expect(parseDesign({ ...design(), writtenBy: '2.4.0' }).writtenBy).toBe('2.4.0');
    expect(parseDesign({ ...design(), writtenBy: undefined }).writtenBy).toBe('');
    expect(parseDesign({ ...design(), writtenBy: 42 }).writtenBy).toBe('');
  });
});

describe('claves descartadas', () => {
  it('encuentra las claves que el validador no conoce, con su puntero', () => {
    const input = { ...design(), sorpresa: 1, calendar: { ...design().calendar, zona: 'x' }, sections: design().sections.map((s, i) => (i === 1 ? { ...s, extra: true } : s)) };
    const parsed = safeParseDesign(input);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(strippedKeys(input, parsed.data).sort()).toEqual(['/calendar/zona', '/sections/1/extra', '/sorpresa']);
  });

  it('no inventa nada: una agenda válida no pierde claves (propiedades sobre nombres y años)', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 40 }), fc.integer({ min: 1900, max: 2200 }), (name, year) => {
        const d = parseDesign({ ...design(), name, calendar: { ...design().calendar, year } });
        const plain = JSON.parse(JSON.stringify(d)) as unknown;
        expect(strippedKeys(plain, parseDesign(plain))).toEqual([]);
      }),
      { numRuns: 30 },
    );
  });

  it('las claves con «/» o «~» se escapan como pide el estándar', () => {
    expect(strippedKeys({ 'a/b': 1, 'c~d': 2 }, {})).toEqual(['/a~1b', '/c~0d']);
    expect(getAtPointer({ 'a/b': { 'c~d': 7 } }, '/a~1b/c~0d')).toBe(7);
  });
});

describe('cambiar la agenda con JSON Patch', () => {
  it('aplica, valida y dice qué claves se ignoraron', () => {
    const d = design();
    const r = applyDesignPatch(d, [
      { op: 'replace', path: '/name', value: 'Nueva' },
      { op: 'add', path: '/inventado', value: 1 },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.design.name).toBe('Nueva');
      expect(r.stripped).toEqual(['/inventado']);
    }
    expect(d.name).not.toBe('Nueva');
  });

  it('todo o nada: un parche que no aplica o deja la agenda inválida no cambia nada', () => {
    const d = design();
    expect(applyDesignPatch(d, [{ op: 'remove', path: '/nada/aca' }])).toMatchObject({ ok: false });
    const bad = applyDesignPatch(d, [{ op: 'replace', path: '/sections', value: 'no es una lista' }]);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.issues[0]!.path).toBe('/sections');
  });

  it('la identidad de la agenda no se cambia desde afuera', () => {
    expect(applyDesignPatch(design(), [{ op: 'replace', path: '/id', value: 'otra' }])).toMatchObject({ ok: false, issues: [{ path: '/id' }] });
  });

  it('aplicar y leer por puntero son coherentes (propiedades)', () => {
    fc.assert(
      fc.property(fc.dictionary(fc.string({ minLength: 1, maxLength: 8 }).filter((k) => !['__proto__', 'constructor', 'prototype'].includes(k)), fc.jsonValue(), { maxKeys: 6 }), fc.jsonValue(), (doc, value) => {
        const key = 'k/~x';
        fc.pre(!Object.hasOwn(doc, key));
        const out = applyJsonPatch(doc, [{ op: 'add', path: '/k~1~0x', value }]);
        expect(getAtPointer(out, '/k~1~0x')).toEqual(value);
        expect(Object.hasOwn(doc, key)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});
