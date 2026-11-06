/**
 * La conversación del asistente de la aplicación en un formato neutral: el bucle y las herramientas
 * hablan así, y cada adaptador de proveedor (Anthropic, Gemini, OpenAI y compatibles) lo traduce a su
 * API y de vuelta. Nada de acá sabe de redes, claves ni del navegador.
 */

export type AiProviderId = 'anthropic' | 'gemini' | 'openai';

export interface AiTextPart {
  type: 'text';
  text: string;
}

export interface AiImagePart {
  type: 'image';
  mime: 'image/png' | 'image/jpeg';
  /** Base64 sin el prefijo `data:`. */
  data: string;
}

export type AiPart = AiTextPart | AiImagePart;

export interface AiToolCall {
  /** La id que dio el proveedor (o una propia, si el proveedor no da ninguna). */
  id: string;
  name: string;
  /** Lo que el modelo pidió, ya leído como JSON. `null` si no se pudo leer (ver `inputError`). */
  input: unknown;
  /** El JSON de los argumentos venía roto: la llamada no se ejecuta y el modelo recibe el error. */
  inputError?: string;
}

export interface AiToolResult {
  callId: string;
  name: string;
  content: AiPart[];
  isError?: boolean;
}

/**
 * Lo que el proveedor devolvió tal cual, para reenviarlo sin cambios en los pedidos siguientes. Algunos
 * proveedores lo exigen: los bloques de razonamiento de Claude y las firmas de razonamiento de Gemini
 * solo valen si vuelven idénticos. Solo se usa con el mismo proveedor que lo produjo.
 */
export interface AiRaw {
  provider: AiProviderId;
  content: unknown;
}

export type AiMessage =
  | { role: 'user'; parts: AiPart[] }
  | { role: 'assistant'; text: string; toolCalls: AiToolCall[]; raw?: AiRaw }
  | { role: 'tool'; results: AiToolResult[] };

export interface AiToolSpec {
  name: string;
  description: string;
  /** Esquema JSON del objeto de entrada (draft 2020-12, sin `$schema`). */
  inputSchema: Record<string, unknown>;
  /** Solo lee: el bucle puede ejecutar varias de estas a la vez. */
  readOnly: boolean;
}

export interface AiRequest {
  system: string;
  messages: readonly AiMessage[];
  tools: readonly AiToolSpec[];
  maxTokens: number;
}

export type AiStop = 'end' | 'tool' | 'length' | 'refusal' | 'other';

export interface AiReply {
  text: string;
  toolCalls: AiToolCall[];
  stop: AiStop;
  raw?: AiRaw;
  /** El modelo que contestó de verdad (puede no ser el pedido, si el proveedor usó uno de respaldo). */
  model?: string;
  usage?: { input: number; output: number };
}

/** El texto de unas partes, sin las imágenes. */
export const textOfParts = (parts: readonly AiPart[]): string =>
  parts
    .filter((p): p is AiTextPart => p.type === 'text')
    .map((p) => p.text)
    .join('\n');
