import { devices, expect, test, type Page } from '@playwright/test';

type StoreHandle = {
  getState: () => {
    design: { overrides: Array<{ blockId: string; dx: number }>; theme: { comfort: string }; binding: { signature: { sheets: number } }; pageStyles: Array<{ pageType: string; tokens: Record<string, unknown> }>; watermarks: Array<{ excludePages: string[] }> } | null;
    pageIndex: number;
    selectedIds: string[];
    uiLang: string;
    zoom: number;
    fit: boolean;
    uiScale: number;
    showLinks: boolean;
    panelSizes: { left: number; right: number; thumbs: number };
    goToPage: (i: number) => void;
    setView: (v: string) => void;
  };
};

async function open(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('agenda-studio.uiLang', 'es'));
  await page.goto('/');
  await page.getByRole('button', { name: 'Crear agenda' }).click();
  await expect(page.locator('[data-page-index]').first()).toBeVisible({ timeout: 60_000 });
}

const state = (page: Page) => page.evaluate(() => (globalThis as unknown as { __agenda: StoreHandle }).__agenda.getState());

test('crea la agenda de Norma y muestra el pliego con la semana', async ({ page }) => {
  await open(page);
  await expect(page.getByText('Pág. 1 / 224')).toBeVisible();
  for (let i = 0; i < 11; i++) await page.keyboard.press('PageDown');
  await expect(page.locator('[data-block="week.title"]').first()).toBeVisible();
});

test('arrastrar un elemento crea un ajuste aplicado a todas las semanas', async ({ page }) => {
  await open(page);
  for (let i = 0; i < 11; i++) await page.keyboard.press('PageDown');
  const block = page.locator('[data-block="week.minical"]').first();
  const box = await block.boundingBox();
  expect(box).not.toBeNull();
  const before = (await state(page)).design!.overrides.length;
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 - 40, box!.y + box!.height / 2 + 25, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await state(page)).design!.overrides.length).toBe(before + 1);
});

test('cambiar la comodidad del estilo actualiza la agenda en vivo', async ({ page }) => {
  await open(page);
  await page.getByRole('tab', { name: 'Estilo' }).click();
  await page.getByRole('button', { name: 'Amplia (lectura clara)' }).click();
  await expect.poll(async () => (await state(page)).design!.theme.comfort).toBe('wide');
});

test('descarga la hoja de calibración y el PDF para imprimir', async ({ page }) => {
  test.setTimeout(240_000);
  await open(page);
  await page.getByRole('button', { name: 'Imprimir / exportar' }).click();
  const [cal] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Hoja de calibración' }).click()]);
  const calPath = await cal.path();
  expect(calPath).toBeTruthy();
  const { readFileSync } = await import('node:fs');
  expect(readFileSync(calPath!).subarray(0, 4).toString()).toBe('%PDF');
  const [imp] = await Promise.all([page.waitForEvent('download', { timeout: 200_000 }), page.getByRole('button', { name: 'PDF para imprimir (doble faz)' }).click()]);
  const impPath = await imp.path();
  const bytes = readFileSync(impPath!);
  expect(bytes.subarray(0, 4).toString()).toBe('%PDF');
  expect(bytes.length).toBeGreaterThan(200_000);
});

test('la verificación previa de la agenda de Norma no encuentra problemas', async ({ page }) => {
  test.setTimeout(180_000);
  await open(page);
  await page.getByRole('button', { name: 'Revisar todas las páginas' }).click();
  await expect(page.getByText('Sin problemas')).toBeVisible({ timeout: 120_000 });
});

test('la interfaz cambia de idioma y traduce los nombres de los elementos', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Archivo' }).click();
  await page.getByRole('menuitem', { name: 'English' }).click();
  await expect(page.getByRole('button', { name: 'Print / export' })).toBeVisible();
  for (let i = 0; i < 11; i++) await page.keyboard.press('PageDown');
  const block = page.locator('[data-block="week.minical"]').first();
  const box = await block.boundingBox();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await expect(page.getByText('Mini calendar', { exact: true })).toBeVisible();
});

test('un clic con un temblor de 1 px no mueve ni encaja el elemento', async ({ page }) => {
  await open(page);
  for (let i = 0; i < 11; i++) await page.keyboard.press('PageDown');
  const box = (await page.locator('[data-block="week.minical"]').first().boundingBox())!;
  const before = (await state(page)).design!.overrides.length;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 1, cy + 1);
  await page.mouse.up();
  await page.waitForTimeout(400);
  expect((await state(page)).design!.overrides.length).toBe(before);
});

test('un número con decimales en un campo entero se redondea', async ({ page }) => {
  await open(page);
  await page.getByRole('tab', { name: 'Impresión' }).click();
  await page.getByRole('spinbutton', { name: 'Hojas por cuadernillo' }).fill('4.5');
  await expect.poll(async () => (await state(page)).design!.binding.signature.sheets).toBe(5);
});

test('en un teléfono, tocar un elemento abre su panel', async ({ browser }) => {
  const ctx = await browser.newContext({ ...devices['Pixel 7'] });
  const page = await ctx.newPage();
  await open(page);
  await page.evaluate(() => (globalThis as unknown as { __agenda: StoreHandle }).__agenda.getState().goToPage(55));
  const block = page.locator('[data-block="week.minical"]').first();
  await expect(block).toBeVisible();
  const box = (await block.boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByRole('dialog', { name: 'Elemento' })).toBeVisible();
  await expect(page.getByText('Minicalendario', { exact: true })).toBeVisible();
  await ctx.close();
});

