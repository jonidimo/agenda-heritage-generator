/**
 * El bucle del asistente con un proveedor guionado: respuestas, herramientas, una propuesta que espera la
 * decisión de la persona, correcciones, tope de vueltas, cancelación y el recorte del historial.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { trimHistory } from '../src/core/ai/budget';
import type { AiMessage } from '../src/core/ai/messages';
import { LAST_ROUND_NOTE, MAX_ROUNDS, runTurn, settleProposal, type Send } from '../src/core/ai/loop';
import { contextBlock, systemPrompt } from '../src/core/ai/prompt';
import { openai } from '../src/core/ai/providers/openai';
import { executeTool, toolSpecs, type AiContext, type ToolHost } from '../src/core/ai/tools';
import { createDesign } from '../src/core/design/defaults';
import { parseDesign, type Design } from '../src/core/design/schema';
import { AgendaDocument } from '../src/core/document';
import { listPages, pageRenderInfo } from '../src/core/document/inspect';
import { openDocument } from './helpers/node-env';

let doc: AgendaDocument;
let design: Design;

beforeAll(async () => {
  design = parseDesign(createDesign('heritage', { year: 2027, locale: 'es-AR', country: 'AR' }));
  doc = (await openDocument(design)).doc;
});

const ctx = (): AiContext => ({ uiLanguage: 'es', mode: 'design', view: 'spread', agenda: { name: design.name, year: 2027, locale: 'es-AR', pages: doc.pageCount, revision: 1 }, page: null, selection: [] });

const host = (extra: Partial<ToolHost> = {}): ToolHost => ({
  context: ctx,
  design: () => design,
  document: () => doc,
  documentFor: (d) => new AgendaDocument(d, doc.resources, {}, { reuse: doc }),
  reveal: () => ({ ok: true, page: 1, key: 'x', selected: false }),
  setView: () => 'ok',
  catalogueExtra: () => ({ fonts: ['Lora'] }),
  ...extra,
});

/** Un proveedor (con el formato de OpenAI) que contesta lo que dice el guion, una respuesta por pedido. */
function scripted(replies: Array<Record<string, unknown>>): { send: Send; seen: Array<Record<string, unknown>> } {
  const seen: Array<Record<string, unknown>> = [];
  const send: Send = async (wire) => {
    seen.push(JSON.parse(wire.body!) as Record<string, unknown>);
    const next = replies.shift();
    if (!next) throw new Error('el guion se terminó');
    return { choices: [{ finish_reason: next.tool_calls ? 'tool_calls' : 'stop', message: { content: next.content ?? null, tool_calls: next.tool_calls } }] };
  };
  return { send, seen };
}

const call = (id: string, name: string, args: unknown) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } });
const base = (send: Send, extra: Partial<Parameters<typeof runTurn>[0]> = {}) => ({ history: [], userText: 'pedido', adapter: openai, cfg: { model: 'm', surface: 'web' as const }, send, host: host(), signal: new AbortController().signal, ...extra });

