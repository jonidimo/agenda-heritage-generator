# Printing and binding guide

[English](printing.md) · [Español](impresion.md)

This guide takes you from a finished design to a sewn book. It was written for an
HP LaserJet 4350 with its duplex unit, but every step applies to any duplex printer.

## Print or read on screen

The top bar has two modes. **Design** is for the page, spread and whole book. **Print** adds the
printed-sheet view and the print panel, and draws on every page the area the printer does not print
(red) and the binding margin (blue).

In **Print → Destination** you choose what the planner is for. *Print and bind* is everything below.
*Read on screen* drops the binding margin, trims, marks and the filler pages that complete signatures:
the pages keep their size, the printing options fold away and the only PDF is page by page, with links
and bookmarks. Switching back loses nothing.

## 1. Choose paper and page size

| Sheet (what the printer takes) | Page (what you write on) | Notes |
| --- | --- | --- |
| A4, 297 × 210 mm | A5, 148.5 × 210 mm | The classic. Fits every printer. |
| Legal / Oficio, 355.6 × 215.9 mm | 177.8 × 215.9 mm | Largest size the LaserJet 4350 prints. Roomier pages. |
| Letter, 279.4 × 215.9 mm | 139.7 × 215.9 mm | US paper. |
| Folio, Oficio 340, A3, A5, custom | half of the sheet | Pick it in **Print → Paper**. |

The layout is computed in millimetres for the page you choose. A bigger page gets
**more lines, not stretched lines**; text keeps its size in points.

Paper weight: 75–90 g/m² folds well in signatures of 4–5 sheets. Bookcel or ivory
paper is easier on the eyes. If you can, use paper whose grain runs parallel to the
fold: the book opens flatter.

## 2. Choose how the book is bound

In **Print → Binding**:

- **Sewn signatures** (default). Sheets are folded in groups called signatures and each
  signature is sewn. Choose how many sheets go in each signature: 4 sheets make 16 pages.
  - *All equal*: all signatures have the same number of sheets, the last one may be smaller.
  - *Balanced*: signatures differ by one sheet at most.
  - *Custom*: type a list such as `4, 5, 5, 4`.
  - *Last signature*: shrink it, or pad it with note pages so all signatures are equal.
- **Single signature** (saddle stitch). One folded stack, stapled or sewn through the fold.
  Good for thin books.
- **Cut & stack**. Print, cut the stack in half, put the left half on top of the right
  half. Good for spiral, ring, disc or glued binding.
- **One page per sheet**. No imposition: page 1 on the front, page 2 on the back.

The app pads the document with note or dot pages so that every signature is full, and it
keeps weekly spreads facing each other and month covers on right-hand pages.

## 3. Calibrate the printer once

Export **Calibration sheet** and print it double-sided, exactly like the planner.

1. **Scale.** Measure the 100 mm ruler. If it is not 100 mm, the printer dialog is
   scaling the page. Set "Actual size" / "100 %" and turn off "Fit to page".
2. **Duplex direction.** Both sides show arrows pointing up. If the back is upside down,
   switch the duplex mode in the app (**short edge** ↔ **long edge**) or toggle the
   driver's "Flip pages up" option.
3. **Registration.** Hold the sheet against a window. The crosses on the front and back
   are printed at the same position. If they do not line up, measure how far the back
   is shifted and type it in **Print → Back-side correction** (x to the right, y down,
   in mm). A shift of about a millimetre is common.
4. **Unprintable margin.** The frame marks the area the printer cannot reach
   (4.2 mm by default). The preflight warns if anything falls inside it.

## 4. Print

Export **PDF to print (double-sided)**. Each PDF page is one side of a sheet, already
imposed. The PDF asks viewers for short-edge duplex and actual size.

**Linux (CUPS):**

```bash
lp -d HP_LaserJet_4350 -o sides=two-sided-short-edge -o media=A4 -o print-scaling=none planner.pdf
```

Replace `HP_LaserJet_4350` with your queue name (`lpstat -p` lists them).

From Okular or Evince: *Print → Options → Two-sided: Short edge (flip)*, scaling *None*.

**Windows:** *Print → Properties → Finishing*: *Print on both sides*. Check the calibration
sheet to see whether *Flip pages up* must be on or off for your driver. Choose *Actual size*.

**Android:** open the PDF and print through the printer's print service (for example
Mopria or HP Print Service Plugin). Choose *Two-sided: Short edge*. If the phone cannot
reach the printer, send the PDF to a computer.

**Printers without duplex** (or if the duplexer jams): choose *Manual duplex* in the app
and export *Fronts* and *Backs* separately. Print the fronts, put the stack back in the
tray as the app tells you (it can reverse the order and rotate the backs), then print the
backs.

## 5. Fold, sew and bind

1. Keep the sheets in printed order. Each signature starts with a front that shows a
   small number at the bottom of the fold (the signature label) and a black bar on the
   fold (the collation mark). When all signatures are stacked, the bars form a
   staircase: if one is out of place, the order is wrong.
2. Fold each signature in half along the fold marks. A bone folder gives a crisp fold.
3. Export **Punching template**, fold it with the signatures and pierce the stations
   through it with an awl. The default is 6 stations in pairs.
4. Sew the signatures (kettle stitch, Coptic or long stitch).
5. Export **Cover**. The spine width is computed from the number of sheets and the
   paper thickness, or you can type it.

### Creep

Folded signatures push the inner pages outward. With hand-folded, untrimmed signatures
of 4–5 sheets the effect is about 0.4 mm and can be ignored, so creep is **off** by
default. If you trim the fore edge, turn it on: use *caliper* with your paper thickness
(about 0.1 mm for 80 g/m²) or *measured* with the total shift you measured on a test
signature.

### Crop marks and trim

If you will trim the book, set the margins in **Print → Trim** and turn on crop marks.
The marks are drawn in the trim margin, outside the page.

## 6. Command line

Everything the app exports can also be produced from a terminal:

```bash
npm run agenda -- info designs/norma-2027.agenda.json
```

```bash
npm run pdf -- designs/norma-2027.agenda.json --mode imposed --out output/norma-2027-print.pdf
```

Modes: `imposed`, `pages`, `fronts`, `backs`, `signature --signature N`, `calibration`,
`sewing`, `cover`, `separate`.
