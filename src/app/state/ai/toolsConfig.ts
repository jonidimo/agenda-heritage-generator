/**
 * Los ajustes de las herramientas de internet y carpetas del asistente, en la aplicación de escritorio. Los guarda
 * el proceso principal (claves cifradas por el sistema, que la página nunca vuelve a ver) y se piden por
 * `app://heritage/_sys/tools/*` (ver `electron/lib/starBridge.mjs`).
 */
export const SERVICE_KEY_NAMES = ['PEXELS_API_KEY', 'PIXABAY_API_KEY', 'UNSPLASH_ACCESS_KEY', 'DEVIANTART_CLIENT_ID', 'DEVIANTART_CLIENT_SECRET', 'GOOGLE_FONTS_API_KEY'] as const;
export type ServiceKeyName = (typeof SERVICE_KEY_NAMES)[number];

export interface ToolsStatus {
  enabled: boolean;
  root: string;
  rootIsDefault: boolean;
  folders: string[];
  trustedHosts: string;
  imageHosts: string;
  hasKey: Record<ServiceKeyName, boolean>;
  encryption: { available: boolean; backend: string; weak: boolean };
}

async function send<T>(route: string, method: 'GET' | 'PUT' | 'POST', body?: unknown): Promise<T> {
  const res = await fetch(`/_sys/tools/${route}`, { method, ...(body !== undefined ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } } : {}) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

export const toolsStatus = (): Promise<ToolsStatus> => send('config', 'GET');
export const toolsUpdate = (change: { enabled?: boolean; trustedHosts?: string; imageHosts?: string; keys?: Partial<Record<ServiceKeyName, string | null>> }): Promise<ToolsStatus> => send('config', 'PUT', change);

export type ToolsAction = 'choose-root' | 'reset-root' | 'add-folder' | 'open-root';
export async function toolsAction(action: ToolsAction): Promise<{ status?: ToolsStatus; cancelled?: boolean; ok?: boolean; error?: string }> {
  return send('action', 'POST', { action });
}
export const toolsRemoveFolder = (folder: string): Promise<{ status: ToolsStatus }> => send('action', 'POST', { action: 'remove-folder', folder });
export const toolsOpenProject = (agenda: { id: string; name: string }): Promise<{ ok?: boolean; dir?: string }> => send('action', 'POST', { action: 'open-project', agenda });

/** Prueba un servicio con su clave guardada: `openverse`, `wikimedia`, `pexels`, `pixabay`, `unsplash`, `deviantart` o `fonts`. */
export const toolsCheck = (service: string): Promise<{ ok: boolean; message: string }> => send('check', 'POST', { service });

export interface FolderListing {
  folders: Array<{ alias: string; label: string }>;
  current: string;
  images: Array<{ path: string; size: number; thumb: string | null }>;
  error?: string;
}
export const toolsListFolder = (folder: string, agenda: { id: string; name: string } | null, subfolder?: string): Promise<FolderListing> => send('browse', 'POST', { folder, agenda, ...(subfolder ? { subfolder } : {}) });
export const toolsReadImage = (folder: string, file: string, agenda: { id: string; name: string } | null): Promise<{ name: string; data: string; error?: string }> => send('browse', 'POST', { folder, file, agenda });