test('la política de seguridad no bloquea nada de la aplicación', async ({ page }) => {
  test.setTimeout(180_000);
  const violations: string[] = [];
  page.on('console', (m) => {
    if (/Content Security Policy|Refused to|Vista previa de PDF no disponible/i.test(m.text())) violations.push(m.text());
  });
  // Las violaciones que se atrapan con try/catch no llegan a la consola: se escuchan desde el primer instante.
  type Violation = { violatedDirective: string; blockedURI: string; sourceFile: string; lineNumber: number };
  await page.addInitScript(() => {
    const g = globalThis as unknown as { __csp: string[]; document: { addEventListener: (type: string, fn: (e: Violation) => void) => void } };
    g.__csp = [];
    g.document.addEventListener('securitypolicyviolation', (e) => g.__csp.push(`${e.violatedDirective} ${e.blockedURI} ${e.sourceFile}:${e.lineNumber}`));
  });
  await open(page);
  for (let i = 0; i < 4; i++) await page.keyboard.press('PageDown');
  await page.getByRole('button', { name: 'Imprimir / exportar' }).click();
  const [cal] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Hoja de calibración' }).click()]);
  expect(await cal.path()).toBeTruthy();
  await page.getByRole('tab', { name: 'Métodos' }).click();
  await page.getByRole('tab', { name: 'Estilo' }).click();
  // Un PDF importado se previsualiza con pdf.js (en su propio Worker).
  const { PDFDocument } = await import('@cantoo/pdf-lib');
  const pdf = await PDFDocument.create();
  pdf.addPage([300, 400]).drawText('Hola', { x: 40, y: 300, size: 30 });
  const bytes = Buffer.from(await pdf.save());
  await page.getByRole('tab', { name: 'Imágenes y fuentes' }).click();
  await page.locator('input[type="file"][accept*="pdf"]').setInputFiles({ name: 'prueba.pdf', mimeType: 'application/pdf', buffer: bytes });
  await expect(page.getByText('prueba.pdf').filter({ visible: true }).first()).toBeVisible();
  // pdf.js dibujó la vista previa (una imagen blob:), así que su Worker funciona con la política.
  await expect(page.locator('img[src^="blob:"]').first()).toBeVisible({ timeout: 20_000 });
  expect(violations).toEqual([]);
  expect(await page.evaluate(() => (globalThis as unknown as { __csp: string[] }).__csp)).toEqual([]);
  // La política está activa en la compilación.
  expect(await page.locator('meta[http-equiv="Content-Security-Policy"]').count()).toBe(1);
});

