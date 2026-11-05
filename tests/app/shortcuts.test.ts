/** Registro de atajos: cómo se reconoce una combinación, que no haya repetidas y que todo tenga su texto en los cuatro idiomas. */
import { describe, expect, it } from 'vitest';
import { uiEntries, UI_LANGS } from '../../src/app/i18n/ui';
import { pageStep, spreadOf } from '../../src/app/state/paging';
import { formatChord, matchesChord, SHORTCUT_GROUPS, SHORTCUTS, shortcutsFor, type KeyLike } from '../../src/app/state/shortcuts';

const key = (k: string, mods: Partial<KeyLike> = {}): KeyLike => ({ key: k, code: '', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods });

describe('reconocer una combinación', () => {
  it('Mod es Ctrl o ⌘; las modificadoras de más no valen', () => {
    const save = { key: 's', mod: true };
    expect(matchesChord(save, key('s', { ctrlKey: true }))).toBe(true);
    expect(matchesChord(save, key('S', { metaKey: true }))).toBe(true);
    expect(matchesChord(save, key('s'))).toBe(false);
    expect(matchesChord(save, key('s', { ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(matchesChord({ key: 's', mod: true, shift: true }, key('S', { ctrlKey: true, shiftKey: true }))).toBe(true);
  });

  it('Ctrl con Alt es AltGr: no cuenta como Ctrl, salvo que el atajo pida Alt', () => {
    expect(matchesChord({ key: 'z', mod: true }, key('z', { ctrlKey: true, altKey: true }))).toBe(false);
    expect(matchesChord({ key: 'ArrowLeft', alt: true }, key('ArrowLeft', { altKey: true }))).toBe(true);
    expect(matchesChord({ key: 'ArrowLeft', alt: 'any', shift: 'any' }, key('ArrowLeft', { altKey: true, shiftKey: true }))).toBe(true);
  });

  it('los dígitos se reconocen por su tecla, no por lo que escribe la distribución', () => {
    expect(matchesChord({ code: 'Digit3', mod: true }, { ...key('#', { ctrlKey: true }), code: 'Digit3' })).toBe(true);
    expect(matchesChord({ code: 'Digit3', mod: true }, { ...key('3', { ctrlKey: true }), code: 'Digit4' })).toBe(false);
  });

  it('el zoom acepta + con o sin Mayús', () => {
    const zoomIn = SHORTCUTS.find((s) => s.id === 'view.zoomIn')!;
    expect(zoomIn.chords.some((c) => matchesChord(c, key('+', { ctrlKey: true, shiftKey: true })))).toBe(true);
    expect(zoomIn.chords.some((c) => matchesChord(c, key('=', { ctrlKey: true })))).toBe(true);
  });
});

describe('el registro', () => {
  it('no repite una combinación exacta entre atajos', () => {
    const seen = new Map<string, string>();
    for (const s of SHORTCUTS) {
      for (const c of s.chords) {
        const sig = JSON.stringify({ k: c.key?.toLowerCase(), c: c.code, m: c.mod ?? false, s: c.shift ?? false, a: c.alt ?? false });
        expect(seen.get(sig), `${s.id} repite la combinación de ${seen.get(sig)}`).toBeUndefined();
        seen.set(sig, s.id);
      }
    }
  });

  it('cada atajo tiene su grupo, su texto en los cuatro idiomas y los grupos tienen el suyo', () => {
    for (const lang of UI_LANGS) {
      const keys = new Set(uiEntries(lang).map(([k]) => k as string));
      for (const s of SHORTCUTS) expect(keys.has(`sc.${s.id}`), `${lang}: falta sc.${s.id}`).toBe(true);
      for (const g of SHORTCUT_GROUPS) expect(keys.has(`sc.group.${g}`), `${lang}: falta sc.group.${g}`).toBe(true);
    }
    for (const s of SHORTCUTS) expect(SHORTCUT_GROUPS).toContain(s.group);
  });

  it('Alt+← lo toman primero las flechas de mover y después «Atrás» (las flechas no hacen nada sin selección)', () => {
    expect(shortcutsFor(key('ArrowLeft', { altKey: true }), false).map((s) => s.id)).toEqual(['edit.nudge', 'nav.back']);
    expect(shortcutsFor(key('ArrowLeft'), false).map((s) => s.id)).toEqual(['edit.nudge', 'nav.prev']);
  });

  it('escribiendo en un campo solo valen los marcados (zoom, buscar, ayuda, paneles)', () => {
    const typing = (e: KeyLike) => shortcutsFor(e, true).map((s) => s.id);
    expect(typing(key('z', { ctrlKey: true }))).toEqual([]);
    expect(typing(key('Delete'))).toEqual([]);
    expect(typing(key('f', { ctrlKey: true }))).toEqual(['search.open']);
    expect(typing(key('F1'))).toEqual(['help.shortcuts']);
  });

  it('copiar, cortar y pegar figuran en la ayuda pero los atiende el navegador', () => {
    for (const id of ['edit.copy', 'edit.cut', 'edit.paste']) {
      const s = SHORTCUTS.find((x) => x.id === id)!;
      expect(s.native).toBe(true);
      expect(s.run).toBeUndefined();
    }
  });
});

describe('escribir las teclas', () => {
  const names = { ctrl: 'Ctrl', shift: 'Mayús', alt: 'Alt' };
  it('en un PC y en un Mac', () => {
    expect(formatChord({ key: 's', mod: true, shift: true }, false, names)).toBe('Ctrl+Mayús+S');
    expect(formatChord({ key: 's', mod: true, shift: true }, true, names)).toBe('⌘⇧S');
    expect(formatChord({ code: 'Digit3', mod: true }, false, names)).toBe('Ctrl+3');
    expect(formatChord({ key: 'ArrowLeft', alt: true }, false, names)).toBe('Alt+←');
  });
});

describe('pasar de página', () => {
  it('de a una', () => {
    expect(pageStep('page', 5, 20, 1)).toBe(6);
    expect(pageStep('page', 5, 20, -1)).toBe(4);
    expect(pageStep('page', 0, 20, -1)).toBe(0);
    expect(pageStep('page', 19, 20, 1)).toBe(19);
  });

  it('de a un pliego: salta al siguiente par enfrentado', () => {
    expect(spreadOf(0, 20)).toEqual([null, 0]);
    expect(spreadOf(3, 20)).toEqual([3, 4]);
    expect(pageStep('spread', 3, 20, 1)).toBe(5);
    expect(pageStep('spread', 4, 20, -1)).toBe(2);
    expect(pageStep('spread', 0, 20, 1)).toBe(1);
  });

  it('sin páginas no hay adónde ir', () => {
    expect(pageStep('page', 0, 0, 1)).toBe(0);
  });
});
