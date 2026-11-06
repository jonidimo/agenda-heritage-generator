/**
 * Ajustes del asistente de IA: con qué proveedor y modelo trabaja, la clave de API, si puede mirar las
 * páginas y si la píldora se ve. La clave se guarda aparte de los ajustes (ver `state/ai/keys.ts`).
 */
import { OPENAI_PRESETS, PROVIDER_IDS, PROVIDERS, isLocalUrl, isOfficialBase, presetOf, type OpenAiPreset } from '@core/ai/providers';
import { AiError } from '@core/ai/errors';
import type { AiProviderId } from '@core/ai/messages';
import { useCallback, useEffect, useRef, useState } from 'react';
import { plural, useT, type UiKey } from '../../i18n/ui';
import { useAssistant } from '../../state/ai/assistant';
import { forgetAll, getKey, hasKey, setKey } from '../../state/ai/keys';
import { activeProvider } from '../../state/ai/settings';
import { desktopSaveKey, desktopStatus, type DesktopAiStatus } from '../../state/ai/desktop';
import { isDesktopShell } from '../../state/desktopBridge';
import { Modal } from '../Dialogs';
import { Button, Field, Segmented, Select, TextInput, Toggle } from '../ui';

const PROVIDER_LABEL: Record<AiProviderId, UiKey> = {
  anthropic: 'ai.provider.anthropic',
  gemini: 'ai.provider.gemini',
  openai: 'ai.provider.openai',
};
const PRESET_LABEL: Record<OpenAiPreset['id'], UiKey> = {
  openai: 'ai.preset.openai',
  openrouter: 'ai.preset.openrouter',
  groq: 'ai.preset.groq',
  mistral: 'ai.preset.mistral',
  ollama: 'ai.preset.ollama',
  lmstudio: 'ai.preset.lmstudio',
  custom: 'ai.preset.custom',
};

type Check = { state: 'idle' } | { state: 'busy'; auto: boolean } | { state: 'ok'; n: number; suggestedBase?: string } | { state: 'error'; message: string };

/** Lo que se elige en la lista para escribir un nombre a mano. */
const OTHER = '\u0000other';
/** Cuánto esperar después de la última tecla antes de buscar los modelos de una dirección nueva. */
const DETECT_DELAY_MS = 600;

