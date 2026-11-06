# Agendas, plantillas de página y temas con un modelo de lenguaje

*[Read in English](llm-templates.md)*

Una agenda de Heritage Studio es un archivo JSON (`.agenda.json`). Todo lo que se ve y se imprime
sale de ahí: el calendario, las secciones y su orden, el tema (letras, colores, líneas y
ornamentos), las páginas y los elementos propios. Un modelo de lenguaje puede escribir y cambiar
ese archivo por vos. Por ejemplo, le podés pedir "una agenda docente de marzo a diciembre con una
página semanal por curso" o "un tema con firuletes art nouveau".

Hay dos maneras de trabajar con un modelo:

- **Con el servidor MCP (recomendada).** El modelo tiene herramientas para crear la agenda,
  cambiarla, revisarla, *ver* sus páginas como imágenes y exportar el PDF o el tema. Funciona con
  Claude Desktop, Claude Code y cualquier otro cliente MCP.
- **Con cualquier chat.** Le pasás el esquema JSON y el catálogo, le pedís el archivo y lo revisás
  con `npm run -s agenda -- check`.

## 1. El servidor MCP

**Lo más fácil: la aplicación de escritorio.** Los instaladores ya llevan el servidor, sin nada más
que instalar: el cliente inicia la aplicación con `--mcp` y no se abre ninguna ventana. La
configuración de cada sistema está en la [guía de la aplicación de escritorio](desktop.md#6-use-it-with-an-ai-model-from-outside-mcp)
(en inglés). El resto de esta sección es para correrlo desde una copia del repositorio.

Hace falta una copia de este repositorio con sus dependencias instaladas (`npm ci`). El servidor
corre en tu computadora y solo lee y escribe archivos dentro de su **carpeta de trabajo**. Se
elige con `AGENDA_MCP_ROOT`, por ejemplo una carpeta `~/Agendas`. Sin esa variable, es la carpeta
desde donde se lanza. El primer arranque genera los datos de feriados, que tarda alrededor de un
minuto.

**Claude Code:**

```bash
claude mcp add agenda --env AGENDA_MCP_ROOT="$HOME/Agendas" -- npm run -s --prefix /ruta/a/agenda-heritage-generator mcp
```

**Claude Desktop** (`claude_desktop_config.json`, en *Configuración → Desarrollador*):

```json
{
  "mcpServers": {
    "agenda": {
      "command": "npm",
      "args": ["run", "-s", "--prefix", "/ruta/a/agenda-heritage-generator", "mcp"],
      "env": { "AGENDA_MCP_ROOT": "/Users/yo/Agendas" }
    }
  }
}
```

En Windows usá `"command": "npm.cmd"` y rutas como `C:\\Users\\yo\\Agendas`. El `-s` importa:
evita que npm escriba en el canal que usan el cliente y el servidor.

### Herramientas

| Herramienta | Qué hace |
| --- | --- |
| `create_design` | Agenda nueva desde una plantilla (`heritage`, `heritage-norma` (con dedicatoria), `clara` (letra grande), `minimal`) para un año, idioma, país y nombre. Con `out` escribe el archivo; con `app: true` la abre en la aplicación de escritorio. |
| `update_design` | Cambia un archivo (`path`) o la agenda abierta en la aplicación de escritorio (`app: true`) con operaciones [JSON Patch](https://datatracker.ietf.org/doc/html/rfc6902) (`add`, `remove`, `replace`, `move`, `copy`, `test`). Todo o nada; si el resultado no abriría, no se cambia nada. |
| `check_design` | Lista lo que el programa ignoraría o corregiría en el archivo (claves desconocidas, colores no válidos, valores fuera de la lista o del rango) y resume la agenda armada: páginas, hojas, cuadernillos, enlaces y avisos (textos que no entran, imágenes que faltan, enlaces rotos) con sus páginas. |
| `list_pages` | Las páginas, con su número, clave, tipo y título (se puede filtrar por tipo). |
| `render_page` | Dibuja una página tal como se imprime y la devuelve como imagen PNG, con su lado (derecha o izquierda), su zona de contenido, sus bloques (id, nombre y caja en mm) y sus avisos. |
| `export_pdf` | Escribe un PDF: `pages` (para tableta, con enlaces y marcadores), `imposed` (pliegos para imprimir doble faz y doblar en cuadernillos), `fronts`/`backs`, `signature`, `calibration`, `sewing`, `cover`, `separate`. |
| `export_theme` | Guarda el estilo de la agenda como archivo de tema `.tema.json` (letras, colores, líneas, ornamentos y sus imágenes) para importarlo en la aplicación. |
| `list_catalogue` | Tipos de sección con sus opciones y valores posibles, temas, plantillas, fuentes integradas, ornamentos, usos y dibujos de línea, armonías de color, tipos de elemento, tipos de página y variables de texto. |
| `get_schema` | El esquema JSON, entero o por partes (`"theme.tokens.lines"`, `"sections"`, `"customBlocks"`…). |
| `app_status` | Si la aplicación de escritorio está abierta y qué agenda tiene: nombre, año, páginas y revisión. Nunca da error si está cerrada. |
| `app_reveal` | Lleva la aplicación a una página (y, con `blockId`, elige ese elemento), para que la persona vea de qué hablás. |
| `app_library` / `app_open` | Las agendas guardadas en la aplicación, y abrir una de ellas. |

Los recursos `agenda://guide/es` (esta guía), `agenda://guide` (en inglés), `agenda://schema` y
`agenda://catalogue` dan la misma referencia a los clientes que leen recursos.

### Una buena forma de trabajar

1. `create_design` desde la plantilla más parecida, con `out`.
2. Cambios chicos con `update_design`, una idea por vez.
3. Leé `warnings` en cada respuesta de `update_design`: son los problemas de maquetación que produjo ese cambio (textos que no entran, elementos fuera de la página o superpuestos, con su página). Corregilos antes de seguir. Después, `check_design` hasta que `issues` quede vacío y no haya avisos.
4. `render_page` de las páginas que tocaste (la primera semana, una página del mes, la portada),
   y mirarlas.
5. `export_pdf` con `pages` para leerla en una tableta, o `imposed` para imprimirla.

### Trabajar sobre la agenda abierta en la aplicación de escritorio

Con la aplicación de escritorio abierta (ver [Usarla con un modelo de IA](desktop.md#6-use-it-with-an-ai-model-from-outside-mcp)), cada herramienta que recibe `path` o `design` recibe también **`app: true`**: la agenda abierta ahora. `app_status` dice qué hay abierto.

- `update_design` con `app: true` lee la agenda con su **revisión**, aplica y revisa tu parche, y le manda a la aplicación solo el parche con esa revisión. La persona ve el cambio al instante y lo puede deshacer (es un solo paso). Si ella editó la agenda mientras tanto, la aplicación lo rechaza con un conflicto: volvé a leerla (`check_design` con `app: true`) y reintentá.
- `render_page` y `check_design` con `app: true` usan la agenda abierta, con sus imágenes.
- La persona puede apagar el enlace en **Archivo → Permitir que un modelo de IA edite la agenda abierta**; entonces cada llamada falla con ese motivo. No se escribe nada en el disco: la aplicación guarda sus agendas como siempre.
- Los ids de los elementos salen de `render_page`; `app_reveal` con `page` y `blockId` elige uno en la aplicación.

## 2. Sin MCP: esquema, catálogo y revisión

```bash
npm run -s agenda -- schema --out agenda.schema.json   # esquema JSON (draft 2020-12)
npm run -s agenda -- catalog --out catalogo.json       # qué significa cada nombre y opción
npm run agenda -- new --template heritage --year 2027 --locale es-AR --out mi.agenda.json
npm run -s agenda -- check mi.agenda.json              # problemas y resumen (--json, --strict)
npm run pdf -- mi.agenda.json --mode pages --out mi.pdf
```

Pasale al modelo el esquema y el catálogo junto con tu pedido, y pedile que responda con el
archivo entero o con un JSON Patch. Si agregás `"$schema": "./agenda.schema.json"` al principio
de un archivo, editores como VS Code autocompletan y marcan los errores mientras escribís.

`check` nunca cambia el archivo. Sale con código 1 si el archivo no abre; con `--strict`, también
si algo se ignoraría o corregiría.

## 3. El archivo en resumen

Todo campo tiene valor por defecto: alcanza con escribir lo que cambia. Las medidas van en
**milímetros**, los tamaños de letra en **puntos** y los colores como `#rrggbb`.

| Clave | Qué guarda |
| --- | --- |
| `name`, `locale` | Nombre de la agenda; idioma y país (`es-AR`, `en-US`, `pt-BR`, `it-IT`…), que también fijan el orden de las fechas y el primer día de la semana. |
| `calendar` | `year`, `startMonth`, `monthCount`, `weekStart` (`auto` sigue al país), `numbering`, `dateFormat` (`auto`, `dmy`, `mdy`, `ymd`), `hiddenMonths` (lista `AAAA-MM` de meses que quedan fuera del libro: sin páginas ni enlaces; el calendario anual los sigue mostrando). |
| `holidays` | `country` (código ISO o `null`) y los tipos de feriado que se muestran; `personalDates` guarda cumpleaños y aniversarios. |
| `paper`, `binding` | Tamaño de hoja y cómo se dobla y encuaderna (cuadernillos, doble faz, corrimiento, marcas). `binding.target` es `print` (por defecto) o `screen`: una agenda para **leer en pantalla** no lleva margen de costura, recortes, marcas ni páginas de relleno de cuadernillos, conserva el tamaño de página y solo vale el PDF `pages` (los PDF de imprenta se rechazan). |
| `theme` | `id` del tema base, `comfort` (`compact`, `normal`, `wide`) y `tokens` (ver la sección 6). |
| `persona` | Nombre, título, dedicatoria y una frase por mes. |
| `sections` | Las páginas de la agenda, en orden (ver la sección 4). |
| `pageTemplates` | Páginas que se diseñan una vez y se repiten (ver la sección 5). |
| `customPages` | Páginas sueltas: una imagen, una página de un PDF, un texto o un fondo para escribir. |
| `customBlocks` | Elementos propios en un tipo de página o en una página: `text`, `image`, `lines`, `dots`, `grid`, `rect`, `line` y los compuestos `table` (`rows`, `cols`, `header`, `headers`), `checklist` (`items`, `columns`, `shape`, `labels`), `habits` (`rows`, `days`, `names`), `finance` (`lines`, `total`, `title`), `minical` (`month`: `auto` o `AAAA-MM`; sus días llevan a su página), `quadrants` (`titles`, `style`), `notes` (`title`, `style`, `frame`), `timeline` (`from`, `to`, `step` en minutos), `rating` (`count`, `shape`, `text`) `shape` (`shape`: `rect`, `ellipse`, `line`, `arrow`, `triangle`, `diamond`, `polygon` con `sides` de 3 a 24, `star` con `points` de 3 a 24 e `inner`, `heart`, `ring`, `arc`, `bubble`, `banner`, `cross`, o `path` con un `d` de SVG dibujado en una caja de 0 a 100; además `fill`, `strokeColor`, `strokePt`, `dash`, `opacity` y los parámetros propios de cada forma, que lista `shapes` en el catálogo; el trazo queda dentro de la caja) y `qr` (`text`: una dirección web, `mailto:`, `tel:` o cualquier texto; `ecc`: `L`, `M`, `Q` o `H`; `color`; `link: false` para que no sea tocable en el PDF; se dibuja como el cuadrado más grande que entra en la caja); los compuestos también aceptan `paper: true` (fondo blanco). Un texto se dibuja a su `props.size` (puntos) salvo que `props.fit` no sea `false`: entonces se achica hasta entrar en la caja; `props.autoHeight: true` toma su alto de sus renglones (`h` no se usa). El tipo `drawing` se crea copiando un elemento del programa en la aplicación: no se escribe a mano. Dejá cada caja dentro de la página: `check_design` avisa las que no lo están. |
| `watermarks` | Imágenes en muchas páginas (dónde, tamaño, opacidad, espejadas en las páginas izquierdas). |
| `overrides` | Mueve, escala, gira u oculta un bloque del programa en un tipo de página o en una página. `dw` y `dh` (mm) cambian el ancho y el alto de su caja y el contenido se vuelve a acomodar adentro (el texto reparte sus renglones, las áreas de escritura suman o quitan renglones). `scale` y `scaleY` lo escalan (un `scaleY` distinto lo deforma); con `deform: true` la caja no se reacomoda: el dibujo se estira. `layer` fija su orden de apilado (mayor, más arriba), `label` lo renombra y `blend` es `normal`, `multiply`, `screen`, `darken` o `lighten`. |
| `blockStyles` | Estilo propio de un bloque del programa: `lines` (por uso: `writing`, `separator`, `table`, `frame`, `other`) con `pattern`, `color`, `widthPt`; `fill.color` (`null`: sin relleno); `text.color` y `text.roles`. La entrada de la página gana a la del tipo, campo por campo. |
| `pageStyles` | Ajustes del tema solo para un tipo de página o una página. |
| `links` | Enlaces y marcadores del PDF para tabletas y lectores de tinta electrónica. En `links.blocks`, `area` elige una zona tocable de un bloque (`date:2027-01-05`, `month:2027-03`, `toc`…); vacía, vale para todo el bloque. |
| Íconos | En cualquier lugar que lleva una imagen (el `assetId` de un elemento `image`, una marca de agua, la portada del mes, un ornamento con `asset:`) se puede escribir `icon:<id>` (como `icon:trophy`; la lista es `icons` en el catálogo) sin declararlo en `assets`. Un elemento `image` y una marca de agua aceptan `color` para teñir un dibujo vectorial. |
| `assets` | Imágenes y PDF, como ruta integrada (`builtin`: `watermarks/colibri.svg`), datos en base64 (`data`) o un archivo junto a la agenda (`path`: relativo a la carpeta del `.agenda.json`, como `imagenes/logo.png`, nunca con `..`). Para que el JSON no se infle, preferí `path` y dejá la imagen junto al archivo: la leen la línea de comandos, el servidor MCP y la aplicación de escritorio (al abrir el archivo); la aplicación web pide incrustarla. |

**Tipos y claves de página.** Cada página tiene un *tipo* (`weekLeft`, `monthLog`, `notes`…,
listados como `pageTypes` en el catálogo) y una *clave* única. `list_pages` y `render_page`
muestran las dos. Un ajuste con `pageType` vale para todas las páginas de ese tipo; con `pageKey`,
solo para esa página.

## 4. Secciones

`sections` es la lista de páginas en orden. Cada elemento tiene `id`, `type`, `enabled` y
`options`; las opciones de cada tipo y sus valores posibles están en el catálogo. El tipo `months`
es un contenedor: lo que va en su `items` se repite para cada mes, en orden. Un elemento dentro de
`months` puede repetirse más seguido con `"repeat": "week"` (después de cada semana) o
`"repeat": "day"` (una copia por día).

```json
{ "op": "add", "path": "/sections/0/items/-", "value": { "id": "gratitud", "type": "notes", "options": { "count": 1, "style": "lines" }, "repeat": "week" } }
```

El `0` representa la posición de `months` dentro de `sections`: buscala primero, no siempre es la
primera.

## 5. Plantillas de página

Una plantilla es una página que se diseña una vez y se repite donde está en la lista. Puede ser
una sola vez, o cada mes, semana o día dentro de `months`. Su encabezado muestra el título de la
plantilla y, en las copias con fecha, el día, la semana o el mes. Sus elementos propios son
`customBlocks` con `"pageType": "tpl:<id de la plantilla>"`. Los textos pueden usar variables que
cambian en cada copia: `{date}`, `{weekday}`, `{day}`, `{week}`, `{month}`, `{year}`, `{name}`,
`{page}`.

Esta página diaria tiene tres prioridades en renglones y una grilla de puntos para notas. Se
repite cada día, lo que suma unas 365 páginas.

```json
[
  { "op": "add", "path": "/pageTemplates/-", "value": { "id": "diario", "title": "Registro del día", "content": { "kind": "template", "background": "blank" } } },
  { "op": "add", "path": "/sections/0/items/-", "value": { "id": "diario-paginas", "type": "pageTemplate", "options": { "template": "diario" }, "repeat": "day" } },
  { "op": "add", "path": "/customBlocks/-", "value": { "id": "tres-titulo", "pageType": "tpl:diario", "kind": "text", "x": 17, "y": 32, "w": 116.5, "h": 7, "props": { "text": "Tres cosas para el {weekday}", "role": "heading", "size": 10 } } },
  { "op": "add", "path": "/customBlocks/-", "value": { "id": "tres-renglones", "pageType": "tpl:diario", "kind": "lines", "x": 17, "y": 40, "w": 116.5, "h": 24, "props": { "pitch": 8 } } },
  { "op": "add", "path": "/customBlocks/-", "value": { "id": "notas-puntos", "pageType": "tpl:diario", "kind": "dots", "x": 17, "y": 72, "w": 116.5, "h": 118 } }
]
```

Las cajas van en mm desde la esquina superior izquierda de una página *derecha*. Con
`"mirror": true` (el valor por defecto) se espejan en las páginas izquierdas, así un elemento
cerca del borde exterior sigue cerca del borde exterior. Para alinear con la página, usá la caja
`content` que da `render_page` en una página derecha. En una página A5 del tema Heritage es
`[17, 15, 116.5, 180]`: el margen del lomo es más ancho. Las propiedades de cada tipo de elemento
están en el esquema (`get_schema` con la parte `customBlocks`).

## 6. Temas

`theme.id` elige el tema base (`heritage`, `clara`, `clasica`, `minimal`, `cuaderno`,
`filigrana`). `theme.tokens` cambia cualquier parte:

- `fonts`: una letra por tipo de texto (`display`, `title`, `heading`, `label`, `labelStrong`,
  `body`, `number`, `quote`), como `{ "family", "weight", "style" }`. Las familias integradas
  están en `fonts` del catálogo.
- `colors`: `ink`, `soft`, `rule`, `ruleSoft`, `weekend`, `accent`, y `roles` con un color por
  tipo de texto. `palette` (`{ "base": "#2f5d50", "harmony": "analogous" }`) guarda el color del
  que se derivó la paleta. En la aplicación, el editor de paleta deriva todos esos colores en el
  espacio de color OKLCH, con buen contraste para el texto.
- `lines`: un estilo por uso. Los usos son `writing` (renglones), `separator` (rayas bajo los
  títulos), `table` (grillas y columnas) y `frame` (recuadros). Cada estilo tiene:
  - `pattern`: `solid`, `dashed`, `dotted`, `double`, `repeat` (un ornamento repetido a lo
    largo) o `center` (un ornamento al medio);
  - `ornament`: `builtin:<id>` o `asset:<id de una imagen>`;
  - `size` en mm;
  - `corner`: un ornamento para las esquinas de los recuadros;
  - `color`.
- `sizes`, `strokes`, `margins`, `writing` (`style` y `pitch` del área de escritura), `dots`,
  `tracking`, `weekendShading`, `minTextPt`.

```json
{ "op": "add", "path": "/theme/tokens", "value": {
  "fonts": { "title": { "family": "EB Garamond", "weight": 600, "style": "italic" } },
  "colors": { "ink": "#2b2a33", "roles": { "title": "#5b3a6e" } },
  "lines": {
    "separator": { "pattern": "center", "ornament": "builtin:fleuron", "size": 4 },
    "frame": { "pattern": "double", "corner": "builtin:curl", "size": 5 }
  }
} }
```

`export_theme` convierte el estilo en un archivo `.tema.json`. En la aplicación, *Importar tema…*
del panel Estilo lo suma a tus temas, para usarlo en otras agendas.

## 7. Consejos para buenos resultados

- Empezá desde una plantilla y cambiá de a poco. Cada cambio se valida con el mismo validador que
  usa la aplicación.
- Letra de 7 pt o más y renglones de 6 mm o más (8 mm para letra grande). Mejor tinta oscura
  sobre papel: la mayoría de las agendas se imprime en láser monocromo.
- Después de cada cambio, mirá una página izquierda y una derecha: los elementos se espejan en las
  izquierdas.
- Si algo no entra, `check_design` dice en qué página y en qué bloque; `render_page` lo muestra.

## 8. Seguridad

El servidor solo lee archivos `.json` y solo escribe `.agenda.json`, `.tema.json` y `.pdf`, siempre
dentro de su carpeta de trabajo y nunca a través de enlaces simbólicos. No reemplaza una agenda
o un tema que ya existen salvo que se lo pidas. Las imágenes de una agenda solo pueden ser rutas
integradas o datos dentro del archivo. Los valores que llegan de un archivo se validan y se
mantienen dentro de su rango antes de llegar a la vista previa o al PDF.