test('si el editor falla, ofrece cómo seguir y la agenda no se reabre sola al recargar', async ({ page }) => {
  test.setTimeout(180_000);
  await open(page);
  // El panel de secciones es el que lee ese dato: se lo abre para que la falla simulada lo alcance.
  await page.getByRole('tab', { name: 'Secciones' }).click();
  // Un estado que el esquema nunca deja pasar (simula un error del programa al dibujar).
  await page.evaluate(() => {
    const st = (globalThis as unknown as { __agenda: { getState: () => { design: object }; setState: (s: object) => void } }).__agenda;
    st.setState({ design: { ...st.getState().design, sections: null } });
  });
  await expect(page.getByRole('heading', { name: 'Algo falló al mostrar el editor' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Guardar una copia en un archivo' })).toBeVisible();
  // Al recargar, la agenda que falló no se abre sola: aparecen Mis agendas y el motivo.
  await page.reload();
  await expect(page.getByRole('dialog', { name: 'Mis agendas' })).toBeVisible();
  await expect(page.getByText(/no se pudo mostrar la última vez/)).toBeVisible();
  // Abierta a mano se ve bien (lo guardado nunca estuvo roto) y, tras unos segundos, deja de estar anotada.
  await page.getByRole('dialog', { name: 'Mis agendas' }).getByRole('button', { name: /Agenda 2027/ }).first().click();
  await expect(page.locator('[data-page-index]').first()).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => page.evaluate(() => localStorage.getItem('agenda-studio.crashed')), { timeout: 15_000 }).toBeNull();
  await page.reload();
  await expect(page.locator('[data-page-index]').first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('dialog', { name: 'Mis agendas' })).toHaveCount(0);
});

test('una página que no se puede dibujar no tumba el editor', async ({ page }) => {
  await open(page);
  const first = page.locator('[data-page-index="0"]');
  const key = await first.getAttribute('data-page-key');
  const type = await first.getAttribute('data-page-type');
  expect(key && type).toBeTruthy();
  // Un bloque sin propiedades (el esquema nunca lo deja pasar): simula un error del programa en una sola página.
  await page.evaluate(
    ([k, ty]) => {
      const st = (globalThis as unknown as { __agenda: { getState: () => { update: (fn: (d: { customBlocks: unknown[] }) => void) => void } } }).__agenda;
      st.getState().update((d) => void d.customBlocks.push({ id: 'roto', pageType: ty, pageKey: k, kind: 'text', x: 10, y: 10, w: 30, h: 10, mirror: false, props: null }));
    },
    [key, type],
  );
  await expect(page.getByText('La página 1 no se pudo dibujar.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Algo falló al mostrar el editor' })).toHaveCount(0);
  // El resto del editor sigue andando: se puede ir a otra página y volver a esta.
  await page.keyboard.press('PageDown');
  await expect(page.locator('[data-page-index="1"]')).toBeVisible();
  await page.keyboard.press('PageUp');
  await expect(page.getByText('La página 1 no se pudo dibujar.')).toBeVisible();
  // Y se arregla deshaciendo el cambio.
  await page.getByRole('alert').getByRole('button', { name: 'Deshacer el último cambio' }).first().click();
  await expect(page.locator('[data-page-index="0"]')).toBeVisible();
  await expect(page.getByText('La página 1 no se pudo dibujar.')).toHaveCount(0);
});

const center = async (page: Page, selector: string) => {
  const box = (await page.locator(selector).first().boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

test('clic derecho: seleccionar los doce meses y ordenarlos en cuadrícula', async ({ page }) => {
  await open(page);
  await page.evaluate(() => (globalThis as unknown as { __agenda: StoreHandle }).__agenda.getState().goToPage(11));
  const p = await center(page, '[data-block="birthdays.3"]');
  await page.mouse.click(p.x, p.y, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Seleccionar los 12 similares' }).click();
  await expect.poll(async () => (await state(page)).selectedIds.length).toBe(12);
  // Mover uno y ordenar: vuelve a quedar alineado con su columna.
  await page.keyboard.press('Escape');
  const q = await center(page, '[data-block="birthdays.5"]');
  await page.mouse.move(q.x, q.y);
  await page.mouse.down();
  await page.mouse.move(q.x + 30, q.y + 12, { steps: 6 });
  await page.mouse.up();
  await page.mouse.click(p.x, p.y, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Seleccionar los 12 similares' }).click();
  await page.getByRole('button', { name: 'Ordenar en cuadrícula' }).click();
  const xs = await Promise.all(['birthdays.1', 'birthdays.3', 'birthdays.5'].map(async (id) => (await page.locator(`[data-block="${id}"]`).first().boundingBox())!.x));
  expect(Math.abs(xs[2]! - xs[0]!)).toBeLessThan(1);
  expect(Math.abs(xs[1]! - xs[0]!)).toBeLessThan(1);
});

test('clic derecho sobre la marca de agua: ocultarla solo en esta página', async ({ page }) => {
  await open(page);
  await page.evaluate(() => (globalThis as unknown as { __agenda: StoreHandle }).__agenda.getState().goToPage(11));
  const p = await center(page, '[data-block="wm.colibri"]');
  await page.mouse.click(p.x, p.y, { button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Subir otra imagen…' })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Ocultar en esta página' }).click();
  await expect.poll(async () => (await state(page)).design!.watermarks[0]!.excludePages.length).toBe(1);
});

test('los puntos de una página de notas se pueden cambiar por renglones', async ({ page }) => {
  await open(page);
  await page.evaluate(() => (globalThis as unknown as { __agenda: StoreHandle }).__agenda.getState().goToPage(19));
  const p = await center(page, '[data-block="notes.area"]');
  await page.mouse.click(p.x, p.y);
  await expect(page.getByText('Renglones y puntos')).toBeVisible();
  await page.locator('[data-inspector]').getByRole('group', { name: 'Estilo' }).getByRole('button', { name: 'Renglones' }).click();
  await expect.poll(async () => JSON.stringify((await state(page)).design!.pageStyles)).toContain('"style":"lines"');
  // Las líneas horizontales no tienen alto (Playwright no las considera «visibles»): se cuentan.
  await expect.poll(async () => page.locator('[data-block="notes.area"] line').count()).toBeGreaterThan(5);
});

test('en el pliego, la primera página sola se muestra centrada', async ({ page }) => {
  await open(page);
  await expect(page.locator('[data-page-index]')).toHaveCount(1);
  const box = (await page.locator('[data-page-index]').first().boundingBox())!;
  const area = (await page.locator('.desk').first().boundingBox())!;
  expect(Math.abs(box.x + box.width / 2 - (area.x + area.width / 2))).toBeLessThan(4);
});

test('el idioma elegido al crear la agenda cambia toda la interfaz al momento', async ({ browser }) => {
  const ctx = await browser.newContext({ locale: 'es-AR' });
  const page = await ctx.newPage();
  await page.goto('/');
  // Sin elegir idioma, el asistente habla el del navegador y propone su país.
  await expect(page.getByRole('button', { name: 'Crear agenda' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByLabel('País (feriados)')).toHaveValue('AR');
  await page.getByLabel('Idioma de la agenda y de la interfaz').selectOption('en');
  // La interfaz entera pasa al inglés antes de crear, y el país pasa a uno de habla inglesa.
  await expect(page.getByRole('button', { name: 'Create planner' })).toBeVisible();
  await expect(page.getByLabel('Country (holidays)')).toHaveValue('US');
  await page.getByLabel('Week starts on').selectOption('auto');
  await page.getByRole('button', { name: 'Create planner' }).click();
  await expect(page.getByRole('button', { name: 'Print / export' })).toBeVisible({ timeout: 60_000 });
  const d = await page.evaluate(() => (globalThis as unknown as { __agenda: { getState: () => { uiLang: string; design: { locale: string; calendar: { weekStart: string } } } } }).__agenda.getState());
  expect(d.uiLang).toBe('en');
  expect(d.design.locale).toBe('en-US');
  expect(d.design.calendar.weekStart).toBe('auto');
  await ctx.close();
});

test.describe('archivos y plantillas', () => {
  // Sin selector nativo de archivos (como Firefox o Android): guardar descarga y abrir usa un <input>.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const w = globalThis as unknown as { showSaveFilePicker?: unknown; showOpenFilePicker?: unknown };
      w.showSaveFilePicker = undefined;
      w.showOpenFilePicker = undefined;
    });
  });

  test('guardar la agenda como archivo y volver a abrirla', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Archivo' }).click();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: /^Guardar \(Ctrl\+S\)/ }).click()]);
    const { readFileSync } = await import('node:fs');
    const saved = JSON.parse(readFileSync((await dl.path())!, 'utf8')) as { name: string; calendar: { year: number } };
    expect(saved.calendar.year).toBeGreaterThan(2000);
    // Abrir el mismo archivo con un nombre distinto: aparece como la agenda abierta.
    saved.name = 'Copia abierta desde archivo';
    await page.getByRole('button', { name: 'Archivo' }).click();
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('menuitem', { name: /Abrir archivo/ }).click()]);
    await chooser.setFiles({ name: 'agenda.agenda.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(saved)) });
    await expect(page.getByRole('textbox', { name: 'Nombre de la agenda' })).toHaveValue('Copia abierta desde archivo');
  });

  test('guardar como plantilla y crear una agenda nueva a partir de ella', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Archivo' }).click();
    await page.getByRole('menuitem', { name: 'Guardar como plantilla…' }).click();
    await page.getByRole('textbox', { name: 'Nombre de la plantilla' }).fill('Mi diseño de prueba');
    await page.getByRole('button', { name: 'Guardar plantilla' }).click();
    await expect(page.getByText('Plantilla guardada: «Mi diseño de prueba».')).toBeVisible();
    await page.getByRole('button', { name: 'Mis agendas' }).click();
    await expect(page.getByText('Mi diseño de prueba', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Nueva agenda' }).click();
    await page.getByRole('radio', { name: 'Mi diseño de prueba', exact: true }).check();
    await page.getByRole('spinbutton', { name: 'Año' }).fill('2031');
    await page.getByRole('button', { name: 'Crear agenda' }).click();
    await expect.poll(async () => page.evaluate(() => (globalThis as unknown as { __agenda: { getState: () => { design: { calendar: { year: number } } } } }).__agenda.getState().design.calendar.year)).toBe(2031);
  });

  test('copia de seguridad de todo', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Archivo' }).click();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'Copia de seguridad de todo' }).click()]);
    const { readFileSync } = await import('node:fs');
    const backup = JSON.parse(readFileSync((await dl.path())!, 'utf8')) as { kind: string; designs: unknown[] };
    expect(backup.kind).toBe('heritage-backup');
    expect(backup.designs.length).toBeGreaterThanOrEqual(1);
  });
});

test.describe('enlaces para leer en tableta', () => {
  type LinksState = { design: { links: { dayTarget: string; blocks: Array<{ blockId: string; pageKey: string | null; mode: string; url: string }> } } };
  const links = (page: Page) => page.evaluate(() => (globalThis as unknown as { __agenda: { getState: () => LinksState } }).__agenda.getState().design.links);
  const areas = (page: Page) => page.locator('[data-page-type="yearOverview"] [data-link-to]');

  test('el calendario anual muestra sus enlaces: un clic elige el elemento y el doble clic lleva a la semana', async ({ page }) => {
    await open(page);
    await page.evaluate(() => (globalThis as unknown as { __agenda: StoreHandle }).__agenda.getState().goToPage(7));
    await page.getByRole('button', { name: 'Ver y seguir los enlaces del PDF' }).click();
    // Los dos calendarios del pliego: 365 días y 12 meses (más el título de la segunda página).
    await expect.poll(async () => areas(page).count()).toBeGreaterThan(370);
    const day = areas(page).and(page.locator('[title*="Semana 9 "]')).first();
    const to = Number(await day.getAttribute('data-link-to'));
    const box = (await day.boundingBox())!;
    await day.click();
    // Un clic no navega: elige el elemento al que pertenece la zona y su panel muestra los enlaces.
    await expect(page.getByTestId('link-fields')).toBeVisible();
    expect((await state(page)).pageIndex).toBe(7);
    // Con el elemento ya elegido (su capa de arrastre queda encima), el doble clic sigue el enlace.
    await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
    await expect.poll(async () => (await state(page)).pageIndex).toBe(to);
    await expect(page.locator('[data-page-type="weekLeft"]')).toBeVisible();
    // El título de la semana sube al mes.
    await expect(page.locator('[data-page-type="weekLeft"] [data-link-to]').first()).toHaveAttribute('title', /Marzo 2027/);
  });

  test('en el panel del elemento se le quitan los enlaces o se le pone uno a mano', async ({ page }) => {
    await open(page);
    await page.evaluate(() => (globalThis as unknown as { __agenda: StoreHandle }).__agenda.getState().goToPage(7));
    // Seleccionar marzo (por la fila de iniciales, que no es un enlace).
    const box = (await page.locator('[data-page-type="yearOverview"] [data-block="month.3"]').first().boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.14);
    const panel = page.getByTestId('link-fields');
    const mode = panel.getByRole('combobox', { name: 'Al tocarlo en el PDF' });
    await expect(mode).toHaveValue('auto');
    await page.getByRole('button', { name: 'Ver y seguir los enlaces del PDF' }).click();
    const before = await areas(page).count();
    await mode.selectOption('none');
    await expect.poll(async () => (await links(page)).blocks).toEqual([expect.objectContaining({ blockId: 'month.3', pageKey: null, mode: 'none' })]);
    await expect.poll(async () => areas(page).count()).toBe(before - 32);
    await mode.selectOption('url');
    await panel.getByRole('textbox', { name: 'Dirección' }).fill('https://example.org/marzo');
    await expect.poll(async () => (await links(page)).blocks[0]?.url).toBe('https://example.org/marzo');
    await expect(page.locator('[data-page-type="yearOverview"] [data-link-to="https://example.org/marzo"]')).toHaveCount(1);
    await mode.selectOption('auto');
    await expect.poll(async () => (await links(page)).blocks).toEqual([]);
    await expect.poll(async () => areas(page).count()).toBe(before);
  });

  test('ajustes de enlaces y PDF de páginas con enlaces y marcadores', async ({ page }) => {
    test.setTimeout(240_000);
    await open(page);
    await page.getByRole('button', { name: 'Imprimir / exportar' }).click();
    await page.getByRole('button', { name: 'Enlaces y marcadores (tableta o lector)' }).click();
    await page.getByLabel('Los días llevan a').selectOption('month');
    await expect.poll(async () => (await links(page)).dayTarget).toBe('month');
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 200_000 }), page.getByRole('button', { name: 'PDF de páginas' }).click()]);
    const { readFileSync } = await import('node:fs');
    const pdf = readFileSync((await dl.path())!).toString('latin1');
    expect(pdf).toContain('/Subtype /Link');
    expect(pdf).toContain('/Outlines');
    expect(pdf).toMatch(/\/Lang \(es-[A-Z]{2}\)/);
  });
});

