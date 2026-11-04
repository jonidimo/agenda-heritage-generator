# Legacy: the 2026 planner (Python + WeasyPrint)

This folder keeps the original pipeline that produced the 2026 "Heritage" planner, as a
design reference. It is no longer run or maintained: the TypeScript studio in `src/`
replaces it and reproduces its pages with fixes.

- `python/`: `build_agenda_2026.py`, the `generate_*.py` scripts, the Jinja2 templates and
  CSS of the Heritage theme (`python/themes/heritage/`) and the colibrí SVG.
- `pdf-2026/`: the PDFs that were printed in 2026 and `full_agenda.html`.
- `images/`: screenshots of the 2026 weekly spread and habit tracker.

Known problems of this version, all solved in the new engine: the page count was
declared instead of measured (one PDF had 293 pages instead of 216), the year, name and
Argentine holidays were hard-coded, February's tracker showed March days, the binding
gutter was never applied and the colibrí's stroke was too thin to print.

---

# Legado: la agenda 2026 (Python + WeasyPrint)

Esta carpeta conserva el sistema original con el que se hizo la agenda «Heritage» 2026,
como referencia de diseño. Ya no se ejecuta ni se mantiene: el estudio en TypeScript de
`src/` lo reemplaza y reproduce sus páginas con las correcciones.

- `python/`: `build_agenda_2026.py`, los scripts `generate_*.py`, las plantillas Jinja2 y el
  CSS del tema Heritage (`python/themes/heritage/`) y el SVG del colibrí.
- `pdf-2026/`: los PDF que se imprimieron en 2026 y `full_agenda.html`.
- `images/`: capturas del pliego semanal y del registro de hábitos de 2026.

Problemas conocidos de esta versión, todos resueltos en el motor nuevo: la cantidad de
páginas se declaraba en lugar de medirse (un PDF salió con 293 páginas en vez de 216), el
año, el nombre y los feriados argentinos estaban fijos en el código, el registro de hábitos
de febrero mostraba días de marzo, el lomo nunca se aplicaba y el trazo del colibrí era
demasiado fino para imprimirse.
