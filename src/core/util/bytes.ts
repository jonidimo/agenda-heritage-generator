/** Un tamaño de archivo para leer: «850 KB», «1.2 MB» (sin idioma: la unidad es la misma en todos). */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0 KB';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  const mb = n / (1024 * 1024);
  return `${mb >= 100 ? Math.round(mb) : Math.round(mb * 10) / 10} MB`;
}
