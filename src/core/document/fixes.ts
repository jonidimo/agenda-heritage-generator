/**
 * Cómo se corrige cada aviso desde el JSON de la agenda: lo que lee un modelo de lenguaje (el servidor
 * MCP los manda junto a cada aviso, y la guía los lista) y la línea de comandos. Una entrada por código:
 * la prueba de la guía comprueba que no falte ninguno.
 */
import type { WarningCode } from '../layout/prims';

/** Los avisos que no son de una página: un recurso (imagen, fuente propia) que no se pudo leer. */
export type SummaryCode = WarningCode | 'resource';

export const WARNING_FIXES: Readonly<Record<SummaryCode, string>> = {
  layoutError: 'Un elemento no se pudo dibujar (un dibujo o un valor inválido): el mensaje dice cuál; revisá sus props con get_schema (parte "customBlocks").',
  clamped: 'El elemento se corrió solo para no salir de la página: ajustá su posición (x/y en customBlocks, dx/dy en overrides) para que entre donde lo querés.',
  offPage: 'Parte del elemento queda fuera de la página: achicalo (w/h en customBlocks, dw/dh en overrides) o correlo (x/y, dx/dy). render_page da las cajas en mm.',
  nonPrintable: 'El elemento entra en el borde que la impresora no imprime (binding.nonPrintable, en mm): correlo hacia adentro o achicalo.',
  overlap: 'Dos textos se pisan: corré o achicá uno (x/y/w/h en customBlocks, dx/dy/dw/dh en overrides), o acortá el texto.',
  lowDpi: 'La imagen tiene poca resolución para el tamaño en que se imprime (menos de 250 ppp): usá una más grande (300 ppp o más) o achicá el elemento.',
  overDpi: 'Informativo, no es un problema: la imagen tiene más resolución de la que se imprime (más de 600 ppp) y el PDF pesa más. Al exportar el PDF se puede achicar sin tocar el archivo (export_pdf con imageDpi 300 o 150; en la aplicación, «Imágenes en el PDF»); o usá una imagen más chica.',
  missingGlyphs: 'Ni la fuente ni las de reserva tienen esos caracteres: cambiá el texto, elegí otra fuente para ese tipo de texto (/theme/tokens/fonts/<rol>), o agregá a /theme/tokens/fallbacks una familia que los tenga (una propia, con add_font).',
  textOverflow: 'El texto no entra en su lugar: acortalo, agrandá la caja (w/h o dw/dh), bajá el cuerpo (props.size) o dejá props.fit en true para que se achique solo.',
  missingAsset: 'Falta una imagen o un archivo: revisá el id que se usa (assetId) y su entrada en assets (path relativo a la carpeta del .agenda.json, data en base64 o builtin).',
  pdfPageRange: 'Se pide una página que el PDF importado no tiene: usá un número entre 1 y la cantidad de páginas de ese PDF.',
  holidaysMissing: 'No hay datos de feriados para ese país: revisá holidays.country (código ISO de dos letras, ver list_catalogue) o dejalo en null.',
  holidaysRange: 'Los datos de feriados no cubren ese año: agregá los que falten en holidays.added (fecha AAAA-MM-DD y nombre) o dejá holidays.country en null.',
  abbreviated:
    'Informativo, no es un problema: un nombre se acortó con «…» para entrar. Para darle uno más corto: un feriado en /holidays/renamed/AAAA-MM-DD; una fecha propia, en personalDates[].label.',
  brokenLink: 'Un enlace elegido a mano lleva a una página que ya no existe o a una dirección no válida: corregí page (una clave de list_pages) o url en links.blocks, o borrá esa entrada.',
  qrTooLong: 'Demasiado texto para un código QR: acortá props.text (una dirección corta) o bajá props.ecc a "L".',
  invalidPath: 'El trazado de la forma no es SVG válido: revisá props.d (comandos M, L, H, V, C, S, Q, T, A, Z con sus números).',
  resource: 'Un recurso no se pudo leer (una imagen por ruta o una fuente propia en userFonts): revisá el archivo, la ruta o su base64.',
};

const isSummaryCode = (code: string): code is SummaryCode => Object.hasOwn(WARNING_FIXES, code);

/** Cómo se corrige un aviso, o `undefined` si el código no es uno conocido. */
export function fixFor(code: string): string | undefined {
  return isSummaryCode(code) ? WARNING_FIXES[code] : undefined;
}

/** Cómo se corrige cada código que aparece, una vez por código (para acompañar una lista de avisos sin repetir). */
export function fixesFor(codes: Iterable<string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const code of codes) {
    const fix = fixFor(code);
    if (fix) out[code] = fix;
  }
  return out;
}
