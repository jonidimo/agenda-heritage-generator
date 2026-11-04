<div align="center">

# Heritage Studio

**Diseñá, previsualizá e imprimí agendas artesanales: cualquier año, idioma y país,
en cuadernillos plegados y cosidos a mano.**

[![English](https://img.shields.io/badge/-English-8a9a7b?style=for-the-badge)](README.md)
[![Español](https://img.shields.io/badge/-Espa%C3%B1ol-2f5d3a?style=for-the-badge)](README.es.md)
[![Português](https://img.shields.io/badge/-Portugu%C3%AAs-8a9a7b?style=for-the-badge)](README.pt.md)
[![Italiano](https://img.shields.io/badge/-Italiano-8a9a7b?style=for-the-badge)](README.it.md)

<img src="docs/images/tapa.jpg" alt="La agenda Heritage 2026, impresa en láser y cosida a mano" width="560">

</div>

Heritage Studio empezó como una sola agenda artesanal para 2026. Hoy es una aplicación
que arma el libro completo para cualquier año: calendario, feriados, registros de hábitos
y páginas de planificación basadas en la ciencia del comportamiento. Ubica las páginas en
hojas listas para una impresora dúplex, listas para plegar, coser y encuadernar.

Funciona entera en el navegador, también sin conexión, en Linux, Windows, macOS y
Android, y como aplicación de escritorio para Windows, macOS y Linux. No se sube nada a
ningún lado.

![Edición de un pliego semanal](docs/images/editor-spread.png)

## Descargar

**[Descargá la última versión](https://github.com/jonidimo/agenda-heritage-generator/releases/latest)** y elegí el archivo de tu sistema en *Assets*:

| Sistema | Archivo |
| --- | --- |
| Windows 10 y 11 | `…-win-x64-setup.exe` (instalador) o `…-win-x64-portable.exe` (sin instalar) |
| macOS 13 o posterior | `…-mac-arm64.dmg` (Apple silicon) o `…-mac-x64.dmg` (Intel) |
| Linux | `…-linux-x86_64.AppImage` (cualquier distribución) o `…-linux-amd64.deb` (Debian, Ubuntu, Mint) |

Los instaladores no están firmados con un certificado pago, así que Windows y macOS avisan
la primera vez que se abren. La [guía de la aplicación de escritorio](docs/desktop.md) (en
inglés) explica cómo abrirlos, dónde se guardan tus agendas y cómo compilar la aplicación.
Para usarla en el navegador, mirá [Cómo usarla](#cómo-usarla).

## Qué hace

### Se ve exactamente como se va a imprimir

- Cuatro vistas que se actualizan mientras editás: **página**, **pliego**, **hoja
  impresa** (como sale de la impresora, frente y dorso) y el **libro entero**.
- La vista previa dibuja los mismos contornos de letras que van al PDF, así que no
  depende de las fuentes instaladas en tu computadora.
- La **verificación previa** encuentra textos que no entran, textos que se pisan, lo que
  sale de la página o cae en el margen que la impresora no imprime, caracteres que le
  faltan a una fuente e imágenes con poca resolución.

### Se edita con el mouse

- Arrastrá, mové de a poco, escalá, rotá, atenuá u ocultá cualquier elemento. El cambio
  se aplica a todas las páginas de ese tipo, espejado en las páginas izquierdas, o a una
  sola página. Imán, guías de márgenes, deshacer y rehacer.
- **Marcas de agua por persona**: el colibrí o tu propio SVG o PNG, anclados al borde
  exterior o interior, con tamaño y opacidad.
- **Páginas propias donde quieras**: una imagen, un SVG vectorial o una página de un PDF
  (que sigue siendo vectorial en el PDF final), o una página de renglones, puntos o
  cuadrícula. El resto del libro se reacomoda solo.
- Textos, imágenes, renglones y marcos propios en cualquier tipo de página.
- Cambiá el tamaño de tus elementos desde cualquier borde o esquina; con Mayús se
  mantienen las proporciones.
- Un elemento de imagen acepta cualquier imagen: elegí una de la agenda o subí un PNG, JPG
  o SVG.
- Cada texto puede tener su propia letra y su propio color, o seguir los de su tipo de
  texto.
- **Clic derecho** (o pulsación larga en el teléfono) sobre cualquier elemento, página o
  miniatura: cambiar la imagen de la marca de agua, ocultar algo en una página o en todas
  las de ese tipo, seleccionar elementos similares, agregar textos o imágenes donde
  hiciste clic.
- **Varios elementos a la vez** con Ctrl o Mayús, o arrastrando un recuadro desde un
  lugar vacío: moverlos juntos, alinearlos, repartirlos con espacios iguales u ordenarlos
  en una cuadrícula que encuentra sus filas y columnas.
- **Renglones, puntos o cuadrícula por tipo de página o por página**: separación de
  renglones, separación horizontal y vertical de puntos, tamaño de punto y grosor.

### Secciones y plantillas de página

- Hacé clic en una sección del panel **Secciones** para ir a su página. Con clic derecho
  la movés, la apagás o cambiás cada cuánto se repite.
- Cualquier sección puede aparecer una vez o **repetirse cada mes, semana o día**.
- **Plantillas de página**: diseñás una página una vez (fondo de renglones, puntos o
  cuadrícula, textos, imágenes, marcos) y la repetís donde quieras. Textos como `{date}`,
  `{weekday}` o `{month}` cambian en cada copia.

### Encontrar cualquier cosa

- **Buscador** (Ctrl+K, `/` o la lupa): encuentra ajustes, secciones, páginas y elementos
  aunque escribas con errores, sin tildes o con otras mayúsculas, y te lleva ahí
  resaltándolo.
- Botones **Atrás y Adelante** en la barra superior para volver a las páginas que
  visitaste, como en el navegador.

### Cualquier año, idioma y país

- Textos impresos en español, inglés, portugués e italiano; la interfaz habla los mismos
  cuatro idiomas y sigue al que se elige al crear la agenda.
- El país fija las convenciones regionales (orden de las fechas, moneda, día en que
  empieza la semana) con los datos de Unicode CLDR que trae el navegador: el inglés en
  Argentina se escribe día/mes. El orden de las fechas y el comienzo de la semana también
  se eligen a mano; las fechas se guardan siempre en ISO 8601.
- Feriados de **207 países** y sus regiones, de 2016 a 2061. Podés agregar feriados
  puente, renombrar o quitar feriados.
- Cumpleaños y fechas importantes, fases lunares, y los equinoccios y solsticios
  calculados para tu zona horaria y hemisferio.
- Semanas ISO, semanas que empiezan el lunes, el domingo o el sábado, de 1 a 24 meses,
  empezando en cualquier mes.

### Pensada para el papel

- 6 temas (Heritage, Clara, Clásica, Mínima, Cuaderno, Filigrana) y 4 plantillas. Un
  tema define todo junto: la letra y el color de cada tipo de texto y el estilo de los
  renglones, separadores, tablas y marcos.
- **Líneas y firuletes**: líneas lisas, de guiones, de puntos o dobles, ornamentos
  repetidos a lo largo de una línea o en su centro, y esquinas para los marcos. Trae diez
  ornamentos y podés importar los tuyos en SVG o PNG.
- **Una paleta a partir de un color**: elegís un color y una armonía (monocromática,
  análoga, complementaria, complementaria dividida o triádica). La aplicación deriva todos
  los colores en el espacio de color OKLCH y mantiene el texto oscuro para que se lea bien
  en papel.
- **Temas propios**: guardás todo el estilo con un nombre, lo usás en otras agendas y lo
  compartís como archivo `.tema.json`, con sus ornamentos adentro.
- Cambiá fuentes, tamaños, grosor y separación de renglones, renglones, puntos o
  cuadrícula, sombreado de fin de semana y un nivel de comodidad para leer sin anteojos.
  Todo se actualiza en vivo.
- 5 familias tipográficas libres incluidas, incrustadas en el PDF como subconjuntos.
  Podés subir tus propias fuentes TTF, OTF, WOFF o WOFF2: la aplicación verifica que
  tengan todos los caracteres que necesita tu idioma.

### Métodos basados en evidencia

- **30 métodos**: semana Alastair, planes «si pasa X, hago Y», WOOP, registro del
  avance, un registro de hábitos que cuenta días hechos en lugar de rachas, revisión
  semanal, tres cosas buenas, diario de sueño, memoria externa y más.
- Cada método cambia las páginas que corresponden y se explica en una **guía impresa**
  con su nivel de evidencia (sólida, moderada, limitada, práctica sin estudios directos o
  discutida) y sus referencias. Ver [el informe de evidencia](docs/evidencia-metodos.md).
- Podés agregar tus propios métodos desde la interfaz, sin programar.

### Cuadernillos que salen bien

- **Cuadernillos cosidos** con la cantidad de hojas por cuadernillo que elijas (todos
  iguales, equilibrados o una lista a medida), un solo cuadernillo, cortar y apilar para
  espiral o discos, o una página por hoja.
- A4 → A5, Legal / Oficio → 177,8 × 215,9 mm (el tamaño más grande que imprime la HP
  LaserJet 4350), Carta, Folio, Oficio 340, A3, A5 o a medida.
- Dúplex por el borde corto o largo, o dúplex manual; corrección del dorso; creep;
  marcas de plegado, corte y colación; número de cuadernillo.
- Hoja de calibración, plantilla de perforado para las estaciones de costura y una tapa
  con el ancho del lomo calculado según la cantidad de hojas.

### Para leer en tableta o lector

- El **PDF de páginas** viene con enlaces tocables, como una agenda digital: cada día de
  los calendarios, del registro del mes y de la vista mensual lleva a su semana (o a su
  página del día), cada mes a su mes, los títulos suben un nivel (semana → mes →
  calendario anual → índice) y el índice lleva a sus páginas. En un lector que siga los
  enlaces del PDF, como un Onyx Boox o una tableta, alcanza con tocar.
- **Marcadores del lector**: el índice lateral del lector tiene las secciones, cada mes y
  sus semanas.
- **Pestañas de todos los meses** en el borde de cada página (opcional): cada una lleva a
  su mes.
- Los enlaces salen de lo que está impreso, así que acompañan cualquier cambio de año,
  papel o secciones. El botón de enlaces de la barra de arriba los muestra sobre la página
  y un clic los sigue; el panel de cada elemento muestra adónde lleva y permite quitarle
  los enlaces o mandarlo a otra página o a una dirección web. El PDF para imprimir no los
  lleva.

### Tus archivos y plantillas

- **Archivo → Guardar** (Ctrl+S) escribe un archivo `.agenda.json` con sus imágenes y
  fuentes adentro. En Chrome, Edge y la aplicación de escritorio, las veces siguientes se
  reescribe el mismo archivo.
- **Guardar como plantilla** conserva el diseño completo para empezar otras agendas: otro
  año, otra persona u otro idioma. Las plantillas se pueden exportar y compartir como
  archivos.
- **Copia de seguridad de todo** guarda todas las agendas y plantillas en un solo
  archivo; al abrirlo se restauran.
- Las agendas también quedan en el navegador, pero solo en ese navegador y en esa
  dirección de la aplicación: los archivos son la copia segura.

### Diseñar con un modelo de inteligencia artificial

- Un **servidor MCP** permite que Claude, o cualquier modelo compatible con MCP, cree una
  agenda, la cambie, la revise, mire sus páginas y exporte el PDF o un tema. Pedile "una
  agenda docente de marzo a diciembre" o "un tema con firuletes art nouveau".
- El formato del archivo tiene un **esquema JSON** y un catálogo que salen del código, y
  `npm run agenda -- check` dice exactamente qué se ignoraría o corregiría. Leé la
  [guía](docs/plantillas-llm.md) ([in English](docs/llm-templates.md)).

### Hecha para durar

- *Duplicar para 2028* lleva un diseño al año siguiente, con sus páginas y ajustes en su
  lugar.
- Los archivos se validan al abrirlos: colores, números y ajustes del tema se revisan,
  así un archivo dañado o manipulado no rompe la aplicación ni ejecuta código.
- El mismo motor funciona en el navegador, en un proceso en segundo plano y en la línea de
  comandos.

## Capturas

| | |
| --- | --- |
| ![La hoja impresa tal como sale de la impresora](docs/images/printed-sheet.png) | ![Las fuentes, los tamaños y los renglones se actualizan en vivo](docs/images/style-panel.png) |
| La hoja impresa, con marcas de plegado y de cuadernillo, junto a los ajustes de impresión. | Estilo: fuentes, tamaños, renglones y comodidad se actualizan en vivo. |
| ![Los métodos y la guía impresa](docs/images/methods-panel.png) | ![El libro entero y los feriados del país](docs/images/book-view.png) |
| Los métodos y la guía que los explica, con evidencia y referencias. | El libro entero y los feriados del país elegido. |

Las capturas muestran la interfaz en inglés; se cambia de idioma con el selector de
arriba a la derecha.

<p align="center"><img src="docs/images/phone.png" alt="El editor en un teléfono Android" width="280"></p>

Páginas reales del PDF: portada (español), guía (inglés), portada de mes (portugués),
registro de hábitos (italiano) y contraseñas (español).

![Páginas del PDF en cuatro idiomas](docs/images/pages-languages.png)

Un pliego semanal de la agenda 2027: los días a la izquierda y la grilla de tareas
Alastair a la derecha.

![Un pliego semanal](docs/images/spread-norma.png)

## Cómo funciona

```mermaid
flowchart LR
  D["Archivo de diseño<br/>.agenda.json"] --> C["Calendario<br/>semanas · feriados · luna"]
  D --> M["Métodos"]
  C --> S["Secciones"]
  M --> S
  S --> P["Plan de páginas<br/>lados · rellenos · páginas propias"]
  P --> L["Diagramación en milímetros<br/>texto conformado con fontkit"]
  L --> V["Vista previa SVG"]
  L --> I["Imposición<br/>cuadernillos · dúplex · creep · marcas"]
  I --> F["PDF<br/>pdfkit + fuentes incrustadas"]
```

1. **Una agenda es un archivo de diseño, no código.** Es un JSON que se valida al abrirlo,
   con el año, el idioma, el país, las secciones y sus opciones, el tema, la persona, las
   marcas de agua, tus páginas e imágenes, y tus ajustes. Los ajustes se guardan como
   desplazamientos asociados a nombres estables como `week:2027-W12:left`, así sobreviven
   a un cambio de año o de papel.
2. **El calendario** arma los meses y las semanas ISO con feriados, fechas personales y
   fases lunares.
3. **Las secciones** (portada, pliego semanal, registro de hábitos, contraseñas…)
   planifican sus páginas y las diagraman en milímetros con funciones de diagramación.
   Las páginas se miden, no se declaran: la agenda agrega páginas de relleno para que los
   pliegos queden enfrentados, las portadas de mes caigan en página derecha y cada
   cuadernillo quede completo.
4. **El texto** se conforma una sola vez con fontkit. La vista previa dibuja esos glifos y
   el PDF escribe los mismos glifos con la fuente incrustada: la pantalla coincide con el
   papel.
5. **La imposición** ubica las páginas en las hojas. En un cuadernillo de *n* hojas, la
   hoja *i* lleva las páginas 4n−2i y 2i+1 al frente y 2i+2 y 4n−2i−1 al dorso.
6. **El PDF** lo escribe pdfkit en segundo plano, así el editor nunca se congela. Las
   páginas de PDF importadas se incrustan como vectores con pdf-lib.

## Cómo usarla

Necesitás [Node.js](https://nodejs.org/) 22.12 o más nuevo.

```bash
git clone https://github.com/jonidimo/agenda-heritage-generator.git
```

```bash
cd agenda-heritage-generator && npm ci
```

```bash
npm run dev
```

Abrí <http://localhost:5173>. La primera vez se generan los datos de feriados, que tarda
alrededor de un minuto.

**Instalarla como aplicación.** En Chrome, Edge o Chromium, en una computadora o en un
teléfono Android, elegí *Instalar* o *Agregar a la pantalla principal*. Desde ahí funciona
sin conexión.

**Aplicación de escritorio.** Mirá [Descargar](#descargar). La
[guía de la aplicación de escritorio](docs/desktop.md) (en inglés) explica cómo instalarla y
cómo compilar los instaladores.

**Publicar tu propia copia.** `npm run build` genera un sitio estático en `dist/`. El flujo
de GitHub Pages incluido lo publica: activalo en *Settings → Pages → Source: GitHub
Actions*.

**Línea de comandos.** Todo lo que se exporta también se puede generar desde una terminal:

```bash
npm run agenda -- new --template heritage --year 2028 --locale es-AR --country AR --out designs/mi-2028.agenda.json
```

```bash
npm run agenda -- info designs/mi-2028.agenda.json
```

```bash
npm run agenda -- check designs/mi-2028.agenda.json
```

```bash
npm run pdf -- designs/mi-2028.agenda.json --mode imposed --out output/mi-2028-imprimir.pdf
```

`check` lista lo que se ignoraría o corregiría en un archivo y los avisos de la agenda
armada. `npm run agenda -- schema` y `npm run agenda -- catalog` muestran el formato del
archivo y todo lo que puede nombrar. `npm run -s mcp` inicia el servidor MCP para modelos
de inteligencia artificial (ver [la guía](docs/plantillas-llm.md)).

## Impresión y encuadernación

Imprimí una vez la hoja de calibración y después el PDF a doble faz; plegá, perforá, cosé
y poné la tapa. La [guía de impresión y encuadernación](docs/impresion.md) explica cada
paso, con los ajustes para Linux (CUPS), Windows y Android ([in English](docs/printing.md)).

## Estructura del proyecto

| Carpeta | Contenido |
| --- | --- |
| `src/core` | El motor, sin dependencias del navegador: calendario, feriados, texto, diagramación, secciones, imposición y salidas SVG y PDF. |
| `src/app` | El editor (React). |
| `src/workers` | La generación del PDF en segundo plano. |
| `src/cli` | La línea de comandos. |
| `src/node` | Lo comparten la línea de comandos, el servidor MCP y las pruebas: lee fuentes, feriados e imágenes del disco y revisa archivos de agenda. |
| `src/mcp` | El servidor MCP para modelos de inteligencia artificial. |
| `electron` | La aplicación de escritorio (Electron). |
| `designs` | Agendas de ejemplo para 2027 en español, inglés, portugués e italiano. |
| `tests`, `e2e` | Pruebas unitarias (Vitest) y del navegador (Playwright). |
| `docs` | Guías y el informe de evidencia. |
| `legacy` | La versión 2026 en Python y sus PDF, como referencia de diseño. |

## Desarrollo

```bash
npm test
```

```bash
npm run test:e2e
```

```bash
npm run typecheck && npm run lint
```

Las pruebas diagraman cada plantilla en varios idiomas, papeles y niveles de comodidad, y
fallan si algún texto no entra, se pisa con otro o sale del área imprimible. Para agregar
un método o una sección, leé [Adding methods and sections](docs/adding-methods.md).

## Créditos

- Fuentes con licencia SIL Open Font License: Cormorant Garamond, Manrope, Atkinson
  Hyperlegible Next, EB Garamond y Caveat (licencias en `public/fonts`).
- Datos de feriados de [date-holidays](https://github.com/commenthol/date-holidays), de
  commenthol, basados en Wikipedia, con licencia
  [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). Revisá el calendario
  oficial de tu país por los feriados puente.
- [Astronomy Engine](https://github.com/cosinekitty/astronomy) (MIT) para las fases
  lunares y las estaciones.
- [PDFKit](https://pdfkit.org/) y [fontkit](https://github.com/foliojs/fontkit) (MIT),
  [pdf-lib](https://github.com/cantoo-scribe/pdf-lib) (MIT), [PDF.js](https://mozilla.github.io/pdf.js/)
  (Apache 2.0), React, Vite, Tailwind CSS, Zustand, Immer, Zod y Lucide.
