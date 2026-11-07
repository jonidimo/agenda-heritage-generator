/**
 * El puente en vivo, del lado de la página: la aplicación de escritorio le pasa los pedidos de un modelo
 * de IA (por el servidor MCP) y esta página los atiende sobre la agenda abierta, con las mismas reglas
 * que un cambio hecho a mano: un solo paso que se puede deshacer, validado con el esquema y avisado.
 *
 * `window.__heritageLive(pedido)` lo llama el proceso principal (`executeJavaScript`) y devuelve un sobre
 * `{ ok, result }` o `{ ok: false, code, message }`. Si la persona no lo permitió (Ajustes → «Permitir
 * que un modelo de IA edite la agenda abierta»), solo contesta `design.info`.
 */
import { applyDesignPatch, issuesOf } from '@core/design/patch';
import { LIVE_CODES, LIVE_METHOD_NAMES, LiveParams, type LiveDesign, type LiveFontAdded, type LiveInfo, type LiveLibraryItem, type LiveMethodName, type LiveOpened, type LivePatchResult, type LiveReveal } from '@core/live/protocol';
import { fromBase64, toBase64 } from '@core/resources';
import type { JsonPatchOp } from '@core/util/jsonPatch';
import { newId } from '@core/util/hash';
import { importText } from './files';
import { addUserFont } from './fonts';
import { fontsUsedBy, listDesigns, loadDesign } from './persist';
import { resources } from './resources';
import { revealTarget, type RevealRequest } from './revealTarget';
import { currentDocument } from './selectionContext';
import { flushSave, useStore } from './store';
import { tNow as t } from './tNow';

export type LiveEnvelope = { ok: true; result: unknown } | { ok: false; code: number; message: string };

class LiveFailure extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
  }
}

const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function info(): LiveInfo {
  const s = useStore.getState();
  const doc = s.design ? currentDocument() : null;
  return {
    enabled: s.liveLink,
    open: s.design !== null,
    ...(s.design ? { id: s.design.id, name: s.design.name, year: s.design.calendar.year, revision: s.revision } : {}),
    ...(doc ? { pageCount: doc.pageCount } : {}),
    mode: s.mode,
    appVersion: __APP_VERSION__,
  };
}

function requireOpen(): NonNullable<ReturnType<typeof useStore.getState>['design']> {
  const design = useStore.getState().design;
  if (!design) throw new LiveFailure(LIVE_CODES.noDesign, 'No hay una agenda abierta en la aplicación.');
  return design;
}

function getDesign(params: { assets?: boolean | undefined; fonts?: boolean | undefined } | undefined): LiveDesign {
  const s = useStore.getState();
  const design = requireOpen();
  const out = plain(design) as Record<string, unknown> & { assets: Array<{ id: string; builtin: string | null; data?: string | null }> };
  // Las imágenes propias van adentro (como en un archivo de agenda) para que quien las pide pueda dibujar las páginas.
  if (params?.assets) {
    for (const a of out.assets) {
      const bytes = a.builtin ? undefined : resources.assetBytes.get(a.id);
      if (bytes) a.data = toBase64(bytes);
    }
  }
  // Las fuentes subidas que usa (como en un archivo de agenda): sin ellas, quien dibuje las páginas usaría las de reserva.
  if (params?.fonts) {
    const fonts = fontsUsedBy(design, resources.userFontBytes);
    if (fonts.length > 0) out.userFonts = fonts;
  }
  return { revision: s.revision, design: out };
}

async function patchDesign(params: { patch: JsonPatchOp[]; baseRevision?: number | undefined }): Promise<LivePatchResult> {
  const s = useStore.getState();
  const current = requireOpen();
  if (params.baseRevision !== undefined && params.baseRevision !== s.revision) {
    throw new LiveFailure(LIVE_CODES.conflict, `La agenda cambió en la aplicación (revisión ${s.revision}, se esperaba la ${params.baseRevision}): volvé a leerla antes de cambiarla.`);
  }
  const result = applyDesignPatch(current, params.patch);
  if (!result.ok) return { applied: false, reason: 'invalid', issues: result.issues };
  // Fuentes que llegaron dentro de la agenda: quedan en este equipo, como al abrir un archivo, y la
  // agenda no guarda su base64.
  const { userFonts, ...design } = result.design;
  for (const f of userFonts ?? []) await addUserFont(fromBase64(f.data), f.spec, f.id);
  // Mientras se guardaban, la persona pudo cambiar la agenda: ese cambio no se pisa.
  if (useStore.getState().revision !== s.revision) throw new LiveFailure(LIVE_CODES.conflict, 'La agenda cambió en la aplicación mientras se aplicaba el cambio: volvé a leerla.');
  // Una clave única por pedido: cada cambio de un modelo es su propio paso de «Deshacer».
  useStore.getState().update(() => design, `live:${Date.now()}:${Math.random()}`);
  const after = useStore.getState();
  after.setAiNotice({ text: t('live.changed'), revision: after.revision });
  return { applied: true, revision: after.revision };
}

function reveal(params: RevealRequest): LiveReveal {
  requireOpen();
  const out = revealTarget(params);
  if (out.ok) return { page: out.page, key: out.key, selected: out.selected };
  if (out.reason === 'noDocument') throw new LiveFailure(LIVE_CODES.noDesign, 'La agenda no se puede armar ahora.');
  throw new LiveFailure(LIVE_CODES.notFound, `No existe esa página (la agenda tiene ${out.pageCount}).`);
}

async function library(): Promise<LiveLibraryItem[]> {
  return (await listDesigns()).map((d) => ({ id: d.id, name: d.name, year: d.year, updatedAt: d.updatedAt }));
}

