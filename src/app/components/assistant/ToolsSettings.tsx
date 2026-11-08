/**
 * Ajustes → Internet y carpetas (escritorio): las claves de los servicios de imágenes y fuentes con un botón para
 * probar que funcionan, los sitios de confianza, la carpeta donde cada agenda tiene la suya y las carpetas que
 * el asistente puede leer. Las claves las guarda el proceso principal; acá nunca vuelven.
 */
import { useCallback, useEffect, useState } from 'react';
import { useT, type UiKey } from '../../i18n/ui';
import { SERVICE_KEY_NAMES, toolsAction, toolsCheck, toolsRemoveFolder, toolsStatus, toolsUpdate, type ServiceKeyName, type ToolsStatus } from '../../state/ai/toolsConfig';
import { Modal } from '../Dialogs';
import { Button, Field, Segmented, Toggle } from '../ui';

interface ServiceRow {
  id: string;
  label: string;
  keys: ServiceKeyName[];
  link: string;
}

const SERVICES: ServiceRow[] = [
  { id: 'openverse', label: 'Openverse', keys: [], link: 'https://openverse.org' },
  { id: 'wikimedia', label: 'Wikimedia Commons', keys: [], link: 'https://commons.wikimedia.org' },
  { id: 'pexels', label: 'Pexels', keys: ['PEXELS_API_KEY'], link: 'https://www.pexels.com/api/' },
  { id: 'pixabay', label: 'Pixabay', keys: ['PIXABAY_API_KEY'], link: 'https://pixabay.com/api/docs/' },
  { id: 'unsplash', label: 'Unsplash', keys: ['UNSPLASH_ACCESS_KEY'], link: 'https://unsplash.com/developers' },
  { id: 'deviantart', label: 'DeviantArt', keys: ['DEVIANTART_CLIENT_ID', 'DEVIANTART_CLIENT_SECRET'], link: 'https://www.deviantart.com/developers/' },
  { id: 'fonts', label: 'Google Fonts', keys: ['GOOGLE_FONTS_API_KEY'], link: 'https://developers.google.com/fonts/docs/developer_api' },
];

const KEY_LABEL: Record<ServiceKeyName, UiKey> = {
  PEXELS_API_KEY: 'tools.key',
  PIXABAY_API_KEY: 'tools.key',
  UNSPLASH_ACCESS_KEY: 'tools.key',
  DEVIANTART_CLIENT_ID: 'tools.clientId',
  DEVIANTART_CLIENT_SECRET: 'tools.clientSecret',
  GOOGLE_FONTS_API_KEY: 'tools.key',
};

/** Una lista de sitios, uno por campo, cada uno con su botón «Probar» (así se ve cuál anda y cuál no). */
function HostList({ label, hint, hosts, onChange, testable }: { label: string; hint: string; hosts: string[]; onChange: (h: string[]) => void; testable: boolean }) {
  const t = useT();
  const [results, setResults] = useState<Record<number, Result>>({});
  const test = async (i: number): Promise<void> => {
    setResults((r) => ({ ...r, [i]: { state: 'busy' } }));
    try {
      const out = await toolsCheck(`host:${hosts[i] ?? ''}`);
      setResults((r) => ({ ...r, [i]: { state: 'done', ok: out.ok, message: out.message } }));
    } catch (err) {
      setResults((r) => ({ ...r, [i]: { state: 'done', ok: false, message: (err as Error).message } }));
    }
  };
  return (
    <div className="py-1">
      <div className="text-[11.5px] font-semibold text-ink-soft">{label}</div>
      <p className="mb-1 text-[11px] leading-snug text-ink-soft/80">{hint}</p>
      <div className="space-y-1" data-testid="host-list">
        {hosts.map((h, i) => (
          <div key={i}>
            <div className="flex gap-1">
              <input
                className="min-w-0 flex-1 rounded-md border border-line bg-white px-2 py-1 text-[12.5px] focus:border-accent focus:outline-none"
                value={h}
                spellCheck={false}
                aria-label={`${label} ${i + 1}`}
                placeholder="nas.lan"
                onChange={(e) => {
                  setResults(({ [i]: _gone, ...rest }) => rest);
                  onChange(hosts.map((x, j) => (j === i ? e.target.value.replace(/[\s,;]+/g, '') : x)));
                }}
              />
              {testable && (
                <Button variant="outline" disabled={h.trim() === '' || results[i]?.state === 'busy'} onClick={() => void test(i)}>
                  {results[i]?.state === 'busy' ? t('tools.testing') : t('tools.test')}
                </Button>
              )}
              <Button variant="outline" title={t('tools.remove')} onClick={() => onChange(hosts.filter((_, j) => j !== i))}>
                ✕
              </Button>
            </div>
            {results[i]?.state === 'done' && (
              <p className={`mt-0.5 text-[11.5px] ${results[i].ok ? 'text-green-700' : 'text-red-700'}`} role="status">
                {results[i].ok ? '✓ ' : '✗ '}
                {results[i].message}
              </p>
            )}
          </div>
        ))}
        {hosts.length < 20 && (
          <Button variant="outline" onClick={() => onChange([...hosts, ''])}>
            {t('tools.addSite')}
          </Button>
        )}
      </div>
    </div>
  );
}

