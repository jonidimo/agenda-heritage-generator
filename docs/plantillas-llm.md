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
| `create_design` | Agenda nueva desde una plantilla (`heritage`, `heritage-norma` (con dedicatoria), `clara` (letra grande), `minimal`) para un año, idioma, país y nombre, y desde el principio el tamaño de la hoja (`paper`: A4, LETTER, LEGAL…, pantallas de tableta `TABLET_10_3`, `IPAD_11`…, o `CUSTOM` con `width`/`height`), el destino (`purpose`: `print` o `screen`) y la encuadernación (`binding`). Con `out` escribe el archivo; con `app: true` la abre en la aplicación de escritorio. |
| `update_design` | Cambia un archivo (`path`) o la agenda abierta en la aplicación de escritorio (`app: true`) con operaciones [JSON Patch](https://datatracker.ietf.org/doc/html/rfc6902) (`add`, `remove`, `replace`, `move`, `copy`, `test`). Todo o nada; si el resultado no abriría, no se cambia nada. Con `out`, el resultado se escribe en otro archivo y `path` queda como estaba. En todas las herramientas, `path` es siempre el archivo que se lee y `out` el que se escribe. |
| `check_design` | Lista lo que el programa ignoraría o corregiría en el archivo (claves desconocidas, colores no válidos, valores fuera de la lista o del rango) y resume la agenda armada: páginas, hojas, cuadernillos, enlaces, la fuente de cada tipo de texto (si está cargada y si le falta la puntuación) y los avisos con sus páginas. Cada aviso trae `fix`: qué tocar en el JSON para corregirlo (ver la sección 11). |
| `get_guide` | Esta guía (`lang`: `es` o `en`), entera o una sección (`section` busca en los títulos: `"fuentes"`, `"alcance"`, `"avisos"`…). Para los clientes que no leen recursos. |
| `add_font` | Agrega una fuente propia (`.ttf`, `.otf`, `.woff`, `.woff2` de la carpeta de trabajo) a un archivo (`path`, viaja adentro en `userFonts`) o a la aplicación abierta (`app: true`); con `roles`, la pone en esos tipos de texto. Devuelve sus glifos y la puntuación que le falta (ver la sección 7). |
| `list_pages` | Las páginas, con su número, clave, tipo y título (se puede filtrar por tipo). |
| `render_page` | Dibuja una página tal como se imprime y la devuelve como imagen PNG, con su lado (derecha o izquierda), su zona de contenido, sus bloques (id, nombre y caja en mm) y sus avisos. |
| `export_pdf` | Escribe un PDF (`out`) del tipo que dice `kind` (se sigue aceptando `mode`): `pages` (para tableta, con enlaces y marcadores), `imposed` (pliegos para imprimir doble faz y doblar en cuadernillos), `fronts`/`backs`, `signature`, `calibration`, `sewing`, `cover`, `separate`. |
| `export_theme` | Guarda el estilo de la agenda como archivo de tema `.tema.json` (letras, colores, líneas, ornamentos y sus imágenes) para importarlo en la aplicación. |
| `list_catalogue` | Tipos de sección con sus opciones y valores posibles, temas, plantillas, fuentes integradas, ornamentos, usos y dibujos de línea, armonías de color, tipos de elemento, tipos de página y variables de texto. |
| `get_schema` | El esquema JSON, entero o por partes (`"theme.tokens.lines"`, `"sections"`, `"customBlocks"`…). |
| `app_status` | Si la aplicación de escritorio está abierta y qué agenda tiene: nombre, año, páginas y revisión. Nunca da error si está cerrada. |
| `app_reveal` | Lleva la aplicación a una página (y, con `blockId`, elige ese elemento), para que la persona vea de qué hablás. |
| `app_library` / `app_open` | Las agendas guardadas en la aplicación, y abrir una de ellas. |

Los recursos `agenda://guide/es` (esta guía), `agenda://guide` (en inglés), `agenda://schema` y
`agenda://catalogue` dan la misma referencia a los clientes que leen recursos. El servidor también
ofrece tres recetas (*prompts*) para los pedidos más comunes: `nueva-agenda`, `revisar-avisos` y
`traducir`.

Las respuestas de `update_design` y `add_font` traen `warnings` (los avisos que produjo el cambio)
y `fixes`: cómo se corrige cada código que aparece, una sola vez por código.

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
- `render_page`, `check_design` y `update_design` usan también las fuentes propias que la agenda tiene en la aplicación. `add_font` con `app: true` deja una fuente nueva en la aplicación, para todas sus agendas.
- La persona puede apagar el enlace en **Ajustes → Permitir que un modelo de IA edite la agenda abierta**; entonces cada llamada falla con ese motivo. No se escribe nada en el disco: la aplicación guarda sus agendas como siempre.
- Los ids de los elementos salen de `render_page`; `app_reveal` con `page` y `blockId` elige uno en la aplicación.

## 2. Sin MCP: esquema, catálogo y revisión

```bash
npm run -s agenda -- schema --out agenda.schema.json   # esquema JSON (draft 2020-12)
npm run -s agenda -- catalog --out catalogo.json       # qué significa cada nombre y opción
npm run agenda -- new --template heritage --year 2027 --locale es-AR --out mi.agenda.json
npm run -s agenda -- check mi.agenda.json              # problemas y resumen (--json, --strict)
npm run pdf -- mi.agenda.json --kind pages --out mi.pdf
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
| `paper`, `binding` | Tamaño de hoja y cómo se dobla y encuaderna (cuadernillos, doble faz, corrimiento, marcas). `paper.preset` tiene también pantallas de tabletas y lectores (`TABLET_7_8`, `TABLET_10_3`, `TABLET_13_3`, `IPAD_11`, `IPAD_13`), pensadas para `binding.target: "screen"` con `binding.method: "single"` (una página por hoja). `binding.target` es `print` (por defecto) o `screen`: una agenda para **leer en pantalla** no lleva margen de costura, recortes, marcas ni páginas de relleno de cuadernillos, conserva el tamaño de página y solo vale el PDF `pages` (los PDF de imprenta se rechazan). |
| `theme` | `id` del tema base, `comfort` (`compact`, `normal`, `wide`) y `tokens` (ver la sección 6). |
| `persona` | Nombre, título, dedicatoria y una frase por mes. |
| `sections` | Las páginas de la agenda, en orden (ver la sección 4). |
| `pageTemplates` | Páginas que se diseñan una vez y se repiten (ver la sección 5). |
| `customPages` | Páginas sueltas: una imagen, una página de un PDF, un texto o un fondo para escribir. `after` es la clave de cualquier página (de `list_pages`), así que una página puede ir entre dos semanas: `"after": "week:2027-W12:right"`. |
| `customBlocks` | Elementos propios en un tipo de página o en una página: `text`, `image`, `lines`, `dots`, `grid`, `rect`, `line` y los compuestos `table` (`rows`, `cols`, `header`, `headers`), `checklist` (`items`, `columns`, `shape`, `labels`), `habits` (`rows`, `days`, `names`), `finance` (`lines`, `total`, `title`), `minical` (`month`: `auto` o `AAAA-MM`; sus días llevan a su página), `quadrants` (`titles`, `style`), `notes` (`title`, `style`, `frame`), `timeline` (`from`, `to`, `step` en minutos), `rating` (`count`, `shape`, `text`) `shape` (`shape`: `rect`, `ellipse`, `line`, `arrow`, `triangle`, `diamond`, `polygon` con `sides` de 3 a 24, `star` con `points` de 3 a 24 e `inner`, `heart`, `ring`, `arc`, `bubble`, `banner`, `cross`, o `path` con un `d` de SVG dibujado en una caja de 0 a 100; además `fill`, `strokeColor`, `strokePt`, `dash`, `opacity` y los parámetros propios de cada forma, que lista `shapes` en el catálogo; el trazo queda dentro de la caja) y `qr` (`text`: una dirección web, `mailto:`, `tel:` o cualquier texto; `ecc`: `L`, `M`, `Q` o `H`; `color`; `link: false` para que no sea tocable en el PDF; se dibuja como el cuadrado más grande que entra en la caja); los compuestos también aceptan `paper: true` (fondo blanco). Un texto se dibuja a su `props.size` (puntos) salvo que `props.fit` no sea `false`: entonces se achica hasta entrar en la caja; `props.autoHeight: true` toma su alto de sus renglones (`h` no se usa). El tipo `drawing` se crea en la aplicación (copiando un elemento del programa, o con un trazo del pincel de sellos: cada copia es un grupo con una matriz y una `image`, y `tint` tiñe las vectoriales): no se escribe a mano. Dejá cada caja dentro de la página: `check_design` avisa las que no lo están. |
| `watermarks` | Imágenes en muchas páginas (dónde, tamaño, opacidad, espejadas en las páginas izquierdas). |
| `overrides` | Mueve, escala, gira u oculta un bloque del programa en un tipo de página o en una página. `dw` y `dh` (mm) cambian el ancho y el alto de su caja y el contenido se vuelve a acomodar adentro (el texto reparte sus renglones, las áreas de escritura suman o quitan renglones). `scale` y `scaleY` lo escalan (un `scaleY` distinto lo deforma); con `deform: true` la caja no se reacomoda: el dibujo se estira. `layer` fija su orden de apilado (mayor, más arriba), `label` lo renombra, `blend` es `normal`, `multiply`, `screen`, `darken` o `lighten`, y `locked: true` hace que en la aplicación no se pueda mover, cambiar de tamaño ni borrar (se dibuja igual). Los ajustes valen también para los elementos propios (`blockId` `custom.<id>`), por ejemplo `rotation`. |
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

## 7. Fuentes propias

Además de las integradas (`fonts` en el catálogo), una agenda puede usar fuentes propias. Viajan
**dentro del archivo**, en `userFonts`: una lista de `{ "id", "spec": { "family", "weight",
"style" }, "data" }`, con el archivo de la fuente en base64. No hace falta instalar nada en la
computadora: la aplicación, la línea de comandos y el servidor MCP las leen del archivo. Lo más
simple es `add_font`, que lee el `.ttf` u `.otf` de la carpeta de trabajo y la incrusta.

Una fuente propia se usa como cualquier otra, por su familia, peso y estilo: en
`/theme/tokens/fonts/<rol>` o en la fuente de un texto propio (`props.font`).

**Caracteres que una fuente no tiene.** Si a la fuente de un texto le falta un carácter, ese
carácter se dibuja con la primera fuente de `/theme/tokens/fallbacks` que lo tenga (después con
Manrope, que siempre está, y al final con las demás cargadas, por nombre), como hace un navegador,
en pantalla y en el PDF. Solo avisa
(`missingGlyphs`) lo que no tiene ninguna. Una fuente de números o de camiseta suele no tener
coma, punto ni paréntesis: luce mejor en `display` y `number` (el año grande, las cifras), y no en
los tipos de texto con frases (`title`, `heading`, `body`, `label`, `quote`). `add_font` y
`check_design` dicen qué puntuación le falta y de qué fuente sale.

```json
[
  { "op": "add", "path": "/theme/tokens/fonts", "value": {
      "display": { "family": "Mi Dorsal", "weight": 400, "style": "normal" },
      "number": { "family": "Mi Dorsal", "weight": 400, "style": "normal" } } },
  { "op": "add", "path": "/theme/tokens/fallbacks", "value": ["Manrope", "Cormorant Garamond"] }
]
```

Va `add` y no `replace`: en una agenda nueva `/theme/tokens` está vacío, y `replace` falla si la
clave no existe. Si `/theme/tokens/fonts` ya tiene otros tipos de texto, agregá cada uno por
separado (`"path": "/theme/tokens/fonts/display"`) para no borrarlos; `add_font` con `roles` lo hace
solo.

## 8. Alcance de un elemento: pageType y pageKey

Cada elemento propio (`customBlocks`), ajuste (`overrides`), estilo (`blockStyles`,
`pageStyles`) y enlace (`links.blocks`) dice a qué páginas va:

- **`pageType` con `"pageKey": null`** (lo de siempre): **todas** las páginas de ese tipo. Un
  elemento en `weekRight` sale en todas las semanas del año, sin copiarlo.
- **`pageType` y una `pageKey`**: solo esa página (`"pageKey": "week:2027-W12:right"`). Si un
  mismo elemento tiene una entrada para el tipo y otra para la página, en esa página gana la de
  la página.

Las claves y los tipos salen de `list_pages`. En un tipo que cae a ambos lados, la posición se
espeja en las páginas izquierdas (`"mirror": true`, lo de siempre). Los elementos compuestos
(`table`, `checklist`, `habits`, `finance`, `minical`, `quadrants`, `notes`, `timeline`, `rating`,
`qr`) aceptan `"paper": true`: un fondo blanco que tapa lo que la página tiene debajo (puntos,
renglones, cuadrícula).

## 9. Recursos: imágenes, vectores, PDF e íconos

`assets` declara cada archivo con `id`, `name`, `kind` y `mime`:

- `kind: "raster"`: PNG o JPEG. Se avisa si se imprime a menos de 250 ppp (`lowDpi`) y, como
  información, a más de 600 (`overDpi`): con unos 300 ppp al tamaño impreso alcanza, y más solo
  hace pesar el PDF. Una foto de celular no hace falta a 4000 px para una caja de 40 mm.
- `kind: "vector"`: SVG. Se dibuja como vectores en el PDF (nítido a cualquier tamaño) y, en un
  elemento `image` o una marca de agua, `color` lo tiñe de un color.
- `kind: "pdf"`: un PDF; una página propia lo muestra con `"content": { "kind": "artwork",
  "assetId": "…", "pdfPage": 3 }`.

El archivo va como `path` (relativo a la carpeta del `.agenda.json`), `data` (base64) o `builtin`
(los integrados, como `watermarks/colibri.svg`). Los íconos integrados no se declaran: se usan
como `icon:<id>` en cualquier lugar que lleva una imagen.

## 10. Traducir y feriados

- `/locale` (`es-AR`, `en-US`, `pt-BR`, `it-IT`, `de-DE`, `fr-FR`…) fija el idioma de **todo lo
  que la agenda genera**: meses, días, títulos, rótulos y, con `holidays.language` en `auto`, los
  feriados. Para traducir una agenda alcanza con **una** operación:
  `{ "op": "replace", "path": "/locale", "value": "en-US" }`. Los textos escritos a mano (persona,
  elementos propios, rótulos renombrados en `persona.labels`) quedan como están.
- Un feriado con un nombre largo se abrevia con «…» en su casilla (aviso `abbreviated`). Un
  nombre propio más corto va en `/holidays/renamed/AAAA-MM-DD`, con la fecha en que cae ese año
  (un feriado trasladable puede no caer en su día: `check_design` y `render_page` muestran la
  fecha). En Argentina, Güemes cae el 21 de junio de 2027:
  `{ "op": "add", "path": "/holidays/renamed/2027-06-21", "value": "Güemes" }`.
- `holidays.removed` lista fechas que no se muestran; `holidays.added`, feriados propios
  (`{ "date": "2027-03-08", "name": "…" }`).

## 11. Avisos y cómo corregirlos

`check_design` agrupa los avisos por mensaje, con sus páginas y su `fix`. Todos menos
`abbreviated` y `overDpi` (informativos) son problemas.

| Código | Qué pasa | Cómo se corrige |
| --- | --- | --- |
| `textOverflow` | Un texto no entra en su lugar. | Acortalo, agrandá la caja (`w`/`h` o `dw`/`dh`), bajá `props.size` o dejá `props.fit` en `true`. |
| `offPage` | Parte de un elemento queda fuera de la página. | Achicalo o correlo (`x`/`y`/`w`/`h`, o `dx`/`dy`/`dw`/`dh` en `overrides`). |
| `nonPrintable` | Un elemento entra en el borde que la impresora no imprime (`binding.nonPrintable`, mm). | Correlo hacia adentro o achicalo. |
| `clamped` | Un elemento se corrió solo para no salir de la página. | Ajustá su posición para que quede donde lo querés. |
| `overlap` | Dos textos se pisan. | Corré o achicá uno, o acortá el texto. |
| `lowDpi` | Una imagen tiene poca resolución para su tamaño impreso (menos de 250 ppp). | Una imagen más grande (300 ppp o más) o un elemento más chico. |
| `overDpi` | Informativo: una imagen se imprime a más de 600 ppp; no se ve mejor y el PDF pesa más. | Nada obligatorio: una imagen más chica, o exportar con una resolución de imágenes menor. |
| `missingGlyphs` | Ni la fuente ni las de reserva tienen esos caracteres. | Cambiá el texto, la fuente de ese tipo de texto o agregá a `/theme/tokens/fallbacks` una familia que los tenga. |
| `missingAsset` | Falta una imagen o un archivo. | Revisá el `assetId` y su entrada en `assets` (`path`, `data` o `builtin`). |
| `pdfPageRange` | Se pide una página que el PDF no tiene. | Un número entre 1 y la cantidad de páginas del PDF. |
| `brokenLink` | Un enlace lleva a una página que no existe o a una dirección no válida. | Corregí `page` (una clave de `list_pages`) o `url` en `links.blocks`. |
| `qrTooLong` | Demasiado texto para un código QR. | Acortá `props.text` o bajá `props.ecc` a `L`. |
| `invalidPath` | El trazado de una forma no es SVG válido. | Revisá `props.d`. |
| `holidaysMissing` | No hay datos de feriados para ese país. | Revisá `holidays.country` o dejalo en `null`. |
| `holidaysRange` | Los datos de feriados no cubren ese año. | Agregá los que falten en `holidays.added`. |
| `layoutError` | Un elemento no se pudo dibujar. | Revisá sus `props` con `get_schema` (parte `customBlocks`). |
| `abbreviated` | Informativo: un nombre se acortó con «…». | Un nombre más corto en `/holidays/renamed/AAAA-MM-DD` o en `personalDates[].label`. |

Un aviso `resource` dice que un recurso (una imagen por ruta o una fuente de `userFonts`) no se
pudo leer.

## 12. Consejos para buenos resultados

- Empezá desde una plantilla y cambiá de a poco. Cada cambio se valida con el mismo validador que
  usa la aplicación. El esquema JSON se genera de ese validador al correr, así que los dos nunca
  dicen cosas distintas.
- Letra de 7 pt o más y renglones de 6 mm o más (8 mm para letra grande). Mejor tinta oscura
  sobre papel: la mayoría de las agendas se imprime en láser monocromo.
- Después de cada cambio, mirá una página izquierda y una derecha: los elementos se espejan en las
  izquierdas.
- Si algo no entra, `check_design` dice en qué página y en qué bloque; `render_page` lo muestra.

## 13. Seguridad

El servidor solo lee agendas y plantillas (`.json`), las imágenes que una agenda nombra por ruta y
las fuentes que se le piden a `add_font` (`.ttf`, `.otf`, `.woff`, `.woff2`), y solo escribe
`.agenda.json`, `.tema.json` y `.pdf`, siempre dentro de su carpeta de trabajo y nunca a través de
enlaces simbólicos. No reemplaza una agenda o un tema que ya existen salvo que se lo pidas. Las
imágenes de una agenda solo pueden ser rutas integradas, datos dentro del archivo o archivos de
su misma carpeta (nunca de afuera). Los valores que llegan de un archivo se validan y se mantienen
dentro de su rango antes de llegar a la vista previa o al PDF.
