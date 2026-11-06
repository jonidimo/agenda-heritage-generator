/**
 * Lo que un cliente (el servidor MCP) le puede pedir a la agenda abierta en la aplicación de escritorio,
 * y lo que la aplicación contesta. Es el idioma de la página; el transporte (el socket local, el
 * saludo con el token, los errores de conexión) está en `electron/lib/live.mjs`.
 *
 * Todo lo que llega es de un proceso local, pero no de confianza: la página valida cada pedido con estos
 * esquemas antes de tocar nada.
 */
import { z } from 'zod';
import type { JsonPatchOp } from '../util/jsonPatch';
import { JsonPatchOpZ } from '../util/jsonPatchSchema';

/** Los métodos que existen (los mismos que reenvía el intermediario). */
export const LIVE_METHOD_NAMES = ['design.info', 'design.get', 'design.patch', 'view.reveal', 'library.list', 'design.open', 'design.load'] as const;
export type LiveMethodName = (typeof LIVE_METHOD_NAMES)[number];

/** Códigos de error de la página (los del transporte, de -32000 a -32003, son de `live.mjs`). */
export const LIVE_CODES = {
  /** La persona no permitió que un modelo edite la agenda abierta. */
  disabled: -32010,
  /** No hay una agenda abierta. */
  noDesign: -32011,
  /** Hubo cambios en la aplicación desde la revisión que el cliente conocía. */
  conflict: -32012,
  /** El pedido o el resultado no es válido. */
  invalid: -32013,
  /** No existe lo que se pidió (una agenda de la biblioteca, una página). */
  notFound: -32014,
} as const;

const patchOp = JsonPatchOpZ;

/** Parámetros de cada método (lo que la página acepta). */
export const LiveParams = {
  'design.info': z.object({}).optional(),
  'design.get': z.object({ assets: z.boolean().optional() }).optional(),
  'design.patch': z.object({
    patch: z.array(patchOp).min(1).max(500),
    /** La revisión que el cliente leyó: si cambió, el pedido se rechaza con `conflict`. */
    baseRevision: z.number().int().min(0).optional(),
  }),
  'view.reveal': z.object({
    /** Número de página desde 1. */
    page: z.number().int().min(1).optional(),
    key: z.string().max(200).optional(),
    blockId: z.string().max(200).optional(),
  }),
  'library.list': z.object({}).optional(),
  'design.open': z.object({ id: z.string().min(1).max(200) }),
  'design.load': z.object({ design: z.record(z.string(), z.unknown()) }),
} as const satisfies Record<LiveMethodName, z.ZodType>;

/** Lo que contesta `design.info`. */
export interface LiveInfo {
  /** ¿Se permite que un modelo edite la agenda abierta? (Si no, solo se contesta esto.) */
  enabled: boolean;
  open: boolean;
  id?: string;
  name?: string;
  year?: number;
  /** Cambia con cada cambio de la agenda en la aplicación (también al deshacer). */
  revision?: number;
  pageCount?: number;
  /** `design` o `print`: lo que se está haciendo con la agenda. */
  mode: 'design' | 'print';
  appVersion: string;
}

export interface LiveIssue {
  path: string;
  message: string;
}

/** Lo que contesta `design.get`: la agenda tal como está (con los datos de las imágenes propias si se pidieron). */
export interface LiveDesign {
  revision: number;
  design: Record<string, unknown>;
}

/** Lo que contesta `design.patch`. */
export type LivePatchResult = { applied: true; revision: number } | { applied: false; reason: 'invalid'; issues: LiveIssue[] };

export interface LiveReveal {
  page: number;
  key: string;
  /** ¿Quedó elegido el elemento pedido? */
  selected: boolean;
}

export interface LiveLibraryItem {
  id: string;
  name: string;
  year: number;
  updatedAt: string;
}

export interface LiveOpened {
  id: string;
  name: string;
  revision: number;
}

/** Un pedido de parches tipado para quien lo arma. */
export interface LivePatchParams {
  patch: JsonPatchOp[];
  baseRevision?: number;
}