test('tocar una sección lleva a sus páginas, se puede repetir cada semana y «Atrás» vuelve', async ({ page }) => {
  await open(page);
  await page.getByRole('tab', { name: 'Secciones' }).click();
  const row = page.locator('li').filter({ has: page.getByRole('checkbox', { name: 'Estimé / tardé' }) });
  await row.getByRole('checkbox').check();
  await row.getByRole('button', { name: /Estimé \/ tardé/ }).click();
  await expect(page.locator('[data-page-type="estimates"]').first()).toBeVisible();
  const at = (await state(page)).pageIndex;
  expect(at).toBeGreaterThan(100);
  // Clic derecho: cada semana.
  await row.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Cada semana' }).click();
  await expect(page.locator('li').filter({ has: page.getByRole('checkbox', { name: 'Estimé / tardé' }) }).getByText('Cada semana')).toBeVisible();
  // «Atrás» vuelve a la portada, desde donde se saltó.
  await page.getByRole('button', { name: 'Atrás (Alt+←)' }).click();
  await expect.poll(async () => (await state(page)).pageIndex).toBe(0);
  await page.getByRole('button', { name: 'Adelante (Alt+→)' }).click();
  await expect.poll(async () => (await state(page)).pageIndex).toBeGreaterThan(0);
});

