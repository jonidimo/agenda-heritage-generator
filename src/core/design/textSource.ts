/**
 * Editar un texto en su lugar: leer y escribir la propiedad del diseño de la que sale (ver
 * `TextSource`). Funciones puras sobre un diseño (o un borrador de immer): las usa el editor para
 * la vista previa mientras se escribe y para confirmar, y las pruebas.
 *
 * El valor es el crudo, tal como se guarda: con variables como `{year}` o `{name}`, sin mayúsculas
 * ni sustituciones. Un texto fijo del programa que se deja igual al original no se guarda: así
 * seguir el idioma de la agenda no se pierde por haber abierto el editor.
 */
import type { AgendaStrings } from '../i18n';
import type { TextSource } from '../layout/prims';
import { getAtPath } from '../util/path';
import type { Design } from './schema';

/** Ruta de un texto fijo en las cadenas del idioma (`pages.sleep.title` → `['pages', 'sleep', 'title']`). */
const pathOf = (path: string): string[] => path.split('.');

/** Las doce frases con las que se guarda la lista cuando se cambia una. */
const PHRASES = 12;

/** El valor original (el del idioma) de un texto fijo del programa. */
function defaultLabel(base: AgendaStrings, path: string): string {
  const v = getAtPath(base, pathOf(path));
  return typeof v === 'string' ? v : '';
}

/** Las frases que rigen: las propias si están las doce, si no las del idioma. */
function phrasesOf(design: Pick<Design, 'persona'>, base: AgendaStrings): readonly string[] {
  return design.persona.phrases.length >= PHRASES ? design.persona.phrases : base.phrases;
}

/**
 * El texto tal como se edita. `base` son las cadenas del idioma de la agenda sin los rótulos propios
 * (`resolveStrings(locale)`).
 */
export function readTextSource(design: Design, source: TextSource, base: AgendaStrings): string {
  switch (source.kind) {
    case 'custom':
      return String(design.customBlocks.find((c) => c.id === source.id)?.props.text ?? '');
    case 'persona':
      // El título de la portada vacío es «el del idioma».
      return source.field === 'title' ? design.persona.title || base.titlePage.title : design.persona[source.field];
    case 'phrase':
      return phrasesOf(design, base)[source.index] ?? '';
    case 'label':
      return design.persona.labels[source.path] ?? defaultLabel(base, source.path);
    case 'page': {
      const page = design.customPages.find((p) => p.id === source.id);
      return page ? (source.field === 'title' ? page.title : page.content.text) : '';
    }
    case 'template': {
      const tpl = design.pageTemplates.find((p) => p.id === source.id);
      return tpl ? (source.field === 'title' ? tpl.title : tpl.content.text) : '';
    }
  }
}

/** Escribe `value` en el diseño (o su borrador). Si la propiedad ya no existe, no hace nada. */
export function writeTextSource(design: Design, source: TextSource, value: string, base: AgendaStrings): void {
  switch (source.kind) {
    case 'custom': {
      const cb = design.customBlocks.find((c) => c.id === source.id);
      if (cb) cb.props = { ...cb.props, text: value };
      return;
    }
    case 'persona':
      design.persona[source.field] = source.field === 'title' && value === base.titlePage.title ? '' : value;
      return;
    case 'phrase': {
      // Se guardan las doce juntas: una lista a medias no se usa (ver `phrasesOf`).
      const all = design.persona.phrases.length >= PHRASES ? [...design.persona.phrases] : [...base.phrases];
      all[source.index] = value;
      design.persona.phrases = all;
      return;
    }
    case 'label': {
      if (value === defaultLabel(base, source.path)) delete design.persona.labels[source.path];
      else design.persona.labels[source.path] = value;
      return;
    }
    case 'page': {
      const page = design.customPages.find((p) => p.id === source.id);
      if (!page) return;
      if (source.field === 'title') page.title = value;
      else page.content.text = value;
      return;
    }
    case 'template': {
      const tpl = design.pageTemplates.find((p) => p.id === source.id);
      if (!tpl) return;
      if (source.field === 'title') tpl.title = value;
      else tpl.content.text = value;
      return;
    }
  }
}

/** Clave estable del texto (para ligar la vista previa con su confirmación y juntar los pasos de deshacer). */
export function textSourceKey(source: TextSource): string {
  switch (source.kind) {
    case 'custom':
      return `text:custom:${source.id}`;
    case 'persona':
      return `text:persona:${source.field}`;
    case 'phrase':
      return `text:phrase:${source.index}`;
    case 'label':
      return `text:label:${source.path}`;
    case 'page':
    case 'template':
      return `text:${source.kind}:${source.id}:${source.field}`;
  }
}
