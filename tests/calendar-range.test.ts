import { describe, expect, it } from 'vitest';
import { monthKeysOf, trimmedRange } from '../src/core/calendar/range';

describe('rango de meses', () => {
  it('lista los meses, también cuando cruza de año', () => {
    expect(monthKeysOf({ year: 2027, startMonth: 11, monthCount: 4 })).toEqual(['2027-11', '2027-12', '2028-01', '2028-02']);
  });

  it('recortar el primero corre el año de la agenda; recortar el último, no', () => {
    expect(trimmedRange({ year: 2027, startMonth: 12, monthCount: 3 }, 'first')).toEqual({ year: 2028, startMonth: 1, monthCount: 2 });
    expect(trimmedRange({ year: 2027, startMonth: 1, monthCount: 12 }, 'last')).toEqual({ year: 2027, startMonth: 1, monthCount: 11 });
  });

  it('con un solo mes no se puede recortar', () => {
    expect(trimmedRange({ year: 2027, startMonth: 5, monthCount: 1 }, 'first')).toBeNull();
    expect(trimmedRange({ year: 2027, startMonth: 5, monthCount: 1 }, 'last')).toBeNull();
  });
});
