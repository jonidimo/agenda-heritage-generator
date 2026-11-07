/** Fuentes: las de la aplicación y las propias, qué caracteres les faltan y dónde se usa cada una. */
import { Trash2, Type } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { plural, useT, type UiKey } from '../../i18n/ui';
import { addFontFiles, fontCoverage, fontUses, removeUserFamily } from '../../state/fonts';
import { resources } from '../../state/resources';
import { useStore } from '../../state/store';
import { Badge, Button, Group } from '../ui';

export function FontsPanel() {
  const t = useT();
  const design = useStore((s) => s.design)!;
  const resVersion = useStore((s) => s.resVersion);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Familia cuya baja espera confirmación (un segundo toque, porque vale para todas las agendas de este equipo).
  const [confirm, setConfirm] = useState<string | null>(null);
  const coverage = fontCoverage(design, resVersion);
  const uses = useMemo(() => fontUses(design), [design]);
  const families = [...new Set([...(resources.manifest?.families.map((f) => f.family) ?? []), ...resources.fonts.families()])].sort((a, b) => a.localeCompare(b));
  return (
    <div>
      {error && <p className="my-2 rounded-md bg-[#fbeee6] px-2 py-1.5 text-[11.5px] text-warn">{error}</p>}
      <Group title={t('fonts.title')}>
        <p className="pb-2 text-[11.5px] leading-snug text-ink-soft">{t('fonts.help')}</p>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".ttf,.otf,.woff,.woff2,font/*"
          className="hidden"
          onChange={(e) => {
            const input = e.target;
            void addFontFiles(Array.from(input.files ?? []))
              .then((errors) => setError(errors.length > 0 ? errors.join(' ') : null))
              .finally(() => (input.value = ''));
          }}
        />
        <Button variant="primary" onClick={() => fileRef.current?.click()}>
          <Type size={14} /> {t('fonts.upload')}
        </Button>
        <ul className="mt-2 space-y-2" data-testid="font-list">
          {families.map((fam) => {
            const cover = coverage.get(fam);
            const faces = resources.fonts.facesOf(fam);
            const user = faces.some((f) => f.source === 'user');
            const use = uses.get(fam);
            return (
              <li key={fam} className="rounded-md border border-line bg-white/60 p-1.5 text-[12px]" data-font={fam}>
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate font-semibold" style={{ fontFamily: `"${fam}", sans-serif` }}>
                    {fam}
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <Badge>{user ? t('fonts.user') : t('fonts.builtin')}</Badge>
                    {user &&
                      (confirm === fam ? (
                        <Button
                          variant="outline"
                          onClick={() => {
                            setConfirm(null);
                            void removeUserFamily(fam);
                          }}
                        >
                          <Trash2 size={13} /> {t('fonts.confirmRemove')}
                        </Button>
                      ) : (
                        <Button variant="ghost" onClick={() => setConfirm(fam)}>
                          <Trash2 size={13} />
                          <span className="sr-only">{t('fonts.remove')}</span>
                        </Button>
                      ))}
                  </span>
                </div>
                {faces.length > 0 && (
                  <div className="text-[11px] text-ink-soft">
                    {[...new Set(faces.map((f) => `${f.weight}${f.style === 'italic' ? ' it.' : ''}`))].join(' · ')}
                    {faces.some((f) => f.variable) ? ` · ${t('fonts.variable')}` : ''}
                  </div>
                )}
                {use && (use.roles.length > 0 || use.blocks > 0) && (
                  <div className="text-[11px] text-ink-soft">
                    {t('fonts.usedIn', { where: [...use.roles.map((r) => t(`role.${r}` as UiKey)), ...(use.blocks > 0 ? [plural(t, 'fonts.blocks', use.blocks)] : [])].join(', ') })}
                  </div>
                )}
                {cover && cover.missing.length === 0 && cover.borrowed.length === 0 && <div className="text-[11px] text-accent">✓ {t('fonts.coverageOk')}</div>}
                {/* Lo que la fuente no tiene pero otra sí: se toma de ella al dibujar, sin aviso. */}
                {cover?.borrowed.map((b) => (
                  <div key={b.from} className="text-[11px] text-ink-soft" data-testid="font-borrowed">
                    {t('fonts.borrowed', { from: b.from, chars: b.chars.slice(0, 20).join(' ') })}
                  </div>
                ))}
                {cover && cover.missing.length > 0 && <div className="text-[11px] text-warn">{t('fonts.missing', { chars: cover.missing.slice(0, 20).join(' ') })}</div>}
                {confirm === fam && <div className="mt-1 text-[11px] text-warn">{t('fonts.removeHelp')}</div>}
              </li>
            );
          })}
        </ul>
      </Group>
    </div>
  );
}
