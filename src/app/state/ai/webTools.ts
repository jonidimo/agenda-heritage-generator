/**
 * Las herramientas de internet y de carpetas del asistente, en la aplicación de escritorio. Las hace el
 * proceso principal (`electron/lib/starBridge.mjs`, `src/node/starTools.ts`); acá se piden por
 * `app://heritage/_sys/tools/*`, y lo que devuelven para la agenda (imágenes y fuentes ya preparadas) se agrega
 * a Recursos y a las fuentes con los mismos caminos que una subida a mano. Nada se coloca en una página: eso lo
 * propone el asistente con `propose_change`, que la persona aprueba.
 */
import type { AiPart, AiToolSpec } from '@core/ai/messages';
import type { WebToolsHost } from '@core/ai/tools';
import { fromBase64 } from '@core/resources';
import { currentDocument } from '../selectionContext';
import { isDesktopShell } from '../desktopBridge';
import { addUserFont } from '../fonts';
import { useStore } from '../store';
import { addPreparedAsset } from '../uploads';

interface StarPart {
  type: 'text' | 'image';
  text?: string;
  mime?: string;
  data?: string;
}

interface StarAsset {
  name: string;
  kind: 'raster' | 'vector';
  mime: string;
  data: string;
  credit?: unknown;
  savedAs?: string;
}

interface StarFont {
  family: string;
  weight: number;
  style: 'normal' | 'italic';
  data: string;
  label: string;
}

interface StarResult {
  content: StarPart[];
  isError?: boolean;
  assets?: StarAsset[];
  fonts?: StarFont[];
  error?: string;
}

const post = async <T>(route: string, body: unknown, signal?: AbortSignal): Promise<{ ok: boolean; status: number; json: T | null }> => {
  const res = await fetch(`/_sys/tools/${route}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), ...(signal ? { signal } : {}) });
  const json = await res.json().then(
    (v: unknown) => v as T,
    () => null,
  );
  return { ok: res.ok, status: res.status, json };
};

const agendaRef = (): { id: string; name: string } | null => {
  const d = useStore.getState().design;
  return d ? { id: d.id, name: d.name } : null;
};

/** Qué dijo el proceso principal (o por qué falló), como partes de texto. */
const textOf = (t: string, isError = false): { content: AiPart[]; isError?: boolean } => ({ content: [{ type: 'text', text: t }], ...(isError ? { isError } : {}) });

/** `for` (la tapa o una página) se traduce a milímetros con la agenda abierta. */
function withSize(input: unknown): unknown {
  if (!input || typeof input !== 'object') return input;
  const { for: target, ...rest } = input as Record<string, unknown> & { for?: unknown };
  if (target === undefined) return input;
  const doc = currentDocument();
  if (!doc) throw new Error('La agenda no se puede armar ahora.');
  if (rest.sizeMm !== undefined) throw new Error('Indicá el tamaño con «for» o con «sizeMm», no con los dos.');
  return { ...rest, sizeMm: target === 'cover' ? doc.coverSize() : doc.pageSize() };
}

const FOR_PROP = { type: 'string', enum: ['cover', 'page'], description: 'cover: the whole cover with bleed and spine; page: one page. Instead of sizeMm.' };

function adapt(spec: AiToolSpec): AiToolSpec {
  if (spec.name !== 'import_image') return spec;
  const props = (spec.inputSchema.properties ?? {}) as Record<string, unknown>;
  return { ...spec, inputSchema: { ...spec.inputSchema, properties: { ...props, for: FOR_PROP } } };
}

/** Lo que vuelve para la agenda se agrega y se le cuenta al modelo con qué id quedó. */
async function absorb(result: StarResult, vision: boolean): Promise<AiPart[]> {
  const parts: AiPart[] = result.content.flatMap((p): AiPart[] => {
    if (p.type === 'text' && p.text !== undefined) return [{ type: 'text', text: p.text }];
    if (p.type === 'image' && vision && p.data && (p.mime === 'image/png' || p.mime === 'image/jpeg')) return [{ type: 'image', mime: p.mime, data: p.data }];
    return [];
  });
  const notes: string[] = [];
  for (const a of result.assets ?? []) {
    const added = await addPreparedAsset({ name: a.name, kind: a.kind, mime: a.mime, bytes: fromBase64(a.data), credit: a.credit });
    notes.push(
      added.duplicate
        ? `Ya estaba en Resources como «${added.name}»: assetId ${added.id}. Usá ese.`
        : `Agregada a Resources: assetId ${added.id} (${added.width}×${added.height}). Todavía no está en ninguna página: para usarla, proponé el cambio con propose_change (referenciá este assetId; /assets ya la tiene).`,
    );
  }
  for (const f of result.fonts ?? []) {
    const added = await addUserFont(fromBase64(f.data), { family: f.family, weight: f.weight, style: f.style }, { mode: 'keep' });
    notes.push(`Fuente instalada: «${added.family}» ${added.weight}${added.style === 'italic' ? ' cursiva' : ''}. Para usarla, proponé /theme/tokens/fonts/<rol> con propose_change.`);
  }
  if (notes.length > 0) parts.push({ type: 'text', text: JSON.stringify({ addedToPlanner: notes }) });
  return parts;
}

/** Las herramientas, si es el escritorio y la persona no las apagó; si no, `undefined` (sin ellas). */
export async function loadWebTools(vision: boolean, signal?: AbortSignal): Promise<WebToolsHost | undefined> {
  if (!isDesktopShell()) return undefined;
  let listed: { enabled: boolean; tools: AiToolSpec[] };
  try {
    const res = await fetch('/_sys/tools/list', { ...(signal ? { signal } : {}) });
    if (!res.ok) return undefined;
    listed = (await res.json()) as { enabled: boolean; tools: AiToolSpec[] };
  } catch {
    return undefined;
  }
  if (!listed.enabled || listed.tools.length === 0) return undefined;
  return {
    specs: listed.tools.map(adapt),
    async call(name, input, callSignal) {
      let body: unknown;
      try {
        body = withSize(input);
      } catch (err) {
        return textOf((err as Error).message, true);
      }
      const res = await post<StarResult>('call', { name, input: body, agenda: agendaRef() }, callSignal ?? signal);
      if (!res.json) return textOf('El proceso principal no contestó.', true);
      if (!res.ok || !res.json.content) return textOf(res.json.error ?? `Error ${res.status}.`, true);
      try {
        return { content: await absorb(res.json, vision), ...(res.json.isError ? { isError: true } : {}) };
      } catch (err) {
        return textOf(`No se pudo agregar a la agenda: ${(err as Error).message}`, true);
      }
    },
  };
}