type Result = { state: 'busy' } | { state: 'done'; ok: boolean; message: string };

function Service({ row, status, onStatus }: { row: ServiceRow; status: ToolsStatus; onStatus: (s: ToolsStatus) => void }) {
  const t = useT();
  const [draft, setDraft] = useState<Partial<Record<ServiceKeyName, string>>>({});
  const [result, setResult] = useState<Result | null>(null);
  const stored = row.keys.length > 0 && row.keys.every((k) => status.hasKey[k]);
  const dirty = row.keys.some((k) => (draft[k] ?? '').trim() !== '');

  const test = useCallback(async (): Promise<void> => {
    setResult({ state: 'busy' });
    try {
      // Si se escribió una clave nueva, se guarda antes de probarla.
      if (dirty) {
        const keys: Partial<Record<ServiceKeyName, string>> = {};
        for (const k of row.keys) if ((draft[k] ?? '').trim() !== '') keys[k] = draft[k]!.trim();
        onStatus(await toolsUpdate({ keys }));
        setDraft({});
      }
      setResult({ state: 'done', ...(await toolsCheck(row.id)) });
    } catch (err) {
      setResult({ state: 'done', ok: false, message: (err as Error).message });
    }
  }, [dirty, draft, onStatus, row]);

  const forget = async (): Promise<void> => {
    const keys: Partial<Record<ServiceKeyName, null>> = {};
    for (const k of row.keys) keys[k] = null;
    try {
      onStatus(await toolsUpdate({ keys }));
      setResult(null);
    } catch (err) {
      setResult({ state: 'done', ok: false, message: (err as Error).message });
    }
  };

  return (
    <div className="rounded-md border border-line p-2" data-testid={`tools-service-${row.id}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] font-semibold">{row.label}</span>
        <span className="text-[11px] text-ink-soft">{row.keys.length === 0 ? t('tools.noKeyNeeded') : stored ? t('tools.keyStored') : t('tools.keyMissing')}</span>
      </div>
      {row.keys.map((k) => (
        <input
          key={k}
          type="password"
          autoComplete="off"
          spellCheck={false}
          className="mt-1 w-full rounded-md border border-line bg-white px-2 py-1 text-[12.5px] focus:border-accent focus:outline-none"
          value={draft[k] ?? ''}
          placeholder={status.hasKey[k] ? '••••••••' : t(KEY_LABEL[k])}
          aria-label={`${row.label} — ${t(KEY_LABEL[k])}`}
          onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
        />
      ))}
      <div className="mt-1 flex flex-wrap items-center gap-1">
        <Button variant="outline" onClick={() => void test()} disabled={result?.state === 'busy' || (row.keys.length > 0 && !stored && !dirty)}>
          {result?.state === 'busy' ? t('tools.testing') : t('tools.test')}
        </Button>
        {stored && (
          <Button variant="outline" onClick={() => void forget()}>
            {t('tools.forget')}
          </Button>
        )}
        <a className="text-[11px] text-accent underline" href={row.link} target="_blank" rel="noreferrer">
          {t('tools.getKey')}
        </a>
      </div>
      {result?.state === 'done' && (
        <p className={`mt-1 text-[11.5px] ${result.ok ? 'text-green-700' : 'text-red-700'}`} role="status" data-testid={`tools-result-${row.id}`}>
          {result.ok ? '✓ ' : '✗ '}
          {result.message}
        </p>
      )}
    </div>
  );
}

export function ToolsSettings({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [status, setStatus] = useState<ToolsStatus | null>(null);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<'services' | 'sites' | 'folders'>('services');
  const [trusted, setTrusted] = useState<string[]>([]);
  const [imageHosts, setImageHosts] = useState<string[]>([]);
  const [savedSites, setSavedSites] = useState(false);

  const apply = useCallback((s: ToolsStatus): void => {
    setStatus(s);
    setTrusted(s.trustedHosts.split(',').filter(Boolean));
    setImageHosts(s.imageHosts.split(',').filter(Boolean));
  }, []);

  useEffect(() => {
    void toolsStatus().then(apply, () => setError(true));
  }, [apply]);

  const run = async (fn: () => Promise<{ status?: ToolsStatus } | ToolsStatus>): Promise<void> => {
    try {
      const out = await fn();
      const next = 'status' in out ? out.status : 'hasKey' in out ? out : undefined;
      if (next) apply(next);
    } catch {
      setError(true);
    }
  };

  const clean = (l: string[]): string => l.map((h) => h.trim()).filter(Boolean).join(',');
  const sitesChanged = status !== null && (clean(trusted) !== status.trustedHosts || clean(imageHosts) !== status.imageHosts);

  return (
    <Modal title={t('tools.title')} onClose={onClose} size="wide" testId="tools-settings">
      {!status ? (
        <p className="text-[12.5px] text-ink-soft">{error ? t('tools.unavailable') : '…'}</p>
      ) : (
        <div className="space-y-2 text-[12.5px]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Segmented
              value={tab}
              onChange={setTab}
              options={[
                { value: 'services', label: t('tools.tabServices') },
                { value: 'sites', label: t('tools.tabSites') },
                { value: 'folders', label: t('tools.tabFolders') },
              ]}
            />
            <Toggle label={t('tools.enabled')} checked={status.enabled} onChange={(v) => void run(() => toolsUpdate({ enabled: v }))} />
          </div>

          {tab === 'services' && (
            <div>
              <p className="mb-1 text-[11.5px] text-ink-soft">{status.encryption.available && !status.encryption.weak ? t('tools.keysSafe') : t('tools.keysWeak')}</p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {SERVICES.map((row) => (
                  <Service key={row.id} row={row} status={status} onStatus={apply} />
                ))}
              </div>
            </div>
          )}

          {tab === 'sites' && (
            <div className="space-y-1">
              <HostList label={t('tools.hostsTitle')} hint={t('tools.hostsHint')} hosts={trusted} onChange={(h) => (setSavedSites(false), setTrusted(h))} testable />
              <HostList label={t('tools.imageHostsTitle')} hint={t('tools.imageHostsHint')} hosts={imageHosts} onChange={(h) => (setSavedSites(false), setImageHosts(h))} testable={false} />
              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  disabled={!sitesChanged}
                  onClick={() =>
                    void run(() => toolsUpdate({ trustedHosts: clean(trusted), imageHosts: clean(imageHosts) })).then(() => setSavedSites(true))
                  }
                >
                  {t('tools.saveHosts')}
                </Button>
                {savedSites && !sitesChanged && <span className="text-[11.5px] text-green-700">✓ {t('tools.saved')}</span>}
              </div>
            </div>
          )}

          {tab === 'folders' && (
            <div className="space-y-1">
              <Field label={t('tools.folderTitle')} hint={t('tools.folderHint')}>
                <code className="block break-all rounded-md bg-paper-2 px-2 py-1 text-[11.5px]" data-testid="tools-root">
                  {status.root}
                </code>
                <div className="mt-1 flex flex-wrap gap-1">
                  <Button variant="outline" onClick={() => void run(() => toolsAction('choose-root'))}>
                    {t('tools.change')}
                  </Button>
                  {!status.rootIsDefault && (
                    <Button variant="outline" onClick={() => void run(() => toolsAction('reset-root'))}>
                      {t('tools.useDefault')}
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => void toolsAction('open-root').catch(() => setError(true))}>
                    {t('tools.open')}
                  </Button>
                </div>
              </Field>
              <Field label={t('tools.readTitle')} hint={t('tools.readHint')}>
                <ul className="space-y-1">
                  {status.folders.map((f) => (
                    <li key={f} className="flex items-center justify-between gap-2 rounded-md bg-paper-2 px-2 py-1">
                      <code className="min-w-0 break-all text-[11.5px]">{f}</code>
                      <Button variant="outline" onClick={() => void run(() => toolsRemoveFolder(f))}>
                        {t('tools.remove')}
                      </Button>
                    </li>
                  ))}
                </ul>
                <div className="mt-1">
                  <Button variant="outline" onClick={() => void run(() => toolsAction('add-folder'))}>
                    {t('tools.addFolder')}
                  </Button>
                </div>
              </Field>
            </div>
          )}
          {error && <p className="text-red-700">{t('tools.unavailable')}</p>}
        </div>
      )}
    </Modal>
  );
}

export { SERVICE_KEY_NAMES };