function showOpened(name: string, key: 'live.opened' | 'live.created'): LiveOpened['revision'] {
  const st = useStore.getState();
  st.setShowWelcome(false);
  st.setShowLibrary(false);
  st.setNotice(t(key, { name }));
  return st.revision;
}

async function openSaved(params: { id: string }): Promise<LiveOpened> {
  // Lo último que la persona escribió todavía puede estar sin guardar: se guarda antes de leer la biblioteca.
  await flushSave();
  const design = await loadDesign(params.id).catch((err: unknown) => {
    throw new LiveFailure(LIVE_CODES.invalid, `Esa agenda no se puede abrir: ${(err as Error).message}`);
  });
  if (!design) throw new LiveFailure(LIVE_CODES.notFound, 'No hay una agenda con esa id en la biblioteca.');
  useStore.getState().setDesign(design);
  return { id: design.id, name: design.name, revision: showOpened(design.name, 'live.opened') };
}

/**
 * Una agenda nueva (de una plantilla, o un archivo con sus imágenes): entra a la biblioteca y se abre; la que
 * estaba abierta queda guardada. Siempre con una id nueva puesta ANTES de importar (importar guarda con la
 * id del archivo: con la de otra agenda guardada la pisaría), y solo una agenda: una plantilla o una copia de
 * seguridad (que traen `kind`) no entran por acá.
 */
async function loadNew(params: { design: Record<string, unknown> }): Promise<LiveOpened> {
  if ('kind' in params.design) throw new LiveFailure(LIVE_CODES.invalid, 'Eso no es una agenda (es una plantilla, una copia de seguridad u otro archivo).');
  let imported;
  try {
    imported = await importText(JSON.stringify({ ...params.design, id: newId('agenda') }));
  } catch (err) {
    throw new LiveFailure(LIVE_CODES.invalid, `La agenda no es válida: ${(err as Error).message}`);
  }
  if (imported.kind !== 'design') throw new LiveFailure(LIVE_CODES.invalid, 'Eso no es una agenda.');
  useStore.getState().setDesign(imported.design);
  return { id: imported.design.id, name: imported.design.name, revision: showOpened(imported.design.name, 'live.created') };
}

/** Una fuente propia que manda un modelo (por el servidor MCP): queda en este equipo, para todas las agendas. */
async function addFont(params: { id?: string | undefined; spec: { family: string; weight: number; style: 'normal' | 'italic' }; data: string }): Promise<LiveFontAdded> {
  try {
    return await addUserFont(fromBase64(params.data), params.spec, params.id);
  } catch (err) {
    throw new LiveFailure(LIVE_CODES.invalid, `La fuente no se pudo leer: ${(err as Error).message}`);
  }
}

async function dispatch(method: LiveMethodName, params: unknown): Promise<unknown> {
  switch (method) {
    case 'design.info':
      return info();
    case 'design.get':
      return getDesign(params as Parameters<typeof getDesign>[0]);
    case 'design.patch':
      return patchDesign(params as Parameters<typeof patchDesign>[0]);
    case 'view.reveal':
      return reveal(params as Parameters<typeof reveal>[0]);
    case 'library.list':
      return library();
    case 'design.open':
      return openSaved(params as Parameters<typeof openSaved>[0]);
    case 'design.load':
      return loadNew(params as Parameters<typeof loadNew>[0]);
    case 'fonts.add':
      return addFont(params as Parameters<typeof addFont>[0]);
  }
}

/** Los pedidos se atienden de a uno: un parche que depende de la revisión que dejó el anterior. */
let queue: Promise<unknown> = Promise.resolve();

/** Atiende un pedido del puente. No lanza: todo error vuelve en el sobre. */
export function handleLive(request: unknown): Promise<LiveEnvelope> {
  const run = async (): Promise<LiveEnvelope> => {
    try {
      const method = (request as { method?: unknown } | null)?.method;
      if (typeof method !== 'string' || !(LIVE_METHOD_NAMES as readonly string[]).includes(method)) throw new LiveFailure(LIVE_CODES.invalid, 'Pedido desconocido.');
      const name = method as LiveMethodName;
      // Sin permiso solo se puede preguntar si lo hay: nada de leer ni cambiar.
      if (name !== 'design.info' && !useStore.getState().liveLink) throw new LiveFailure(LIVE_CODES.disabled, 'La persona no permitió que un modelo de IA use la agenda abierta (Ajustes → «Permitir que un modelo de IA edite la agenda abierta»).');
      const parsed = LiveParams[name].safeParse((request as { params?: unknown }).params);
      if (!parsed.success) throw new LiveFailure(LIVE_CODES.invalid, `Parámetros no válidos: ${issuesOf(parsed.error).map((i) => `${i.path}: ${i.message}`).join('; ')}`);
      return { ok: true, result: await dispatch(name, parsed.data) };
    } catch (err) {
      if (err instanceof LiveFailure) return { ok: false, code: err.code, message: err.message };
      return { ok: false, code: LIVE_CODES.invalid, message: (err as Error).message };
    }
  };
  // Preguntar si hay agenda no espera a un pedido lento: si no, una carga trabada haría parecer cerrada a la aplicación.
  if ((request as { method?: unknown } | null)?.method === 'design.info') return run();
  const result = queue.then(run, run);
  queue = result.catch(() => undefined);
  return result;
}

/** Deja el puente a disposición del proceso principal (solo existe en la aplicación de escritorio). */
export function installLive(): () => void {
  const host = window as unknown as { __heritageLive?: (request: unknown) => Promise<LiveEnvelope> };
  host.__heritageLive = handleLive;
  return () => {
    delete host.__heritageLive;
  };
}
