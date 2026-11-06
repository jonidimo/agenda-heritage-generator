# Planners, page templates and themes with an LLM

*[Leer en español](plantillas-llm.md)*

A planner in Heritage Studio is a JSON file (`.agenda.json`). Everything you see and print
comes from it: the calendar, the sections and their order, the theme (fonts, colours, lines and
ornaments), your own pages and elements. A language model can write and edit that file for you.
For example, you can ask it for "a teacher's planner from March to December with a weekly page
per class" or "a theme with Art Nouveau flourishes".

There are two ways to work with a model:

- **With the MCP server (recommended).** The model gets tools to create the planner, change it,
  check it, *see* its pages as images and export the PDF or the theme. It works with Claude
  Desktop, Claude Code and any other MCP client.
- **With any chat model.** Give it the JSON Schema and the catalogue, ask for the file, and check
  it with `npm run -s agenda -- check`.

## 1. The MCP server

**Easiest: the desktop app.** The installers already contain the server, with nothing else to
install: the client starts the app with `--mcp` and no window opens. The configuration for each
system is in the [desktop app guide](desktop.md#6-use-it-with-an-ai-model-from-outside-mcp). The rest of this
section is for running it from a copy of the repository.

You need a copy of this repository with its dependencies installed (`npm ci`). The server runs
on your computer and only reads and writes files inside its **working folder**. Set it with
`AGENDA_MCP_ROOT`, for example a folder `~/Planners`. Without it, the folder is the one the
server is started from. The first start generates the holiday data, which takes about a
minute.

**Claude Code:**

```bash
claude mcp add agenda --env AGENDA_MCP_ROOT="$HOME/Planners" -- npm run -s --prefix /path/to/agenda-heritage-generator mcp
```

**Claude Desktop** (`claude_desktop_config.json`, under *Settings → Developer*):

```json
{
  "mcpServers": {
    "agenda": {
      "command": "npm",
      "args": ["run", "-s", "--prefix", "/path/to/agenda-heritage-generator", "mcp"],
      "env": { "AGENDA_MCP_ROOT": "/Users/me/Planners" }
    }
  }
}
```

On Windows use `"command": "npm.cmd"` and paths such as `C:\\Users\\me\\Planners`. The `-s` flag
matters: it keeps npm from printing anything on the channel the client and the server use.

### Tools

| Tool | What it does |
| --- | --- |
| `create_design` | New planner from a template (`heritage`, `heritage-norma` (with a dedication), `clara` (large print), `minimal`) for a year, language, country and name, and from the start its sheet size (`paper`: A4, LETTER, LEGAL…, tablet screens `TABLET_10_3`, `IPAD_11`…, or `CUSTOM` with `width`/`height`), `purpose` (`print` or `screen`) and `binding`. With `out` it writes the file; with `app: true` it opens it in the desktop app instead. |
| `update_design` | Changes a file (`path`) or the planner open in the desktop app (`app: true`) with [JSON Patch](https://datatracker.ietf.org/doc/html/rfc6902) operations (`add`, `remove`, `replace`, `move`, `copy`, `test`). All or nothing; if the result would not open, nothing is changed. With `out`, the result is written to another file and `path` stays as it was. Across all tools, `path` is always the file that is read and `out` the file that is written. |
| `check_design` | Lists what the program would ignore or correct in the file (unknown keys, invalid colours, values outside the list or range), and summarizes the built planner: pages, sheets, signatures, links and warnings (text that does not fit, missing images, broken links) with their pages. |
| `list_pages` | The pages, with their number, key, type and title (filter by type). |
| `render_page` | Draws one page exactly as it prints and returns it as a PNG image, with its side (right or left), its content area, its blocks (id, name and box in mm) and its warnings. |
| `export_pdf` | Writes a PDF (`out`) of the kind in `kind` (`mode` is still accepted): `pages` (for tablets, with links and bookmarks), `imposed` (sheets to print double-sided and fold into signatures), `fronts`/`backs`, `signature`, `calibration`, `sewing`, `cover`, `separate`. |
| `export_theme` | Saves the planner's style as a `.tema.json` theme file (fonts, colours, lines, ornaments and their images) to import in the app. |
| `list_catalogue` | Section types with their options and allowed values, themes, templates, built-in fonts, ornaments, line uses and patterns, colour harmonies, element kinds, page types and text variables. |
| `get_schema` | The JSON Schema, whole or by part (`"theme.tokens.lines"`, `"sections"`, `"customBlocks"`…). |
| `app_status` | Whether the desktop app is open and which planner it has: name, year, pages and revision. Never an error when it is closed. |
| `app_reveal` | Takes the app to a page (and, with `blockId`, selects that element), so the person sees what you are talking about. |
| `app_library` / `app_open` | The planners saved in the app, and opening one of them. |

The resources `agenda://guide` (this guide), `agenda://schema` and `agenda://catalogue` carry the
same reference for clients that read resources.

### A good working loop

1. `create_design` from the closest template, with `out`.
2. Small `update_design` patches, one idea at a time.
3. Read `warnings` in every `update_design` answer: they are the layout problems that change just produced (text that does not fit, elements off the page or overlapping, with their page). Fix them before going on. `check_design` then, until `issues` is empty and there are no warnings.
4. `render_page` on the pages you touched (the first week, a month page, the cover) and look.
5. `export_pdf` with `pages` to read it on a tablet, or `imposed` to print it.

### Working on the planner that is open in the desktop app

With the desktop app open (see [Use it with an AI model](desktop.md#6-use-it-with-an-ai-model-from-outside-mcp)), every tool that takes `path` or `design` also takes **`app: true`**: the planner open right now. `app_status` tells you what is open.

- `update_design` with `app: true` reads the planner with its **revision**, applies and checks your patch, and sends the app only the patch with that revision. The person sees the change at once and can undo it (it is one step). If they edited the planner meanwhile, the app refuses with a conflict: read it again (`check_design` with `app: true`) and retry.
- `render_page` and `check_design` with `app: true` use the open planner, with its images.
- The person can turn the link off in **File → Let an AI model edit the open planner**; then every call fails with that reason. Nothing is written to disk: the app saves its own planners as always.
- Ids of elements come from `render_page`; `app_reveal` with `page` and `blockId` selects one in the app.

## 2. Without MCP: schema, catalogue and check

```bash
npm run -s agenda -- schema --out agenda.schema.json   # JSON Schema (draft 2020-12)
npm run -s agenda -- catalog --out catalogue.json      # what each name and option means
npm run agenda -- new --template heritage --year 2027 --locale en-US --out my.agenda.json
npm run -s agenda -- check my.agenda.json              # problems and summary (--json, --strict)
npm run pdf -- my.agenda.json --kind pages --out my.pdf
```

Give the schema and the catalogue to the model together with your request, and ask it to answer
with the whole file or with a JSON Patch. Adding `"$schema": "./agenda.schema.json"` at the top
of a file gives you autocompletion and inline errors in editors such as VS Code.

`check` never changes the file. Exit code 1 means the file does not open; with `--strict`, it also
fails when something would be ignored or corrected.

## 3. The file in brief

Every field has a default, so a file only needs what changes. Sizes are in **millimetres**, text
sizes in **points**, colours are `#rrggbb`.

| Key | What it holds |
| --- | --- |
| `name`, `locale` | Planner name; language and country (`es-AR`, `en-US`, `pt-BR`, `it-IT`…), which also set the date order and the first day of the week. |
| `calendar` | `year`, `startMonth`, `monthCount`, `weekStart` (`auto` follows the country), `numbering`, `dateFormat` (`auto`, `dmy`, `mdy`, `ymd`), `hiddenMonths` (`YYYY-MM` list of months left out of the book: no pages and no links; the yearly calendar still shows them). |
| `holidays` | `country` (ISO code or `null`) and the holiday types to show; `personalDates` holds birthdays and anniversaries. |
| `paper`, `binding` | Sheet size and how it is folded and bound (signatures, duplex, creep, marks). `paper.preset` also has tablet and e-reader screens (`TABLET_7_8`, `TABLET_10_3`, `TABLET_13_3`, `IPAD_11`, `IPAD_13`), meant for `binding.target: "screen"` with `binding.method: "single"` (one page per sheet). `binding.target` is `print` (default) or `screen`: a planner to **read on screen** has no binding margin, trims, marks or signature filler pages, keeps the page size, and only the `pages` PDF applies (the print PDFs are refused). |
| `theme` | Base theme `id`, `comfort` (`compact`, `normal`, `wide`) and `tokens` (see section 6). |
| `persona` | Name, title, dedication and one phrase per month. |
| `sections` | The planner's pages, in order (see section 4). |
| `pageTemplates` | Pages you design once and repeat (see section 5). |
| `customPages` | One-off pages: an image, a PDF page, a text or a writing background. `after` is the key of any page (from `list_pages`), so a page can go between two weeks: `"after": "week:2027-W12:right"`. |
| `customBlocks` | Your own elements on a page type or on one page: `text`, `image`, `lines`, `dots`, `grid`, `rect`, `line`, and the composite kinds `table` (`rows`, `cols`, `header`, `headers`), `checklist` (`items`, `columns`, `shape`, `labels`), `habits` (`rows`, `days`, `names`), `finance` (`lines`, `total`, `title`), `minical` (`month`: `auto` or `YYYY-MM`; its days link to their pages), `quadrants` (`titles`, `style`), `notes` (`title`, `style`, `frame`), `timeline` (`from`, `to`, `step` in minutes), `rating` (`count`, `shape`, `text`) `shape` (`shape`: one of `rect`, `ellipse`, `line`, `arrow`, `triangle`, `diamond`, `polygon` with `sides` 3–24, `star` with `points` 3–24 and `inner`, `heart`, `ring`, `arc`, `bubble`, `banner`, `cross`, or `path` with an SVG `d` drawn in a 0–100 box; plus `fill`, `strokeColor`, `strokePt`, `dash`, `opacity` and each shape's own parameters, listed under `shapes` in the catalogue; the stroke stays inside the box) and `qr` (`text`: a web address, `mailto:`, `tel:` or any text; `ecc`: `L`, `M`, `Q` or `H`; `color`; `link: false` to make it not tappable in the PDF; it draws as the largest square that fits the box); composite kinds also take `paper: true` (white background). A text element draws at its `props.size` (points) unless `props.fit` is not `false`, which shrinks it to fit the box; `props.autoHeight: true` takes its height from its lines (`h` is ignored). The `drawing` kind is made in the app (copying a built-in element, or a stroke of the stamp brush: each copy a group with a matrix and an `image`, and `tint` colouring the vector ones): do not write it by hand. Keep every box inside the page: `check_design` reports the ones that are not. |
| `watermarks` | Images on many pages (where, size, opacity, mirrored on left pages). |
| `overrides` | Moves, scales, rotates or hides a built-in block on a page type or one page. `dw` and `dh` (mm) change the width and height of its box and the content is laid out again inside it (text wraps, writing areas gain or lose lines). `scale` and `scaleY` scale it (a different `scaleY` deforms it); with `deform: true` the box is not laid out again: the drawing is stretched. `layer` sets its stacking order (higher is on top), `label` renames it, `blend` is `normal`, `multiply`, `screen`, `darken` or `lighten`, and `locked: true` keeps the person from moving, resizing or deleting it in the app (it is drawn the same). Overrides also apply to your own elements (`blockId` `custom.<id>`), for instance `rotation`. |
| `blockStyles` | Own style for a built-in block: `lines` (per use: `writing`, `separator`, `table`, `frame`, `other`) with `pattern`, `color`, `widthPt`; `fill.color` (`null` for none); `text.color` and `text.roles`. The page entry wins over the page-type entry field by field. |
| `pageStyles` | Theme tokens for one page type or one page only. |
| `links` | Links and bookmarks of the PDF for tablets and e-readers. In `links.blocks`, `area` picks one tappable spot of a block (`date:2027-01-05`, `month:2027-03`, `toc`…); empty means the whole block. |
| Icons | Anywhere an image goes (an `image` element's `assetId`, a watermark, a month cover, an `asset:` ornament) you can write `icon:<id>` (such as `icon:trophy`; the list is `icons` in the catalogue) without declaring it in `assets`. An `image` element and a watermark take `color` to tint a vector drawing. |
| `assets` | Images and PDFs, as built-in paths (`builtin`: `watermarks/colibri.svg`), base64 data (`data`), or a file next to the planner (`path`: relative to the `.agenda.json` folder, such as `images/logo.png`, never with `..`). To keep the JSON small, prefer `path` and leave the image next to the file: the command line, the MCP server and the desktop app (when it opens the file) read it; the web app asks for it to be embedded. |

**Page types and keys.** Every page has a *type* (`weekLeft`, `monthLog`, `notes`… listed as
`pageTypes` in the catalogue) and a unique *key*. `list_pages` and `render_page` show both.
Settings scoped with `pageType` apply to every page of that type. Adding `pageKey` limits them to
one page.

## 4. Sections

`sections` is the list of pages in order. Each item has `id`, `type`, `enabled` and `options`.
Each type's options and their allowed values are in the catalogue. A `months` item is a
container: what goes in its `items` is repeated for every month, in order. An item inside
`months` can repeat more often with `"repeat": "week"` (after each week) or `"repeat": "day"`
(one copy per day).

```json
{ "op": "add", "path": "/sections/0/items/-", "value": { "id": "gratitude", "type": "notes", "options": { "count": 1, "style": "lines" }, "repeat": "week" } }
```

Here `0` stands for the position of the `months` item in `sections`; look it up first, it is not
always the first one.

## 5. Page templates

A page template is a page you design once and repeat where it appears in the list. That can be
once, or every month, week or day inside `months`. Its header shows the template's title and, on
dated copies, the day, week or month. Its own elements are `customBlocks` with
`"pageType": "tpl:<template id>"`. Texts can use variables that change on each copy: `{date}`,
`{weekday}`, `{day}`, `{week}`, `{month}`, `{year}`, `{name}`, `{page}`.

This daily page has three priorities on lines and a dot grid for notes. It is repeated every
day, which adds about 365 pages.

```json
[
  { "op": "add", "path": "/pageTemplates/-", "value": { "id": "daily-log", "title": "Daily log", "content": { "kind": "template", "background": "blank" } } },
  { "op": "add", "path": "/sections/0/items/-", "value": { "id": "daily-log-pages", "type": "pageTemplate", "options": { "template": "daily-log" }, "repeat": "day" } },
  { "op": "add", "path": "/customBlocks/-", "value": { "id": "top3-title", "pageType": "tpl:daily-log", "kind": "text", "x": 17, "y": 32, "w": 116.5, "h": 7, "props": { "text": "Three things for {weekday}", "role": "heading", "size": 10 } } },
  { "op": "add", "path": "/customBlocks/-", "value": { "id": "top3-lines", "pageType": "tpl:daily-log", "kind": "lines", "x": 17, "y": 40, "w": 116.5, "h": 24, "props": { "pitch": 8 } } },
  { "op": "add", "path": "/customBlocks/-", "value": { "id": "notes-dots", "pageType": "tpl:daily-log", "kind": "dots", "x": 17, "y": 72, "w": 116.5, "h": 118 } }
]
```

Boxes are in mm from the top-left corner of a *right-hand* page. With `"mirror": true` (the
default) they are mirrored on left-hand pages, so an element near the outer edge stays near the
outer edge. To align with the page, use the `content` box that `render_page` reports for a
right-hand page. On an A5 page of the Heritage theme it is `[17, 15, 116.5, 180]`: the binding
margin is wider. The props of each element kind are in the schema (`get_schema` with part
`customBlocks`).

## 6. Themes

`theme.id` picks the base theme (`heritage`, `clara`, `clasica`, `minimal`, `cuaderno`,
`filigrana`). `theme.tokens` changes any part of it:

- `fonts`: a font for each text type (`display`, `title`, `heading`, `label`, `labelStrong`,
  `body`, `number`, `quote`), as `{ "family", "weight", "style" }`. The built-in families are
  listed as `fonts` in the catalogue.
- `colors`: `ink`, `soft`, `rule`, `ruleSoft`, `weekend`, `accent`, and `roles` with one colour
  per text type. `palette` (`{ "base": "#2f5d50", "harmony": "analogous" }`) records the colour
  the palette was derived from. In the app, the palette editor derives all of them in the OKLCH
  colour space, with high contrast for text.
- `lines`: one style per use. The uses are `writing` (writing lines), `separator` (rules under
  headings), `table` (grids and columns) and `frame` (boxes). Each style has:
  - `pattern`: `solid`, `dashed`, `dotted`, `double`, `repeat` (an ornament repeated along the
    line) or `center` (an ornament in the middle);
  - `ornament`: `builtin:<id>` or `asset:<image id>`;
  - `size` in mm;
  - `corner`: an ornament for the corners of frames;
  - `color`.
- `sizes`, `strokes`, `margins`, `writing` (`style` and `pitch` of the writing area), `dots`,
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

`export_theme` turns the style into a `.tema.json` file. In the app, *Import theme…* in the Style
panel adds it to your themes so you can use it in other planners.

## 7. Advice for good results

- Start from a template and change little at a time. Every change is checked against the same
  validator the app uses. The JSON Schema is generated from that validator at run time, so the
  two never disagree.
- Keep text at 7 pt or more and writing lines at 6 mm or more (8 mm for large print). Prefer
  dark ink on paper: most planners are printed on monochrome laser printers.
- After each change look at a left page and a right page. Elements are mirrored on left pages.
- If something does not fit, `check_design` names the page and the block; `render_page` shows it.

## 8. Safety

The server only reads `.json` files and only writes `.agenda.json`, `.tema.json` and `.pdf`
files, always inside its working folder, never through symbolic links. It does not overwrite an
existing planner or theme unless asked to. Images in a planner can only be built-in paths or
data embedded in the file. Values that come from a file are validated and kept within range
before they reach the preview or the PDF.