describe('un turno', () => {
  it('una respuesta sin herramientas termina el turno', async () => {
    const { send, seen } = scripted([{ content: 'Hola.' }]);
    const out = await runTurn(base(send));
    expect(out).toMatchObject({ kind: 'answer', text: 'Hola.' });
    // El pedido lleva el contexto de la aplicación antes del texto de la persona.
    expect(JSON.stringify(seen[0]!.messages)).toContain('<context>');
    expect(out.history.map((m) => m.role)).toEqual(['user', 'assistant']);
  });

  it('usa herramientas y sigue hasta una propuesta, que espera la decisión de la persona', async () => {
    const { send, seen } = scripted([
      { tool_calls: [call('a', 'get_context', {}), call('b', 'get_design_part', { pointer: '/theme/comfort' })] },
      { content: 'Te propongo letra amplia.', tool_calls: [call('c', 'propose_change', { patch: [{ op: 'replace', path: '/theme/comfort', value: 'wide' }], summary: 'Letra amplia' })] },
    ]);
    const events: string[] = [];
    const out = await runTurn(base(send, { onEvent: (e) => events.push(e.type === 'tool' ? e.name : 'thinking') }));
    expect(out.kind).toBe('proposal');
    if (out.kind !== 'proposal') return;
    expect(out.proposal.design.theme.comfort).toBe('wide');
    expect(out.proposal.summary).toBe('Letra amplia');
    // Lo que leyó el modelo en la segunda vuelta: el valor de la agenda.
    const tool = (seen[1]!.messages as Array<{ role: string; tool_call_id?: string; content?: unknown }>).find((m) => m.tool_call_id === 'b');
    expect(tool?.content).toBe('"normal"');
    expect(events).toEqual(['thinking', 'get_context', 'get_design_part', 'thinking', 'propose_change']);
    // Sin decidir no se puede seguir; al decidir, el modelo se entera.
    await expect(runTurn(base(scripted([]).send, { history: out.history }))).rejects.toMatchObject({ kind: 'protocol' });
    const settled = settleProposal(out.history, out.pending, { applied: true, revision: 7 });
    expect(settled.at(-1)).toMatchObject({ role: 'tool', results: [{ callId: 'c', content: [{ type: 'text', text: '{"applied":true,"revision":7}' }] }] });
    const next = scripted([{ content: 'Listo.' }]);
    expect(await runTurn(base(next.send, { history: settled }))).toMatchObject({ kind: 'answer' });
    // La conversación solo creció: lo anterior viaja igual que antes.
    const roles = (next.seen[0]!.messages as Array<{ role: string }>).map((m) => m.role);
    expect(roles).toEqual(['system', 'user', 'assistant', 'tool', 'tool', 'assistant', 'tool', 'user']);
  });

  it('una propuesta inválida vuelve al modelo con los problemas, y corrige', async () => {
    const { send, seen } = scripted([
      { tool_calls: [call('a', 'propose_change', { patch: [{ op: 'replace', path: '/theme/comfort', value: 42 }], summary: 'x' })] },
      { tool_calls: [call('b', 'propose_change', { patch: [{ op: 'replace', path: '/theme/comfort', value: 'compact' }], summary: 'y' })] },
    ]);
    const out = await runTurn(base(send));
    expect(out.kind).toBe('proposal');
    expect(JSON.stringify(seen[1]!.messages)).toContain('El cambio no se puede aplicar');
  });

  it('dos propuestas en una vuelta: vale la primera, la segunda vuelve como error', async () => {
    const { send } = scripted([
      {
        tool_calls: [
          call('a', 'propose_change', { patch: [{ op: 'replace', path: '/name', value: 'A' }], summary: 'a' }),
          call('b', 'propose_change', { patch: [{ op: 'replace', path: '/name', value: 'B' }], summary: 'b' }),
        ],
      },
    ]);
    const out = await runTurn(base(send));
    if (out.kind !== 'proposal') throw new Error('se esperaba una propuesta');
    expect(out.proposal.design.name).toBe('A');
    expect(out.pending.others).toMatchObject([{ callId: 'b', isError: true }]);
  });

  it('no da vueltas para siempre, y se puede cancelar', async () => {
    const loop = scripted(Array.from({ length: MAX_ROUNDS + 1 }, (_, i) => ({ tool_calls: [call(`c${i}`, 'get_context', {})] })));
    await expect(runTurn(base(loop.send))).rejects.toMatchObject({ kind: 'rounds' });
    expect(loop.seen).toHaveLength(MAX_ROUNDS);
    const ac = new AbortController();
    ac.abort();
    await expect(runTurn(base(scripted([{ content: 'x' }]).send, { signal: ac.signal }))).rejects.toMatchObject({ kind: 'aborted' });
  });

  it('antes de la última vuelta se le avisa al modelo, y si ahí propone, el pedido termina bien', async () => {
    const looking = Array.from({ length: MAX_ROUNDS - 1 }, (_, i) => ({ tool_calls: [call(`c${i}`, 'get_context', {})] }));
    const loop = scripted([...looking, { tool_calls: [call('p', 'propose_change', { patch: [{ op: 'replace', path: '/locale', value: 'en' }], summary: 'Inglés' })] }]);
    const out = await runTurn(base(loop.send));
    expect(out.kind).toBe('proposal');
    expect(loop.seen).toHaveLength(MAX_ROUNDS);
    // Solo el último pedido lleva el aviso, junto a las respuestas de la vuelta anterior (al final, sin reescribir nada).
    const lastSent = JSON.stringify(loop.seen.at(-1)!.messages);
    expect(lastSent).toContain('This is your last step');
    expect(loop.seen.slice(0, -1).every((req) => !JSON.stringify(req.messages).includes('This is your last step'))).toBe(true);
    const tail = (loop.seen.at(-1)!.messages as Array<{ role: string; content: string }>).at(-1)!;
    expect(tail.role).toBe('tool');
    expect(tail.content).toContain(LAST_ROUND_NOTE);
    // Lo que se guarda es lo que se mandó: el pedido siguiente no cambia lo anterior.
    if (out.kind !== 'proposal') throw new Error('se esperaba una propuesta');
    expect(JSON.stringify(out.history)).toContain(LAST_ROUND_NOTE);
  });

  it('un rechazo o una respuesta cortada se dicen como tales', async () => {
    const refusal: Send = async () => ({ choices: [{ finish_reason: 'content_filter', message: { content: '' } }] });
    await expect(runTurn(base(refusal))).rejects.toMatchObject({ kind: 'refusal' });
    const cut: Send = async () => ({ choices: [{ finish_reason: 'length', message: { content: 'a medias' } }] });
    await expect(runTurn(base(cut))).rejects.toMatchObject({ kind: 'length' });
  });
});