test('un texto propio se estira solo a lo ancho con el tirador del lado, y en proporción con Mayús', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Texto', exact: true }).first().click();
  const custom = () => page.evaluate(() => (globalThis as unknown as { __agenda: { getState: () => { design: { customBlocks: Array<{ w: number; h: number }> } } } }).__agenda.getState().design.customBlocks.at(-1)!);
  const before = await custom();
  const side = (await page.locator('[data-handle="e"]').boundingBox())!;
  await page.mouse.move(side.x + side.width / 2, side.y + side.height / 2);
  await page.mouse.down();
  await page.mouse.move(side.x - 40, side.y + side.height / 2 + 30, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await custom()).w).toBeLessThan(before.w - 5);
  expect((await custom()).h).toBeCloseTo(before.h, 1);
  // Esquina con Mayús: ancho y alto en la misma proporción.
  const mid = await custom();
  const corner = (await page.locator('[data-handle="se"]').boundingBox())!;
  await page.keyboard.down('Shift');
  await page.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2);
  await page.mouse.down();
  await page.mouse.move(corner.x + 30, corner.y + 5, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await expect.poll(async () => (await custom()).w).toBeGreaterThan(mid.w + 3);
  const after = await custom();
  expect(after.w / after.h).toBeCloseTo(mid.w / mid.h, 1);
});

