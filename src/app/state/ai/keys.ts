/**
 * Las claves de API del asistente en el navegador.
 *
 * Por defecto viven solo en memoria: se pierden al cerrar la pestaña. Con «Recordar la clave en este
 * navegador» se guardan cifradas (AES-GCM) en IndexedDB, con una llave que el navegador genera y marca
 * como **no exportable**: el código de la página puede usarla para descifrar, pero no leerla, así que
 * copiar los archivos del navegador a otro equipo no entrega la clave. No protege contra un programa que
 * ya corre dentro de esta página: el diálogo lo dice tal cual.
 *
 * En la aplicación de escritorio las claves no pasan por acá: las guarda el proceso principal, cifradas
 * por el sistema (ver `electron/lib/ai.mjs`).
 */
import type { AiProviderId } from '@core/ai/messages';
import { createStore, del, get, set, type UseStore } from 'idb-keyval';

const memory = new Map<AiProviderId, string>();

let store: UseStore | null = null;
const db = (): UseStore => (store ??= createStore('agenda-studio-ai', 'keys'));

const WRAP_ID = 'wrap-key';
const recordId = (p: AiProviderId): string => `key:${p}`;

interface Sealed {
  iv: Uint8Array<ArrayBuffer>;
  data: ArrayBuffer;
}

/** La llave de cifrado de este navegador (se crea la primera vez; nunca sale de acá). */
async function wrapKey(): Promise<CryptoKey> {
  const saved = await get<CryptoKey>(WRAP_ID, db());
  if (saved) return saved;
  const fresh = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  await set(WRAP_ID, fresh, db());
  return fresh;
}

async function seal(text: string): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await wrapKey(), new TextEncoder().encode(text));
  return { iv, data };
}

async function unseal(s: Sealed): Promise<string> {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: s.iv }, await wrapKey(), s.data);
  return new TextDecoder().decode(plain);
}

export const getKey = (p: AiProviderId): string | null => memory.get(p) ?? null;
export const hasKey = (p: AiProviderId): boolean => memory.has(p);

/** Pone (o con `null`, quita) la clave de un proveedor. Con `remember`, también la guarda cifrada. */
export async function setKey(p: AiProviderId, key: string | null, remember: boolean): Promise<void> {
  const clean = key?.trim() ?? '';
  if (clean) memory.set(p, clean);
  else memory.delete(p);
  try {
    if (clean && remember) await set(recordId(p), await seal(clean), db());
    else await del(recordId(p), db());
  } catch {
    // Sin IndexedDB ni cifrado (modo privado estricto): la clave vale mientras la pestaña siga abierta.
  }
}

/** Deja de recordar todas las claves (las que están en memoria siguen valiendo hasta cerrar). */
export async function forgetAll(providers: readonly AiProviderId[]): Promise<void> {
  for (const p of providers) {
    try {
      await del(recordId(p), db());
    } catch {
      /* nada guardado */
    }
  }
}

/** Al arrancar: carga en memoria las claves recordadas. Una que no se puede descifrar se borra. */
export async function loadRemembered(providers: readonly AiProviderId[]): Promise<void> {
  if (typeof indexedDB === 'undefined' || typeof crypto === 'undefined' || !crypto.subtle) return;
  for (const p of providers) {
    try {
      const sealed = await get<Sealed>(recordId(p), db());
      if (sealed && !memory.has(p)) memory.set(p, await unseal(sealed));
    } catch {
      await del(recordId(p), db()).catch(() => undefined);
    }
  }
}