describe('herramientas', () => {
  it('sin visión no se ofrece mirar páginas; con visión, la imagen va con la información de la página', async () => {
    expect(toolSpecs(host()).map((t) => t.name)).not.toContain('render_page');
    const png = { type: 'image', mime: 'image/png', data: 'AAAA' } as const;
    const seeing = host({ render: async () => png });
    expect(toolSpecs(seeing).map((t) => t.name)).toContain('render_page');
    const out = await executeTool('render_page', { page: 3 }, seeing);
    expect(out.content[0]).toEqual(png);
    expect(JSON.parse((out.content[1] as { text: string }).text)).toEqual(pageRenderInfo(doc, 2));
    for (const spec of toolSpecs(seeing)) {
      expect(spec.inputSchema).not.toHaveProperty('$schema');
      expect(spec.inputSchema).toMatchObject({ type: 'object', additionalProperties: false });
    }
  });

  it('las mismas respuestas que el servidor MCP; entradas raras se rechazan sin romper nada', async () => {
    const out = await executeTool('list_pages', { type: 'weekLeft', limit: 3 }, host());
    expect(JSON.parse((out.content[0] as { text: string }).text)).toEqual(listPages(doc, { type: 'weekLeft', limit: 3 }));
    expect(await executeTool('list_pages', { limit: 'mucho' }, host())).toMatchObject({ isError: true });
    expect(await executeTool('list_pages', { extra: 1 }, host())).toMatchObject({ isError: true });
    expect(await executeTool('borrar_todo', {}, host())).toMatchObject({ isError: true });
  });

  it('una parte grande de la agenda se resume en sus claves con su tamaño', async () => {
    const out = await executeTool('get_design_part', { pointer: '', maxBytes: 2000 }, host());
    const r = JSON.parse((out.content[0] as { text: string }).text) as { truncated: boolean; keys: Array<{ key: string; bytes: number }> };
    expect(r.truncated).toBe(true);
    expect(r.keys.map((k) => k.key)).toContain('sections');
    expect(await executeTool('get_design_part', { pointer: '/no/existe' }, host())).toMatchObject({ isError: true });
  });

  it('la revisión de la propuesta maqueta con el ritmo del anfitrión, y detenerla corta el turno', async () => {
    const paced: number[] = [];
    const patch = [{ op: 'replace', path: '/theme/comfort', value: 'wide' }];
    const out = await executeTool('propose_change', { patch, summary: 'x' }, host({ pace: async (d) => void paced.push(d.pageCount) }));
    expect('proposal' in out).toBe(true);
    // Dos agendas: la de antes y la de después.
    expect(paced).toHaveLength(2);
    const stop = host({ pace: async () => Promise.reject(Object.assign(new Error('Cancelado.'), { name: 'AbortError' })) });
    await expect(executeTool('propose_change', { patch, summary: 'x' }, stop)).rejects.toMatchObject({ kind: 'aborted' });
  });

  it('con un borrador de trabajo, los avisos nuevos se cuentan contra la agenda confirmada', async () => {
    const draft = { ...design, name: 'Borrador' };
    const seenBefore: string[] = [];
    const h = host({ design: () => draft, baseline: () => design, documentFor: (d) => (seenBefore.push(d.name), new AgendaDocument(d, doc.resources, {}, { reuse: doc })) });
    const out = await executeTool('propose_change', { patch: [{ op: 'replace', path: '/theme/comfort', value: 'wide' }], summary: 'x' }, h);
    expect('proposal' in out && out.proposal.design.name).toBe('Borrador');
    expect(seenBefore[0]).toBe(design.name);
  });

  it('la propuesta dice qué claves se ignoraron y qué avisos nuevos aparecen', async () => {
    const out = await executeTool('propose_change', { patch: [{ op: 'add', path: '/inventada', value: 1 }], summary: 'x' }, host());
    expect('proposal' in out && out.proposal.ignored).toEqual(['/inventada']);
  });
});

