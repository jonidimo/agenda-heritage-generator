/**
 * Analizador XML mínimo (suficiente para SVG): elementos, atributos, texto,
 * comentarios, CDATA, instrucciones de proceso y DOCTYPE. Funciona igual en el
 * navegador, en un Worker y en Node (no depende de DOMParser).
 */

export interface XmlNode {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  text: string;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Un punto de código que se puede escribir en un XML (`&#1;` o `&#x110000;` no valen: quedan como texto). */
function codePointText(n: number, raw: string): string {
  const ok = Number.isInteger(n) && n <= 0x10ffff && (n === 9 || n === 10 || n === 13 || (n >= 0x20 && n < 0xd800) || (n >= 0xe000 && n <= 0x10ffff && n !== 0xfffe && n !== 0xffff));
  return ok ? String.fromCodePoint(n) : raw;
}

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|\w+);/g, (m, e: string) => {
    if (e.startsWith('#x')) return codePointText(parseInt(e.slice(2), 16), m);
    if (e.startsWith('#')) return codePointText(parseInt(e.slice(1), 10), m);
    return ENTITIES[e] ?? m;
  });
}

/** Con `maxDepth`, un documento con elementos anidados más hondo falla (sin eso, cerrar etiquetas que no coinciden recorre toda la pila: cuadrático). */
export function parseXml(src: string, maxDepth = Infinity): XmlNode {
  const root: XmlNode = { name: '#document', attrs: {}, children: [], text: '' };
  const stack: XmlNode[] = [root];
  let i = 0;
  const n = src.length;
  const top = (): XmlNode => stack[stack.length - 1]!;
  while (i < n) {
    const lt = src.indexOf('<', i);
    if (lt < 0) {
      top().text += decodeEntities(src.slice(i));
      break;
    }
    if (lt > i) top().text += decodeEntities(src.slice(i, lt));
    if (src.startsWith('<!--', lt)) {
      const end = src.indexOf('-->', lt + 4);
      i = end < 0 ? n : end + 3;
      continue;
    }
    if (src.startsWith('<![CDATA[', lt)) {
      const end = src.indexOf(']]>', lt + 9);
      top().text += src.slice(lt + 9, end < 0 ? n : end);
      i = end < 0 ? n : end + 3;
      continue;
    }
    if (src.startsWith('<?', lt)) {
      const end = src.indexOf('?>', lt + 2);
      i = end < 0 ? n : end + 2;
      continue;
    }
    if (src.startsWith('<!', lt)) {
      // DOCTYPE (con posible subconjunto interno entre corchetes).
      let depth = 0;
      let j = lt + 2;
      for (; j < n; j++) {
        const c = src[j];
        if (c === '[') depth++;
        else if (c === ']') depth--;
        else if (c === '>' && depth <= 0) break;
      }
      i = j + 1;
      continue;
    }
    if (src[lt + 1] === '/') {
      const end = src.indexOf('>', lt);
      const name = src.slice(lt + 2, end).trim();
      // Cierra hasta el elemento con ese nombre (tolerante a errores).
      for (let k = stack.length - 1; k > 0; k--) {
        if (stack[k]!.name === name) {
          stack.length = k;
          break;
        }
      }
      i = end < 0 ? n : end + 1;
      continue;
    }
    // Etiqueta de apertura.
    let j = lt + 1;
    while (j < n && !/[\s/>]/.test(src[j]!)) j++;
    const name = src.slice(lt + 1, j);
    const attrs: Record<string, string> = {};
    let selfClosing = false;
    while (j < n) {
      while (j < n && /\s/.test(src[j]!)) j++;
      const c = src[j];
      if (c === '>') {
        j++;
        break;
      }
      if (c === '/' && src[j + 1] === '>') {
        selfClosing = true;
        j += 2;
        break;
      }
      let k = j;
      while (k < n && !/[\s=/>]/.test(src[k]!)) k++;
      const attrName = src.slice(j, k);
      j = k;
      while (j < n && /\s/.test(src[j]!)) j++;
      if (src[j] === '=') {
        j++;
        while (j < n && /\s/.test(src[j]!)) j++;
        const q = src[j];
        if (q === '"' || q === "'") {
          const end = src.indexOf(q, j + 1);
          attrs[attrName] = decodeEntities(src.slice(j + 1, end < 0 ? n : end));
          j = end < 0 ? n : end + 1;
        } else {
          let e = j;
          while (e < n && !/[\s>]/.test(src[e]!)) e++;
          attrs[attrName] = decodeEntities(src.slice(j, e));
          j = e;
        }
      } else if (attrName) {
        attrs[attrName] = '';
      } else {
        j++;
      }
    }
    const node: XmlNode = { name, attrs, children: [], text: '' };
    top().children.push(node);
    if (!selfClosing) {
      stack.push(node);
      if (stack.length > maxDepth + 1) throw new Error('El XML tiene elementos anidados a demasiada profundidad.');
    }
    i = j;
  }
  return root;
}

export function findFirst(node: XmlNode, name: string): XmlNode | undefined {
  for (const c of node.children) {
    if (localName(c.name) === name) return c;
    const deep = findFirst(c, name);
    if (deep) return deep;
  }
  return undefined;
}

export function localName(name: string): string {
  const i = name.indexOf(':');
  return i >= 0 ? name.slice(i + 1) : name;
}