test.describe('estilo integral y buscador', () => {
  type ThemeState = { design: { theme: { id: string; tokens: { lines?: Record<string, { pattern?: string; ornament?: string }>; colors?: { roles?: Record<string, string> } } } } };
  const theme = (page: Page) => page.evaluate(() => (globalThis as unknown as { __agenda: { getState: () => ThemeState } }).__agenda.getState().design.theme);

  test('el buscador perdona errores de tipeo y muestra dónde está el ajuste', async ({ page }) => {
    await open(page);
    await page.keyboard.press('Control+k');
    await page.getByRole('combobox', { name: 'Buscar (Ctrl+K)' }).fill('pestanas de mezes');
    await expect(page.getByRole('option').first()).toContainText('Pestañas');
    await page.keyboard.press('Enter');
    // Abre Impresión, despliega el grupo plegado y resalta el control.
    await expect(page.locator('.reveal-flash')).toBeVisible();
    await expect(page.locator('.reveal-flash')).toContainText('Pestañas');
    await expect(page.getByRole('tab', { name: 'Impresión' })).toHaveAttribute('aria-selected', 'true');
  });

  test('desde un título de la página se llega a la letra y el color de los títulos', async ({ page }) => {
    await open(page);
    await page.evaluate(() => (globalThis as unknown as { __agenda: StoreHandle }).__agenda.getState().goToPage(7));
    const p = await center(page, '[data-page-type="yearOverview"] [data-block="header.title"]');
    await page.mouse.click(p.x, p.y);
    await page.getByTestId('text-roles').getByRole('button', { name: /Títulos/ }).click();
    await expect(page.locator('[data-reveal="role.title"].reveal-flash')).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Estilo' })).toHaveAttribute('aria-selected', 'true');
  });

  test('paleta derivada, separadores con firulete y guardar el estilo como tema propio', async ({ page }) => {
    await open(page);
    await page.getByRole('tab', { name: 'Estilo' }).click();
    await page.getByRole('button', { name: 'Paleta de colores' }).click();
    await page.getByLabel('Armonía').selectOption('complementary');
    await page.getByRole('button', { name: 'Aplicar la paleta' }).click();
    await expect.poll(async () => Object.keys((await theme(page)).tokens.colors?.roles ?? {}).length).toBe(8);
    await page.getByRole('button', { name: 'Líneas y ornamentos' }).click();
    const sep = page.locator('[data-reveal="line.separator"]');
    await sep.getByLabel('Trazo').selectOption('center');
    await sep.getByRole('button', { name: 'Florón' }).click();
    await expect.poll(async () => (await theme(page)).tokens.lines?.separator).toEqual(expect.objectContaining({ pattern: 'center', ornament: 'builtin:fleuron' }));
    // El separador del encabezado ahora lleva el ornamento (se dibuja como grupo con trazados).
    await page.evaluate(() => (globalThis as unknown as { __agenda: StoreHandle }).__agenda.getState().goToPage(7));
    await expect(page.locator('[data-page-type="yearOverview"] [data-block="header.rule"] path').first()).toBeAttached();
    // Guardar como tema propio: aparece en «Mis temas».
    await page.getByRole('button', { name: 'Guardar este estilo como tema' }).click();
    await page.getByLabel('Nombre del tema').fill('Mi azul');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(page.locator('[data-reveal="themes.mine"]').getByText('Mi azul')).toBeVisible();
  });
});

/** Como `open`, pero el asistente no vuelve a aparecer al recargar (para las pruebas que recargan). */
async function openQuiet(page: Page): Promise<void> {
  await page.addInitScript(() => {
    if (localStorage.getItem('agenda-studio.welcomeOnStart') === null) localStorage.setItem('agenda-studio.welcomeOnStart', 'false');
  });
  await open(page);
}

/** Lleva el lienzo a la semana (las páginas de abajo del año), donde están el minicalendario y los bloques de prueba. */
async function toWeek(page: Page): Promise<void> {
  for (let i = 0; i < 11; i++) await page.keyboard.press('PageDown');
}

