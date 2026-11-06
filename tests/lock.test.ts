/**
 * Bloquear un elemento: el ajuste se guarda en el diseño, el motor marca el bloque, y lo que mueve o
 * borra (`movable`) lo deja quieto. Un bloqueo no cambia nada de lo que se dibuja.
 */
import { describe, expect, it } from 'vitest';
import { createDesign } from '../src/core/design/defaults';
import { parseDesign } from '../src/core/design/schema';
import { pageToSvg } from '../src/core/render/svg';
import { movable } from '../src/app/state/movable';
import { openDocument } from './helpers/node-env';
import { ov } from './helpers/overrides';

const fresh = () => parseDesign(createDesign('heritage', { year: 2027, locale: 'es-AR', country: 'AR' }));

describe('bloquear', () => {
  it('un ajuste «locked» marca el bloque, y nada más cambia en la página', async () => {
    const base = fresh();
    const { doc: before } = await openDocument(base);
    const index = before.plan.pages.findIndex((p) => p.type === 'weekLeft');
    const page = before.page(index);
    const target = page.blocks.find((b) => b.editable && b.role !== 'chrome')!;
    const locked = { ...base, overrides: [ov({ pageType: page.type, blockId: target.id, locked: true })] };
    const { doc: after } = await openDocument(locked);
    const block = after.page(index).blocks.find((b) => b.id === target.id)!;
    expect(block.locked).toBe(true);
    expect(movable(block)).toBe(false);
    expect(movable(page.blocks.find((b) => b.id === target.id)!)).toBe(true);
    // El dibujo es el mismo: bloquear es cosa del editor.
    expect(pageToSvg(after.page(index), after.ctx)).toBe(pageToSvg(before.page(index), before.ctx));
  });

  it('un archivo viejo sin «locked», o con un valor que no es sí o no, queda desbloqueado', () => {
    expect(ov({ pageType: 'x', blockId: 'y' }).locked).toBe(false);
    expect(parseDesign({ ...fresh(), overrides: [{ pageType: 'x', blockId: 'y', locked: 'quizás' }] }).overrides[0]!.locked).toBe(false);
  });

  it('lo que el programa no deja editar nunca se mueve, esté o no bloqueado', () => {
    expect(movable({ editable: false })).toBe(false);
    expect(movable({ editable: true })).toBe(true);
    expect(movable({ editable: true, locked: true })).toBe(false);
  });

  it('un ajuste que solo bloquea no reacomoda un elemento que asoma de la página', async () => {
    const base = fresh();
    const { doc: probe } = await openDocument(base);
    const index = probe.plan.pages.findIndex((p) => p.type === 'weekLeft');
    const page = probe.plan.pages[index]!;
    const cb = { id: 'borde', pageType: page.type, pageKey: page.key, kind: 'rect' as const, x: -5, y: 20, w: 30, h: 10, mirror: false, props: {} };
    const locked = parseDesign({ ...base, customBlocks: [cb], overrides: [ov({ pageType: page.type, pageKey: page.key, blockId: 'custom.borde', locked: true })] });
    const { doc } = await openDocument(locked);
    const b = doc.page(index).blocks.find((x) => x.id === 'custom.borde')!;
    expect(b.locked).toBe(true);
    expect(b.m === undefined || (b.m[4] === 0 && b.m[5] === 0)).toBe(true);
    expect(doc.pageWarnings(index).some((w) => w.code === 'clamped')).toBe(false);
  });
});
