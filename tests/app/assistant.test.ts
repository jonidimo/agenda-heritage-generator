/**
 * El asistente dentro de la aplicación, con un proveedor simulado: la propuesta se ve como vista previa y
 * no cambia la agenda hasta «Aplicar» (un solo paso de deshacer), «Descartar» la saca, una edición de la
 * persona la deja vieja, y los errores del proveedor se muestran con su clase.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDesign } from '../../src/core/design/defaults';
import { parseDesign } from '../../src/core/design/schema';
import { installAssistant, useAssistant } from '../../src/app/state/ai/assistant';
import { setKey } from '../../src/app/state/ai/keys';
import { AI_SETTINGS_DEFAULT } from '../../src/app/state/ai/settings';
import { useStore } from '../../src/app/state/store';

const fresh = () => parseDesign(createDesign('heritage', { year: 2027, locale: 'es-AR', country: 'AR' }));

type Reply = { status?: number; body: unknown };
let script: Reply[] = [];
const seen: Array<{ url: string; headers: Record<string, string>; body: Record<string, unknown> }> = [];

const anthropicReply = (content: unknown[], stop = 'tool_use'): Reply => ({ body: { model: 'claude-opus-5-5', stop_reason: stop, content } });
const proposeComfort = (value: string, id = 'p1'): Reply =>
  anthropicReply([{ type: 'text', text: 'Te propongo esto.' }, { type: 'tool_use', id, name: 'propose_change', input: { patch: [{ op: 'replace', path: '/theme/comfort', value }], summary: `Comodidad ${value}` } }]);

let uninstall: () => void = () => undefined;

beforeEach(async () => {
  script = [];
  seen.length = 0;
  vi.stubGlobal('fetch', async (url: string, init: { headers: Record<string, string>; body: string }) => {
    seen.push({ url, headers: init.headers, body: JSON.parse(init.body) as Record<string, unknown> });
    const next = script.shift();
    if (!next) throw new TypeError('sin guion');
    return new Response(JSON.stringify(next.body), { status: next.status ?? 200, headers: { 'content-type': 'application/json' } });
  });
  useStore.setState({ design: null, past: [], future: [], aiNotice: null, revision: 0, previewDesign: null, previewBase: null, previewKey: null, pageIndex: 0 });
  useAssistant.setState({ settings: { ...AI_SETTINGS_DEFAULT, provider: 'anthropic', vision: false }, proposal: null, reply: null, error: null, status: 'idle', turns: [] });
  useStore.getState().setDesign(fresh());
  uninstall = installAssistant();
  // La conversación vive en el módulo: cada prueba empieza con una limpia.
  useAssistant.getState().clear();
  await setKey('anthropic', 'sk-test', false);
});

afterEach(() => {
  uninstall();
  vi.unstubAllGlobals();
});

describe('propuestas', () => {
  it('se ven como vista previa sin tocar la agenda; Aplicar es un solo paso de deshacer y la bandera de siempre', async () => {
    script.push(proposeComfort('wide'));
    await useAssistant.getState().send('Letra más grande');
    const a = useAssistant.getState();
    expect(a.status).toBe('awaiting');
    expect(a.proposal).toMatchObject({ summary: 'Comodidad wide', stale: false });
    const st = useStore.getState();
    expect(st.design!.theme.comfort).toBe('normal');
    expect(st.previewDesign!.theme.comfort).toBe('wide');
    expect(st.previewKey).toBe(`ai:${a.proposal!.id}`);
    // La clave la puso el transporte (el adaptador nunca la ve), con la cabecera del navegador.
    expect(seen[0]!.headers['x-api-key']).toBe('sk-test');
    expect(seen[0]!.headers['anthropic-dangerous-direct-browser-access']).toBe('true');

    const before = useStore.getState().past.length;
    await useAssistant.getState().apply();
    const after = useStore.getState();
    expect(after.design!.theme.comfort).toBe('wide');
    expect(after.past.length).toBe(before + 1);
    expect(after.previewDesign).toBeNull();
    expect(after.aiNotice).toMatchObject({ revision: after.revision });
    expect(useAssistant.getState().proposal).toBeNull();
    after.undo();
    expect(useStore.getState().design!.theme.comfort).toBe('normal');

    // El modelo se entera de lo que pasó antes del pedido siguiente.
    script.push(anthropicReply([{ type: 'text', text: 'Listo.' }], 'end_turn'));
    await useAssistant.getState().send('¿Algo más?');
    const messages = seen[1]!.body.messages as Array<{ role: string; content: Array<Record<string, unknown>> }>;
    const result = messages.flatMap((m) => m.content).find((b) => b.type === 'tool_result');
    expect(result).toMatchObject({ tool_use_id: 'p1' });
    expect(JSON.stringify(result)).toContain('applied');
    expect(useAssistant.getState().reply).toBe('Listo.');
  });

  it('Descartar la saca de la página y la agenda queda igual', async () => {
    script.push(proposeComfort('compact'));
    await useAssistant.getState().send('Más apretado');
    await useAssistant.getState().discard();
    const st = useStore.getState();
    expect(st.previewDesign).toBeNull();
    expect(st.design!.theme.comfort).toBe('normal');
    expect(useAssistant.getState().turns.at(-1)!.outcome).toBe('discarded');
  });

  it('si la persona cambia la agenda mientras espera, la propuesta queda vieja y ya no se aplica', async () => {
    script.push(proposeComfort('wide'));
    await useAssistant.getState().send('Letra más grande');
    useStore.getState().update((d) => void (d.name = 'Otro nombre'));
    expect(useAssistant.getState().proposal!.stale).toBe(true);
    await useAssistant.getState().apply();
    expect(useStore.getState().design!.theme.comfort).toBe('normal');
    expect(useStore.getState().design!.name).toBe('Otro nombre');
  });

  it('«Limpiar» con una propuesta a la vista deja una conversación sana (sin respuestas sueltas)', async () => {
    script.push(proposeComfort('wide'));
    await useAssistant.getState().send('Letra más grande');
    useAssistant.getState().clear();
    await new Promise((r) => setTimeout(r, 0));
    script.push(anthropicReply([{ type: 'text', text: 'Hola.' }], 'end_turn'));
    await useAssistant.getState().send('Hola');
    const messages = seen[1]!.body.messages as Array<{ role: string; content: Array<Record<string, unknown>> }>;
    expect(messages).toHaveLength(1);
    expect(messages[0]!.content.some((b) => b.type === 'tool_result')).toBe(false);
  });

  it('una respuesta vacía del modelo no queda en la conversación', async () => {
    useAssistant.getState().clear();
    script.push(anthropicReply([], 'end_turn'));
    await useAssistant.getState().send('Hola');
    script.push(anthropicReply([{ type: 'text', text: 'Ahora sí.' }], 'end_turn'));
    await useAssistant.getState().send('¿Y?');
    const messages = seen[1]!.body.messages as Array<{ role: string; content: unknown[] }>;
    expect(messages.every((m) => m.content.length > 0)).toBe(true);
    expect(messages.map((m) => m.role)).toEqual(['user']);
  });

  it('si la persona cambia la agenda mientras el modelo trabaja, la propuesta llega vieja y no se muestra', async () => {
    script.push(proposeComfort('wide'));
    const sending = useAssistant.getState().send('Letra más grande');
    useStore.getState().update((d) => void (d.name = 'Cambiado mientras'));
    await sending;
    expect(useAssistant.getState().proposal!.stale).toBe(true);
    expect(useStore.getState().previewDesign).toBeNull();
  });

  it('otra agenda empieza una conversación nueva', async () => {
    script.push(proposeComfort('wide'));
    await useAssistant.getState().send('Letra más grande');
    useStore.getState().setDesign({ ...fresh(), id: 'otra' });
    const a = useAssistant.getState();
    expect(a.proposal).toBeNull();
    expect(a.turns).toEqual([]);
  });
});

describe('ajustar una propuesta', () => {
  const proposePatch = (patch: unknown[], summary: string, id: string): Reply =>
    anthropicReply([{ type: 'tool_use', id, name: 'propose_change', input: { patch, summary } }]);

  it('pedir otra cosa con una propuesta a la vista la ajusta: se suma encima y Aplicar confirma todo en un paso', async () => {
    script.push(proposePatch([{ op: 'replace', path: '/theme/comfort', value: 'wide' }], 'Más amplio', 'p1'));
    await useAssistant.getState().send('Letra más grande');
    expect(useAssistant.getState().proposal!.rounds).toBe(1);
    // El ajuste: el modelo lee el borrador (la comodidad ya está en «wide») y propone algo más.
    script.push(
      anthropicReply([{ type: 'tool_use', id: 'g1', name: 'get_design_part', input: { path: '/theme/comfort' } }]),
      proposePatch([{ op: 'replace', path: '/name', value: 'Agenda ajustada' }], 'Y con otro nombre', 'p2'),
    );
    await useAssistant.getState().send('Y cambiale el nombre');
    // Lo que recibió el modelo: la propuesta anterior quedó como borrador («refining»), no descartada.
    const sent = JSON.stringify(seen[1]!.body.messages);
    expect(sent).toContain('refining');
    expect(sent).not.toContain('discarded');
    // La herramienta de lectura vio el borrador.
    expect(JSON.stringify(seen[2]!.body.messages)).toContain('wide');
    const a = useAssistant.getState();
    expect(a.proposal).toMatchObject({ summary: 'Y con otro nombre', rounds: 2, stale: false });
    expect(a.proposal!.ops.map((o) => o.path)).toEqual(['/theme/comfort', '/name']);
    expect(a.turns.map((t) => t.outcome)).toEqual(['refined', 'proposed']);
    const st = useStore.getState();
    expect(st.design!.theme.comfort).toBe('normal');
    expect(st.previewDesign).toMatchObject({ name: 'Agenda ajustada', theme: { comfort: 'wide' } });
    const past = st.past.length;
    await useAssistant.getState().apply();
    const after = useStore.getState();
    expect(after.design).toMatchObject({ name: 'Agenda ajustada', theme: { comfort: 'wide' } });
    expect(after.past.length).toBe(past + 1);
    after.undo();
    expect(useStore.getState().design).toMatchObject({ theme: { comfort: 'normal' } });
    expect(useStore.getState().design!.name).not.toBe('Agenda ajustada');
  });

  it('si el ajuste termina en una respuesta, la propuesta de antes sigue a la vista y se puede aplicar', async () => {
    script.push(proposePatch([{ op: 'replace', path: '/theme/comfort', value: 'compact' }], 'Más apretado', 'p1'));
    await useAssistant.getState().send('Más apretado');
    script.push(anthropicReply([{ type: 'text', text: '¿Cuánto más apretado?' }], 'end_turn'));
    await useAssistant.getState().send('Un poco más');
    const a = useAssistant.getState();
    expect(a.reply).toBe('¿Cuánto más apretado?');
    expect(a.status).toBe('awaiting');
    expect(a.proposal).toMatchObject({ summary: 'Más apretado', stale: false });
    expect(useStore.getState().previewDesign!.theme.comfort).toBe('compact');
    await useAssistant.getState().apply();
    expect(useStore.getState().design!.theme.comfort).toBe('compact');
  });

  it('una propuesta vieja no se ajusta: se deja pasar', async () => {
    script.push(proposePatch([{ op: 'replace', path: '/theme/comfort', value: 'wide' }], 'Más amplio', 'p1'));
    await useAssistant.getState().send('Letra más grande');
    useStore.getState().update((d) => {
      d.name = 'Cambio a mano';
    });
    script.push(anthropicReply([{ type: 'text', text: 'Listo.' }], 'end_turn'));
    await useAssistant.getState().send('Otra cosa');
    expect(JSON.stringify(seen[1]!.body.messages)).toContain('stale');
    expect(useAssistant.getState().proposal).toBeNull();
  });
});

describe('detener o limpiar un ajuste', () => {
  /** Un proveedor que no contesta hasta que se cancela el pedido. */
  const hang = () =>
    vi.stubGlobal('fetch', (_url: string, init: { signal?: AbortSignal }) => new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('abort'), { name: 'AbortError' })))));

  it('detener un ajuste deja a la vista la propuesta que se ajustaba (con Aplicar y Descartar)', async () => {
    script.push(anthropicReply([{ type: 'tool_use', id: 'p1', name: 'propose_change', input: { patch: [{ op: 'replace', path: '/theme/comfort', value: 'wide' }], summary: 'Más amplio' } }]));
    await useAssistant.getState().send('Más grande');
    hang();
    const pending = useAssistant.getState().send('Un poco más');
    await new Promise((r) => setTimeout(r, 10));
    useAssistant.getState().stop();
    await pending;
    const a = useAssistant.getState();
    expect(a.proposal).toMatchObject({ summary: 'Más amplio' });
    expect(a.status).toBe('awaiting');
    expect(useStore.getState().previewDesign!.theme.comfort).toBe('wide');
    await useAssistant.getState().apply();
    expect(useStore.getState().design!.theme.comfort).toBe('wide');
  });

  it('«Limpiar» durante un ajuste saca el borrador de la página', async () => {
    script.push(anthropicReply([{ type: 'tool_use', id: 'p1', name: 'propose_change', input: { patch: [{ op: 'replace', path: '/theme/comfort', value: 'wide' }], summary: 'Más amplio' } }]));
    await useAssistant.getState().send('Más grande');
    hang();
    const pending = useAssistant.getState().send('Un poco más');
    await new Promise((r) => setTimeout(r, 10));
    useAssistant.getState().clear();
    await pending;
    expect(useAssistant.getState().proposal).toBeNull();
    expect(useStore.getState().previewDesign).toBeNull();
  });
});

describe('errores', () => {
  it('una clave rechazada se muestra como tal, y la conversación no queda a medias', async () => {
    script.push({ status: 401, body: { error: { message: 'invalid x-api-key' } } });
    await useAssistant.getState().send('Hola');
    expect(useAssistant.getState()).toMatchObject({ status: 'error', error: { kind: 'auth' } });
    script.push(anthropicReply([{ type: 'text', text: 'Hola.' }], 'end_turn'));
    await useAssistant.getState().retry();
    expect(useAssistant.getState().reply).toBe('Hola.');
    // El pedido fallido no quedó en la conversación: solo va el nuevo.
    expect((seen[1]!.body.messages as unknown[]).length).toBe(1);
  });

  it('sin clave no sale nada hacia el proveedor', async () => {
    await setKey('anthropic', null, false);
    await useAssistant.getState().send('Hola');
    expect(seen).toHaveLength(0);
    expect(useAssistant.getState().error).toMatchObject({ kind: 'auth' });
  });
});
