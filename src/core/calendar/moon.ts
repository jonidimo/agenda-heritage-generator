/**
 * Fases lunares principales (luna nueva, cuarto creciente, llena, cuarto
 * menguante) calculadas con Astronomy Engine (precisión de minutos) y
 * convertidas a la fecha civil del huso horario elegido.
 */
import { NextMoonQuarter, SearchMoonQuarter, Seasons } from 'astronomy-engine';

export type MoonPhase = 'new' | 'first' | 'full' | 'last';
const PHASES: MoonPhase[] = ['new', 'first', 'full', 'last'];

function localIso(date: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
    const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/** Mapa fecha ISO → fase, para el rango [from, to] (AAAA-MM-DD). */
export function moonPhases(from: string, to: string, timeZone: string): Map<string, MoonPhase> {
  const out = new Map<string, MoonPhase>();
  const start = new Date(`${from}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 2);
  const end = new Date(`${to}T23:59:59Z`);
  end.setUTCDate(end.getUTCDate() + 2);
  let mq = SearchMoonQuarter(start);
  let guard = 0;
  while (mq.time.date <= end && guard++ < 2000) {
    const iso = localIso(mq.time.date, timeZone);
    if (iso >= from && iso <= to) out.set(iso, PHASES[mq.quarter] ?? 'new');
    mq = NextMoonQuarter(mq);
  }
  return out;
}

export interface SeasonDates {
  marchEquinox: string;
  juneSolstice: string;
  septemberEquinox: string;
  decemberSolstice: string;
}

/** Equinoccios y solsticios del año (fecha civil en el huso horario pedido). */
export function seasonDates(year: number, timeZone: string): SeasonDates {
  const s = Seasons(year);
  return {
    marchEquinox: localIso(s.mar_equinox.date, timeZone),
    juneSolstice: localIso(s.jun_solstice.date, timeZone),
    septemberEquinox: localIso(s.sep_equinox.date, timeZone),
    decemberSolstice: localIso(s.dec_solstice.date, timeZone),
  };
}