describe('historial y texto de sistema', () => {
  it('se recortan intercambios enteros desde el principio, nunca el pedido en curso', () => {
    const big = 'x'.repeat(1000);
    const h: AiMessage[] = [];
    for (let i = 0; i < 5; i++) h.push({ role: 'user', parts: [{ type: 'text', text: `${i}${big}` }] }, { role: 'assistant', text: big, toolCalls: [] });
    const out = trimHistory(h, { maxChars: 5000, maxMessages: 100 });
    expect(out[0]!.role).toBe('user');
    expect(out.length % 2).toBe(0);
    expect(out.length).toBeLessThan(h.length);
    expect(out).toEqual(h.slice(h.length - out.length));
    // El último intercambio va siempre, aunque solo él pase del tope.
    expect(trimHistory(h, { maxChars: 10, maxMessages: 100 })).toEqual(h.slice(-2));
  });

  it('el texto de sistema no cambia con la agenda (para la caché) y dice en qué idioma contestar', () => {
    expect(systemPrompt('es', false)).toBe(systemPrompt('es', false));
    expect(systemPrompt('es', false)).toContain('Spanish');
    expect(systemPrompt('it', true)).toContain('Italian');
    expect(systemPrompt('es', true)).not.toBe(systemPrompt('es', false));
    // Lo que le faltó a un modelo local para traducir sin recorrer la agenda: «/locale» traduce todo lo generado.
    expect(systemPrompt('es', false)).toContain('"/locale"');
    expect(systemPrompt('es', false)).toContain('/holidays/renamed/YYYY-MM-DD');
    expect(systemPrompt('es', false)).toContain('do not go page by page');
    expect(contextBlock(ctx())).toMatch(/^<context>\n\{.*\}\n<\/context>$/s);
  });
});