test.describe('interfaz', () => {
  test('el asistente alinea sus campos y recuerda si se muestra al iniciar', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('agenda-studio.uiLang', 'es'));
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Crear agenda' })).toBeVisible({ timeout: 60_000 });
    // Calendario: semana, mes de inicio y cantidad de meses quedan alineados por abajo.
    const bottoms = await Promise.all(
      ['La semana empieza', 'Mes de inicio', 'Cantidad de meses'].map(async (name) => {
        const box = (await page.getByLabel(name).boundingBox())!;
        return box.y + box.height;
      }),
    );
    expect(Math.max(...bottoms) - Math.min(...bottoms)).toBeLessThan(1.5);
    const show = page.getByRole('checkbox', { name: 'Mostrar esta ventana al iniciar' });
    await expect(show).toBeChecked();
    await show.uncheck();
    await page.getByRole('button', { name: 'Crear agenda' }).click();
    await expect(page.locator('[data-page-index]').first()).toBeVisible({ timeout: 60_000 });
    expect(await page.evaluate(() => localStorage.getItem('agenda-studio.welcomeOnStart'))).toBe('false');
    await page.reload();
    await expect(page.locator('[data-page-index]').first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('dialog', { name: 'Nueva agenda' })).toHaveCount(0);
    // Con la opción activada, el asistente aparece sobre la agenda abierta y se puede cancelar.
    await page.evaluate(() => localStorage.setItem('agenda-studio.welcomeOnStart', 'true'));
    await page.reload();
    const dialog = page.getByRole('dialog', { name: 'Nueva agenda' });
    await expect(dialog).toBeVisible({ timeout: 60_000 });
    await expect(dialog.getByRole('checkbox', { name: 'Mostrar esta ventana al iniciar' })).toBeChecked();
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog).toHaveCount(0);
  });

  test('el panel izquierdo abre en Estilo y la barra superior no repite el nombre ni trae el idioma', async ({ page }) => {
    await open(page);
    const tabs = page.getByRole('tab');
    await expect(tabs.first()).toHaveAttribute('title', 'Estilo');
    await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
    await expect(tabs.nth(1)).toHaveAttribute('title', 'Secciones');
    await expect(page.locator('header').getByText('Heritage')).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'Idioma de la interfaz' })).toHaveCount(0);
  });

  test('los paneles se redimensionan con el divisor, con el teclado y con doble clic, y el tamaño se recuerda', async ({ page }) => {
    await openQuiet(page);
    const drag = async (name: string, dx: number, dy = 0): Promise<void> => {
      const box = (await page.getByRole('separator', { name }).boundingBox())!;
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + dx, y + dy, { steps: 6 });
      await page.mouse.up();
    };
    // Panel izquierdo.
    const left = page.locator('aside').first();
    const leftWidth = async (): Promise<number> => Math.round((await left.boundingBox())!.width);
    expect(await leftWidth()).toBe(330);
    await drag('Ancho del panel izquierdo', 80);
    await expect.poll(leftWidth).toBe(410);
    await expect(page.getByRole('separator', { name: 'Ancho del panel izquierdo' })).toHaveAttribute('aria-valuenow', '410');
    await page.reload();
    await expect.poll(leftWidth).toBe(410);
    // Teclado: flechas (con Mayús, el triple), extremos y doble clic (tamaño original).
    const leftHandle = page.getByRole('separator', { name: 'Ancho del panel izquierdo' });
    await leftHandle.focus();
    await page.keyboard.press('ArrowLeft');
    await expect.poll(leftWidth).toBe(394);
    await page.keyboard.press('Shift+ArrowRight');
    await expect.poll(leftWidth).toBe(442);
    await page.keyboard.press('End');
    await expect.poll(leftWidth).toBe(520);
    await leftHandle.dblclick();
    await expect.poll(leftWidth).toBe(330);
    // Se arrastra más allá del límite: queda en el máximo.
    await drag('Ancho del panel izquierdo', 900);
    await expect.poll(leftWidth).toBe(520);
    // Panel derecho: arrastrar hacia la izquierda lo agranda.
    const right = page.locator('aside').last();
    const rightWidth = async (): Promise<number> => Math.round((await right.boundingBox())!.width);
    expect(await rightWidth()).toBe(280);
    await drag('Ancho del panel derecho', -60);
    await expect.poll(rightWidth).toBe(340);
    // Miniaturas de abajo: arrastrar hacia arriba las agranda.
    const thumb = page.locator('[data-thumb="0"] canvas').first();
    const thumbWidth = async (): Promise<number> => Math.round((await thumb.boundingBox())!.width);
    expect(await thumbWidth()).toBe(46);
    await drag('Tamaño de las miniaturas', 0, -40);
    await expect.poll(thumbWidth).toBeGreaterThan(65);
    await page.reload();
    await expect.poll(rightWidth).toBe(340);
    await expect.poll(async () => (await state(page)).panelSizes.thumbs).toBeGreaterThan(65);
  });

  test('los botones en fila no se salen de un panel angosto', async ({ page }) => {
    await openQuiet(page);
    await page.getByRole('separator', { name: 'Ancho del panel derecho' }).focus();
    await page.keyboard.press('Home');
    await page.evaluate(() => (globalThis as unknown as { __agenda: StoreHandle }).__agenda.getState().goToPage(19));
    const p = await center(page, '[data-block="notes.area"]');
    await page.mouse.click(p.x, p.y);
    const inspector = page.locator('aside').last();
    await expect(inspector.getByText('Renglones y puntos')).toBeVisible();
    const aside = (await inspector.boundingBox())!;
    expect(Math.round(aside.width)).toBe(240);
    const buttons = inspector.getByRole('group', { name: 'Estilo' }).getByRole('button');
    await expect(buttons).toHaveCount(4);
    for (let i = 0; i < 4; i++) {
      const b = (await buttons.nth(i).boundingBox())!;
      expect(b.x + b.width).toBeLessThanOrEqual(aside.x + aside.width + 0.5);
    }
  });

  test('Ctrl + y Ctrl − acercan y alejan el lienzo, y Ctrl 0 lo ajusta a la ventana', async ({ page }) => {
    await open(page);
    const zoom = async () => {
      const s = await state(page);
      return { zoom: Number(s.zoom.toFixed(4)), fit: s.fit };
    };
    const pageWidth = async () => (await page.locator('[data-page-index]').first().boundingBox())!.width;
    expect(await zoom()).toEqual({ zoom: 1, fit: true });
    const base = await pageWidth();
    await page.keyboard.press('Control+Equal');
    await expect.poll(zoom).toEqual({ zoom: 1.2, fit: false });
    expect(await pageWidth()).toBeCloseTo(base * 1.2, 0);
    await page.keyboard.press('Control+Shift+Equal');
    await expect.poll(zoom).toEqual({ zoom: 1.44, fit: false });
    await page.keyboard.press('Control+Minus');
    await expect.poll(zoom).toEqual({ zoom: 1.2, fit: false });
    await page.keyboard.press('Control+0');
    await expect.poll(zoom).toEqual({ zoom: 1, fit: true });
    expect(await pageWidth()).toBeCloseTo(base, 0);
  });

  test('los deslizadores muestran un botón para restablecer su valor', async ({ page }) => {
    await open(page);
    // Del elemento (ajuste propio de un bloque): vuelve al valor por defecto.
    await toWeek(page);
    const p = await center(page, '[data-block="week.minical"]');
    await page.mouse.click(p.x, p.y);
    const opacity = page.locator('[data-inspector]').getByRole('spinbutton', { name: 'Opacidad' });
    const resetOpacity = page.getByRole('button', { name: 'Restablecer: Opacidad' });
    await expect(opacity).toBeVisible();
    await expect(resetOpacity).toHaveCount(0);
    await opacity.fill('0.5');
    await expect(resetOpacity).toBeVisible();
    await resetOpacity.click();
    await expect(resetOpacity).toHaveCount(0);
    await expect(opacity).toHaveValue('1');
    // Del tema: el ajuste se quita y el valor vuelve a salir del tema.
    type TokensState = { design: { theme: { tokens: { writing?: { pitch?: number } } } } };
    const tokens = () => page.evaluate(() => (globalThis as unknown as { __agenda: { getState: () => TokensState } }).__agenda.getState().design.theme.tokens);
    const pitch = page.getByRole('spinbutton', { name: 'Separación entre renglones (mm)' });
    const resetPitch = page.getByRole('button', { name: 'Restablecer: Separación entre renglones (mm)' });
    await page.getByRole('tab', { name: 'Estilo' }).click();
    await expect(pitch).toBeVisible();
    const original = await pitch.inputValue();
    await pitch.fill('9');
    await expect.poll(async () => (await tokens()).writing?.pitch).toBe(9);
    await resetPitch.click();
    await expect.poll(async () => (await tokens()).writing).toBeUndefined();
    await expect(pitch).toHaveValue(original);
    await expect(resetPitch).toHaveCount(0);
  });

  test('Archivo: idioma, tamaño de la interfaz y «Acerca de»', async ({ page }) => {
    await open(page);
    // Tamaño de la interfaz: la raíz se escala y un arrastre sigue siendo exacto.
    await page.getByRole('button', { name: 'Archivo' }).click();
    await page.getByRole('menuitem', { name: '125 %' }).click();
    await expect.poll(() => page.evaluate('document.documentElement.style.zoom')).toBe('1.25');
    expect(await page.evaluate('document.documentElement.style.getPropertyValue("--ui-zoom")')).toBe('1.25');
    expect((await state(page)).uiScale).toBe(1.25);
    await toWeek(page);
    const block = page.locator('[data-block="week.minical"]').first();
    const pageBox = (await page.locator('[data-page-index]').filter({ has: block }).boundingBox())!;
    const pxPerMm = pageBox.width / 148.5;
    const box = (await block.boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const before = (await state(page)).design!.overrides.length;
    // Un arrastre corto (el elemento no puede pasar del borde de la página) y con Alt, que apaga el imán.
    const dragPx = 24;
    await page.keyboard.down('Alt');
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + dragPx, cy, { steps: 6 });
    await page.mouse.up();
    await page.keyboard.up('Alt');
    await expect.poll(async () => (await state(page)).design!.overrides.length).toBe(before + 1);
    const moved = (await state(page)).design!.overrides.at(-1)!;
    // Los píxeles de pantalla se convierten en milímetros con la escala real de la página, aunque la interfaz esté ampliada.
    expect(Math.abs(Math.abs(moved.dx) - dragPx / pxPerMm)).toBeLessThan(0.3);
    // Idioma desde el menú.
    await page.getByRole('button', { name: 'Archivo' }).click();
    await page.getByRole('menuitem', { name: 'English' }).click();
    await expect(page.getByRole('button', { name: 'Print / export' })).toBeVisible();
    // «Acerca de».
    await page.getByRole('button', { name: 'File' }).click();
    await page.getByRole('menuitem', { name: 'About Heritage Studio…' }).click();
    const about = page.getByRole('dialog', { name: 'About Heritage Studio' });
    await expect(about).toBeVisible();
    await expect(about.getByText(/^Version \d+\.\d+\.\d+$/)).toBeVisible();
    await expect(about.getByRole('link', { name: 'Source code' })).toHaveAttribute('href', /github\.com\/jonidimo\/agenda-heritage-generator$/);
    await expect(about.getByText(/Cormorant Garamond —/)).toBeVisible();
    // En un navegador no hay carpeta: explica dónde guarda.
    await expect(about.getByText(/are kept in this browser/)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(about).toHaveCount(0);
  });

  test('con otro tamaño de interfaz, las unidades de la ventana se compensan', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 900, height: 800 } });
    const page = await ctx.newPage();
    await page.addInitScript(() => localStorage.setItem('agenda-studio.uiScale', '1.1'));
    await open(page);
    expect(await page.evaluate('document.documentElement.style.zoom')).toBe('1.1');
    await toWeek(page);
    const p = await center(page, '[data-block="week.minical"]');
    await page.mouse.click(p.x, p.y);
    // A 900 px con la interfaz al 110 %, el panel del elemento es una hoja inferior: el 52 % de la ventana.
    const sheet = page.getByRole('dialog', { name: 'Elemento' });
    await expect(sheet).toBeVisible();
    expect(Math.abs((await sheet.boundingBox())!.height - 0.52 * 800)).toBeLessThan(3);
    await ctx.close();
  });

  test('el menú contextual se abre junto al puntero con la interfaz ampliada', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.addInitScript(() => localStorage.setItem('agenda-studio.uiScale', '1.25'));
    await open(page);
    await toWeek(page);
    const p = await center(page, '[data-block="week.minical"]');
    await page.mouse.click(p.x, p.y, { button: 'right' });
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    const box = (await menu.boundingBox())!;
    expect(Math.abs(box.x - p.x)).toBeLessThan(2);
    expect(Math.abs(box.y - p.y)).toBeLessThan(2);
    await ctx.close();
  });

  test('«Editar enlaces…» elige el elemento y lleva a su sección de enlaces', async ({ page }) => {
    await open(page);
    await page.evaluate(() => (globalThis as unknown as { __agenda: StoreHandle }).__agenda.getState().goToPage(7));
    const p = await center(page, '[data-block="month.3"]');
    await page.mouse.click(p.x, p.y, { button: 'right' });
    await page.getByRole('menuitem', { name: 'Editar enlaces…' }).click();
    await expect(page.getByTestId('link-fields')).toBeVisible();
    await expect(page.getByTestId('link-fields').getByRole('combobox').first()).toBeFocused();
    expect((await state(page)).showLinks).toBe(true);
    expect((await state(page)).selectedIds).toEqual(['month.3']);
  });
});
