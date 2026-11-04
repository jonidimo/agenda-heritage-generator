/** Nombre de archivo a partir del nombre de una agenda o un tema: sin tildes ni símbolos («Mi agenda 2027» → «mi-agenda-2027»). */
export function fileBase(item: { name: string }): string {
  const base = item.name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return base || 'agenda';
}
