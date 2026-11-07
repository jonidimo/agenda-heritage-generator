/** Lo que se usa de Web Crypto (el núcleo no incluye los tipos del navegador). */
interface SubtleLike {
  digest(algorithm: 'SHA-256', data: Uint8Array): Promise<ArrayBuffer>;
}

/**
 * El SHA-256, o `null` si el entorno no lo puede calcular (la aplicación web servida por `http://` desde otra
 * computadora no tiene Web Crypto): quien lo usa para reconocer repetidos sigue sin esa ayuda en lugar de fallar.
 */
export async function trySha256Hex(bytes: Uint8Array): Promise<string | null> {
  try {
    return await sha256Hex(bytes);
  } catch {
    return null;
  }
}

/** SHA-256 de unos bytes, en hexadecimal (Web Crypto: está en los navegadores, en los Workers y en Node). Para reconocer el mismo archivo. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const subtle = (globalThis as { crypto?: { subtle?: SubtleLike } }).crypto?.subtle;
  if (!subtle) throw new Error('Este entorno no tiene Web Crypto para calcular el hash.');
  const digest = await subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
