/** JPEG de prueba: un degradé con una esquina marcada, y la orientación EXIF que se quiera. */
import { encode } from 'jpeg-js';

/** `w`×`h` píxeles: rojo crece hacia la derecha, verde hacia abajo; la esquina superior izquierda es azul puro. */
export function makeJpeg(w: number, h: number, quality = 90): Uint8Array {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const corner = x < Math.max(2, w / 8) && y < Math.max(2, h / 8);
      data[o] = corner ? 0 : Math.round((x / w) * 255);
      data[o + 1] = corner ? 0 : Math.round((y / h) * 255);
      data[o + 2] = corner ? 255 : 40;
      data[o + 3] = 255;
    }
  }
  return new Uint8Array(encode({ data, width: w, height: h }, quality).data);
}

/** Le agrega un segmento EXIF con esta orientación (1 a 8) justo después de la cabecera. */
export function withOrientation(jpeg: Uint8Array, orientation: number): Uint8Array {
  const tiff = [0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0, 0, 0, 0, 0];
  const body = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const len = body.length + 2;
  const segment = [0xff, 0xe1, len >> 8, len & 255, ...body];
  // Sin el segmento JFIF que jpeg-js escribe primero, el EXIF queda donde lo busca el lector.
  const out = new Uint8Array(jpeg.length + segment.length);
  out.set(jpeg.subarray(0, 2), 0);
  out.set(segment, 2);
  out.set(jpeg.subarray(2), 2 + segment.length);
  return out;
}