export function AssistantSettings({ onClose }: { onClose: () => void }) {
  const t = useT();
  const settings = useAssistant((s) => s.settings);
  const update = useAssistant((s) => s.updateSettings);
  const { provider, model, baseUrl } = activeProvider(settings);
  const adapter = PROVIDERS[provider];
  const desk = isDesktopShell();
  const [deskStatus, setDeskStatus] = useState<DesktopAiStatus | null>(null);
  const [draftKey, setDraftKey] = useState('');
  const [stored, setStored] = useState(() => (desk ? false : hasKey(provider)));
  const [keyError, setKeyError] = useState<string | null>(null);

  // En el escritorio, si hay clave lo sabe el proceso principal (la página nunca la vuelve a ver).
  useEffect(() => {
    if (!desk) return;
    void desktopStatus()
      .then((st) => {
        setDeskStatus(st);
        setStored(st.hasKey[provider]);
      })
      .catch(() => setDeskStatus(null));
  }, [desk, provider]);
  const [models, setModels] = useState<string[]>([]);
  const [check, setCheck] = useState<Check>({ state: 'idle' });
  const [typing, setTyping] = useState(false);
  const local = provider === 'openai' && baseUrl !== '' && isLocalUrl(baseUrl);
  const official = isOfficialBase(adapter, baseUrl);
  const preset = presetOf(baseUrl);
  const detecting = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!desk) setStored(hasKey(provider));
    setDraftKey('');
    setModels([]);
    setTyping(false);
    setCheck({ state: 'idle' });
  }, [desk, provider, baseUrl]);
  const setProviderField = (field: 'model' | 'baseUrl', value: string): void =>
    update((s) => ({
      ...s,
      perProvider: {
        ...s.perProvider,
        [s.provider]: { ...s.perProvider[s.provider], [field]: value },
      },
    }));

  const saveKey = async (): Promise<void> => {
    setKeyError(null);
    try {
      if (desk) {
        const st = await desktopSaveKey(provider, draftKey);
        setDeskStatus(st);
        setStored(st.hasKey[provider]);
      } else {
        await setKey(provider, draftKey, settings.remember);
        setStored(hasKey(provider));
      }
      setDraftKey('');
    } catch (err) {
      setKeyError(err instanceof Error ? err.message : String(err));
    }
  };
  const removeKey = async (): Promise<void> => {
    if (desk) {
      const st = await desktopSaveKey(provider, null);
      setDeskStatus(st);
    } else await setKey(provider, null, settings.remember);
    setStored(false);
  };

  const errorText = useCallback((err: unknown): string => (err instanceof AiError ? `${t(`ai.err.${err.kind}` as UiKey)} ${err.message}` : String(err)), [t]);

  /** Busca los modelos de la dirección elegida; si hay uno solo y no se eligió ninguno, queda elegido. */
  const detect = useCallback(
    async (auto: boolean): Promise<void> => {
      detecting.current?.abort();
      const ac = new AbortController();
      detecting.current = ac;
      setCheck({ state: 'busy', auto });
      try {
        const { listModels } = await import('../../state/ai/engine');
        const found = await listModels(provider, baseUrl, ac.signal);
        if (ac.signal.aborted) return;
        setModels(found.models);
        setCheck({
          state: 'ok',
          n: found.models.length,
          ...(found.suggestedBase ? { suggestedBase: found.suggestedBase } : {}),
        });
        const only = found.models.length === 1 ? found.models[0] : undefined;
        if (only && !model)
          update((s) => ({
            ...s,
            perProvider: {
              ...s.perProvider,
              [s.provider]: { ...s.perProvider[s.provider], model: only },
            },
          }));
      } catch (err) {
        if (ac.signal.aborted) return;
        setCheck({ state: 'error', message: errorText(err) });
      } finally {
        if (detecting.current === ac) detecting.current = null;
      }
    },
    [provider, baseUrl, model, update, errorText],
  );

  // Un servidor local (o un servicio con la clave ya puesta) se consulta solo, un rato después de dejar de escribir la dirección.
  const autoDetect = provider === 'openai' && !official && (local || stored);
  const detectRef = useRef(detect);
  detectRef.current = detect;
  useEffect(() => {
    if (!autoDetect) return;
    const timer = setTimeout(() => void detectRef.current(true), DETECT_DELAY_MS);
    return () => {
      clearTimeout(timer);
      detecting.current?.abort();
    };
  }, [autoDetect, baseUrl, provider]);

  const verify = async (): Promise<void> => {
    if (draftKey.trim()) await saveKey();
    await detect(false);
  };

  // La lista: los modelos que dio el servidor y, solo en la dirección oficial, los sugeridos de siempre.
  const options = [...new Set([...(official ? adapter.suggestedModels : []), ...models])];
  if (model && !options.includes(model)) options.unshift(model);
  const listed = options.length > 0 && !typing;

  return (
    <Modal title={t('ai.settings.title')} onClose={onClose}>
      <div className="space-y-2" data-testid="ai-settings">
        <Field label={t('ai.settings.provider')}>
          <Segmented
            value={provider}
            onChange={(p) => update((s) => ({ ...s, provider: p }))}
            options={PROVIDER_IDS.map((p) => ({
              value: p,
              label: t(PROVIDER_LABEL[p]),
            }))}
          />
        </Field>
        {provider === 'openai' && (
          <Field label={t('ai.settings.preset')}>
            <Select
              value={preset.id}
              ariaLabel={t('ai.settings.preset')}
              onChange={(id) => {
                const next = OPENAI_PRESETS.find((p) => p.id === id)!;
                if (next.id !== 'custom') setProviderField('baseUrl', next.baseUrl);
              }}
              options={OPENAI_PRESETS.map((p) => ({
                value: p.id,
                label: t(PRESET_LABEL[p.id]),
              }))}
            />
          </Field>
        )}
        {(provider === 'openai' || baseUrl !== '') && (
          <Field label={t('ai.settings.baseUrl')} hint={t('ai.settings.baseUrlHint')}>
            <TextInput value={baseUrl} placeholder={adapter.defaultBase} ariaLabel={t('ai.settings.baseUrl')} onChange={(v) => setProviderField('baseUrl', v)} />
          </Field>
        )}
        <Field label={t('ai.settings.model')} hint={!model ? t(official ? 'ai.settings.modelDefault' : 'ai.settings.modelPick') : undefined}>
          {listed ? (
            <Select
              value={model}
              ariaLabel={t('ai.settings.model')}
              onChange={(v) => (v === OTHER ? setTyping(true) : setProviderField('model', v))}
              options={[
                ...(model
                  ? []
                  : [
                      {
                        value: '',
                        label: official ? adapter.defaultModel : t('ai.settings.modelChoose'),
                      },
                    ]),
                ...options.map((m) => ({ value: m, label: m })),
                { value: OTHER, label: t('ai.settings.modelOther') },
              ]}
            />
          ) : (
            <TextInput value={model} placeholder={official ? adapter.defaultModel : t('ai.settings.modelTyped')} ariaLabel={t('ai.settings.model')} onChange={(v) => setProviderField('model', v)} />
          )}
        </Field>
        {local ? (
          <p className="text-[11.5px] text-ink-soft">{t('ai.settings.localNoKey')}</p>
        ) : (
          <Field label={t('ai.settings.key')} hint={stored ? t('ai.settings.keyStored') : t('ai.settings.keyHint')}>
            <div className="flex gap-1">
              <input
                type="password"
                autoComplete="off"
                spellCheck={false}
                className="min-w-0 flex-1 rounded-md border border-line bg-white px-2 py-1 text-[12.5px] focus:border-accent focus:outline-none"
                value={draftKey}
                placeholder={stored ? '••••••••' : ''}
                aria-label={t('ai.settings.key')}
                onChange={(e) => setDraftKey(e.target.value)}
              />
              <Button variant="outline" onClick={() => void saveKey()} disabled={draftKey.trim() === ''}>
                {t('ai.settings.saveKey')}
              </Button>
              {stored && (
                <Button variant="ghost" onClick={() => void removeKey()}>
                  {t('ai.settings.removeKey')}
                </Button>
              )}
            </div>
          </Field>
        )}
        {keyError && (
          <p className="text-[11.5px] text-warn" role="alert">
            {keyError}
          </p>
        )}
        {desk && deskStatus && !local && (
          <p className={deskStatus.encryption.available && !deskStatus.encryption.weak ? 'text-[11.5px] text-ink-soft' : 'text-[11.5px] text-warn'} data-testid="ai-key-storage">
            {!deskStatus.encryption.available ? t('ai.settings.noEncryption') : deskStatus.encryption.weak ? t('ai.settings.storedWeak') : t('ai.settings.storedEncrypted')}
          </p>
        )}
        {!local && !desk && (
          <Toggle
            label={t('ai.settings.remember')}
            hint={t('ai.settings.rememberHint')}
            checked={settings.remember}
            onChange={(v) => {
              update((s) => ({ ...s, remember: v }));
              // Al activarlo, la clave que ya está en uso también se guarda; al desactivarlo, se olvidan todas.
              if (v) void setKey(provider, getKey(provider), true);
              else void forgetAll(PROVIDER_IDS);
            }}
          />
        )}
        <Toggle label={t('ai.settings.vision')} hint={t('ai.settings.visionHint')} checked={settings.vision} onChange={(v) => update((s) => ({ ...s, vision: v }))} />
        <Toggle label={t('view.aiPill')} checked={settings.pill} onChange={(v) => update((s) => ({ ...s, pill: v }))} />
        {provider !== 'anthropic' && <p className="text-[11px] text-ink-soft">{t('ai.settings.corsHint')}</p>}
        <div className="flex items-center justify-end gap-2 pt-1">
          <span className="mr-auto text-[11.5px]" role="status" data-testid="ai-check">
            {check.state === 'busy' && t(check.auto ? 'ai.settings.detecting' : 'ai.settings.checking')}
            {check.state === 'ok' && <span className={check.n > 0 ? 'text-accent' : 'text-warn'}>{check.n > 0 ? plural(t, 'ai.settings.verified', check.n) : t('ai.settings.noModels')}</span>}
            {check.state === 'ok' && check.suggestedBase && (
              <span className="mt-0.5 block text-ink">
                {t('ai.settings.useV1', { url: check.suggestedBase })}{' '}
                <button type="button" className="font-semibold text-accent underline" onClick={() => setProviderField('baseUrl', check.suggestedBase!)} data-testid="ai-use-v1">
                  {t('ai.settings.useV1Button')}
                </button>
              </span>
            )}
            {check.state === 'error' && <span className="text-warn">{check.message}</span>}
          </span>
          <Button variant="outline" onClick={() => void verify()} disabled={check.state === 'busy'}>
            {t('ai.settings.verify')}
          </Button>
          <Button variant="primary" onClick={() => void (draftKey.trim() ? saveKey() : Promise.resolve()).then(onClose)}>
            {t('common.close')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
