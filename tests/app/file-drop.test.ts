/** Soltar archivos sobre la ventana: solo los .json se toman como agenda. */
import { describe, expect, it } from 'vitest';
import { isPlannerFile } from '../../src/app/state/fileActions';

describe('qué archivo soltado se abre', () => {
  it('un .json, aunque el sistema no sepa su tipo', () => {
    expect(isPlannerFile({ name: 'Mi agenda.agenda.json', type: '' })).toBe(true);
    expect(isPlannerFile({ name: 'COPIA.JSON', type: '' })).toBe(true);
    expect(isPlannerFile({ name: 'x', type: 'application/json' })).toBe(true);
  });

  it('una imagen, un PDF o un texto, no', () => {
    expect(isPlannerFile({ name: 'foto.png', type: 'image/png' })).toBe(false);
    expect(isPlannerFile({ name: 'agenda.pdf', type: 'application/pdf' })).toBe(false);
    expect(isPlannerFile({ name: 'notas.txt', type: 'text/plain' })).toBe(false);
  });
});
