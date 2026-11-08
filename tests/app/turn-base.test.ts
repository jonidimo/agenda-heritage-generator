import { beforeEach, describe, expect, it } from 'vitest';
import { adoptOwnChange, setTurnBase, turnBase } from '../../src/app/state/ai/turnBase';
import { useStore } from '../../src/app/state/store';

beforeEach(() => {
  useStore.setState({ revision: 5 });
  setTurnBase(null);
});

describe('la base de la revisión del turno del asistente', () => {
  it('un cambio propio del turno (una imagen importada) se suma a la base y la propuesta no queda vieja', () => {
    setTurnBase(5);
    useStore.setState({ revision: 6 });
    adoptOwnChange(5);
    expect(turnBase()).toBe(6);
  });

  it('un cambio de la persona antes del propio no se adopta: la propuesta sigue llegando vieja', () => {
    setTurnBase(5);
    useStore.setState({ revision: 6 }); // la persona cambió algo
    useStore.setState({ revision: 7 }); // y después el asistente importó una imagen
    adoptOwnChange(6);
    expect(turnBase()).toBe(5);
  });

  it('fuera de un turno no hace nada', () => {
    useStore.setState({ revision: 6 });
    adoptOwnChange(5);
    expect(turnBase()).toBeNull();
  });
});
