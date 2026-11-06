# Adding methods and sections

The planner is built from two kinds of pieces:

- **Methods** describe *why* a page looks the way it does: a planning, habit or
  well-being technique with its evidence level and references. Every enabled method is
  explained in the printed guide at the front of the planner.
- **Sections** produce pages. A section can change its pages when a method is enabled.

Both are plain TypeScript in the DOM-free core (`src/core`), so the editor, the PDF
worker and the command line all see the same thing.

## Add a method without code

Open the **Methods** tab, go to **Your own methods** and press **Add method**. Give it a
name, the text to print, an evidence level and its references. It is saved in the design file and printed
in the guide like any built-in method. This is the right place for personal rules
("No screens after 22:00") or for a technique you want to try before adding it to the
catalog.

## Add a method to the catalog

1. **Check the evidence first.** Read the studies, not summaries. Note authors, year,
   journal and DOI. Pick a level:

   | Level | Meaning |
   | --- | --- |
   | `strong` | Several controlled trials or a meta-analysis agree. |
   | `moderate` | Some controlled trials, or a meta-analysis with mixed results. |
   | `limited` | Small, uncontrolled or indirect studies. |
   | `practice` | Widely used, not studied directly. |
   | `contested` | Studies disagree or failed to replicate. |

   Add a section to [`evidencia-metodos.md`](evidencia-metodos.md) with what you found
   and what you could not verify.

2. **Add an entry** to `METHODS` in `src/core/methods/catalog.ts`:

   ```ts
   {
     id: 'two-minute-rule',
     category: 'focus',
     evidence: 'practice',
     affects: ['weekRight'],
     refs: ['Author, A. (2024). Title of the study. Journal, 12(3), 45–67. doi:10.xxxx/xxxxx'],
     t: {
       es: { name: 'Regla de los dos minutos', text: '…' },
       en: { name: 'Two-minute rule', text: '…' },
       pt: { name: 'Regra dos dois minutos', text: '…' },
       it: { name: 'Regola dei due minuti', text: '…' },
       de: { name: 'Zwei-Minuten-Regel', text: '…' },
       fr: { name: 'Règle des deux minutes', text: '…' },
     },
   },
   ```

   The type requires the six languages. Write the text for the person who will hold the
   planner: short sentences, what to do, and an honest line about the evidence.

3. **Make pages react to it** (optional). In the section that should change, ask the
   layout context:

   ```ts
   if (ctx.has('two-minute-rule')) {
     const box = ctx.textIn(ctx.s.week.twoMinutes, area, { role: 'label', size: 'labelSmall', upper: true, fit: true });
     ctx.add('tasks.twoMinutes', 'Two-minute tasks', box.prims);
   }
   ```

   Printed strings live in `src/core/i18n/{es,en,pt,it}.ts`. `ctx.add` registers a
   block: in the editor it can then be selected, moved, scaled, rotated, faded or hidden.

4. **Run the tests.** `npm test` lays out every template in several languages, papers
   and comfort levels and fails if any text overflows, overlaps another text or leaves
   the printable area.

## Add a section

A section module implements `SectionModule` from `src/core/sections/types.ts`:

```ts
export const gratitude: SectionModule = {
  type: 'gratitude',
  scope: 'month',              // 'front', 'month', 'back' or 'any'
  defaults: { pages: 1 },      // options shown in the Sections tab
  plan(doc, item, month) {     // which pages exist (no drawing here)
    return [{ key: `month:${month!.key}:gratitude`, type: 'gratitude', section: item.id, title: 'Gratitude', group: `month:${month!.key}` }];
  },
  layout(ctx, page) {          // draw one page, in millimetres
    const r = headed(ctx, ctx.s.gratitude.title, '');
    ctx.add('gratitude.lines', 'Lines', writingArea(ctx, r));
  },
};
```

Then:

1. Add it to the list in `src/core/sections/registry.ts` and its page type to
   `PAGE_TYPES`.
2. Add its printed strings to the four files in `src/core/i18n/`.
3. Add its name to the interface dictionary (`sec.gratitude`) in `src/app/i18n/ui.ts`.
4. Optionally add it to a template in `src/core/design/defaults.ts`.
5. If an option is text with a fixed list of values (like `variant` or `style`), list
   them in `src/core/sections/options.ts`. The Sections tab offers them in a menu and the
   JSON Schema of the file accepts only those values. Numbers in `defaults` are counts:
   the form and `opt()` keep them between 0 and 200.

Pages are laid out on demand and cached, so a section only pays for the pages that are
shown. Use the helpers in `src/core/layout/` (`takeTop`, `rows`, `cols`, `grid`,
`textIn`, `writingArea`, `miniCalendar`…) instead of fixed coordinates: they adapt to
every paper size, margin and comfort level.
