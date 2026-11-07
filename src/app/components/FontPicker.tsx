/**
 * Elegir una letra (familia, peso, itálica) entre las integradas y las subidas. Lo usan los tipos
 * de texto del tema (Estilo) y los textos propios (panel del elemento).
 */
import type { FontSpec, FontStyle } from '@core/text/fonts';
import { useEffect, useMemo, useState } from 'react';
import { useT } from '../i18n/ui';
import { resources } from '../state/resources';
import { useStore } from '../state/store';
import { Select, Toggle } from './ui';

export type Family = { family: string; faces: Array<{ weight: number; style: FontStyle }> };

export function useFamilies(): Family[] {
  const v = useStore((s) => s.resVersion);
  return useMemo(() => {
    const out = new Map<string, Array<{ weight: number; style: FontStyle }>>();
    for (const f of resources.manifest?.families ?? []) out.set(f.family, f.faces.map((x) => ({ weight: x.weight, style: x.style })));
    for (const face of resources.fonts.list()) {
      const list = out.get(face.family) ?? [];
      if (!list.some((x) => x.weight === face.weight && x.style === face.style)) list.push({ weight: face.weight, style: face.style });
      out.set(face.family, list);
    }
    return [...out.entries()].map(([family, faces]) => ({ family, faces: faces.sort((a, b) => a.weight - b.weight) })).sort((a, b) => a.family.localeCompare(b.family));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v]);
}

export function FontRow(props: { label: string; spec: FontSpec; families: Family[]; onChange: (s: FontSpec) => void; /** Una aclaración debajo (p. ej. que a la fuente le falta la puntuación). */ note?: React.ReactNode }) {
  const t = useT();
  const fam = props.families.find((f) => f.family === props.spec.family);
  const weights = [...new Set((fam?.faces ?? []).filter((f) => f.style === props.spec.style || !(fam?.faces ?? []).some((x) => x.style === props.spec.style)).map((f) => f.weight))];
  const hasItalic = (fam?.faces ?? []).some((f) => f.style === 'italic');
  const [preview, setPreview] = useState(props.spec.family);
  useEffect(() => setPreview(props.spec.family), [props.spec.family]);
  return (
    <div className="border-b border-line/50 py-1.5 last:border-0">
      <div className="mb-1 text-[11.5px] font-semibold text-ink-soft">{props.label}</div>
      <div className="grid grid-cols-[1fr_92px] gap-1.5">
        <Select
          ariaLabel={props.label}
          value={preview}
          onChange={(family) => {
            setPreview(family);
            const f = props.families.find((x) => x.family === family);
            const avail = f?.faces ?? [];
            const sameStyle = avail.filter((x) => x.style === props.spec.style);
            const pool = sameStyle.length ? sameStyle : avail;
            const best = [...pool].sort((a, b) => Math.abs(a.weight - props.spec.weight) - Math.abs(b.weight - props.spec.weight))[0];
            props.onChange({ family, weight: best?.weight ?? 400, style: best?.style ?? 'normal' });
          }}
          options={props.families.map((f) => ({ value: f.family, label: f.family }))}
        />
        <Select ariaLabel={t('style.weight')} value={String(props.spec.weight)} onChange={(w) => props.onChange({ ...props.spec, weight: Number(w) })} options={(weights.length ? weights : [props.spec.weight]).map((w) => ({ value: String(w), label: String(w) }))} />
      </div>
      {hasItalic && <Toggle label={t('style.italic')} checked={props.spec.style === 'italic'} onChange={(v) => props.onChange({ ...props.spec, style: v ? 'italic' : 'normal' })} />}
      {props.note}
    </div>
  );
}
