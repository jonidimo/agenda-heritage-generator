import { devices, expect, test, type Locator, type Page } from '@playwright/test';

type StoreHandle = {
  getState: () => {
    design: {
      overrides: Array<{ blockId: string; dx: number }>;
      theme: { comfort: string };
      binding: { signature: { sheets: number } };
      pageStyles: Array<{ pageType: string; tokens: Record<string, unknown> }>;
      watermarks: Array<{ excludePages: string[] }>;
    } | null;
    pageIndex: number;
    selection: { blockId: string } | null;
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
  await page.getByRole('button', { name: 'Ajustes' }).click();
  await page.getByRole('menuitem', { name: 'English' }).click();
  await expect(page.getByRole('button', { name: 'Print / export' })).toBeVisible();
  for (let i = 0; i < 11; i++) await page.keyboard.press('PageDown');
  const block = page.locator('[data-block="week.minical"]').first();
  const box = await block.boundingBox();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  // El nombre del elemento elegido figura en su panel (el botón de «agregar» se llama igual).
  await expect(page.getByRole('paragraph').filter({ hasText: /^Mini calendar$/ })).toBeVisible();
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
  await page.getByRole('button', { name: 'Impresión', exact: true }).click();
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
  await expect(page.getByRole('paragraph').filter({ hasText: /^Minicalendario$/ })).toBeVisible();
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
  await page.getByRole('tab', { name: 'Recursos / Vectores', exact: true }).click();
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
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: /^Guardar(?! como)/ }).click()]);
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
    await page.getByRole('button', { name: 'Archivo' }).click();
    await page.getByRole('menuitem', { name: 'Mis agendas…' }).click();
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
  // Un texto nuevo sigue a sus renglones (alto automático); acá se prueba el de alto fijo.
  await page.evaluate(`globalThis.__agenda.getState().update((d) => { const c = d.customBlocks.at(-1); c.props = { ...c.props, autoHeight: false }; }, 'e2e-fixed')`);
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

/** El tamaño de la interfaz desde Ajustes: se escribe el número y se confirma con Enter; el menú sigue abierto. */
async function setUiScale(page: Page, pct: number): Promise<void> {
  await page
    .locator('header')
    .getByRole('button', { name: /^(Ajustes|Settings)$/ })
    .click();
  const field = page.getByTestId('ui-scale').getByRole('spinbutton');
  await field.fill(String(pct));
  await field.press('Enter');
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
}

/** Lleva el lienzo a la semana (las páginas de abajo del año), donde están el minicalendario y los bloques de prueba. */
async function toWeek(page: Page): Promise<void> {
  for (let i = 0; i < 11; i++) await page.keyboard.press('PageDown');
}

/** Lo que el almacén y los contadores dicen del trabajo del editor (se lee dentro de la página). */
interface Work {
  past: number;
  revision: number;
  thumbPaints: number;
  hasPreview: boolean;
  previewPitch: number | null;
  committedPitch: number | null;
  previewInk: string | null;
  committedInk: string | null;
}

const WORK = `(() => {
  const s = globalThis.__agenda.getState();
  const pitch = (d) => d?.theme.tokens.writing?.pitch ?? null;
  const ink = (d) => d?.theme.tokens.colors?.roles?.title ?? null;
  return {
    past: s.past.length,
    revision: s.revision,
    thumbPaints: globalThis.__agendaStats.thumbPaints,
    hasPreview: s.previewDesign !== null,
    previewPitch: pitch(s.previewDesign),
    committedPitch: pitch(s.design),
    previewInk: ink(s.previewDesign),
    committedInk: ink(s.design),
  };
})()`;

const work = (page: Page): Promise<Work> => page.evaluate<Work>(WORK);

/** Espera a que las miniaturas terminen de dibujarse (el contador deja de moverse). */
async function settled(page: Page): Promise<void> {
  let last = -1;
  for (let i = 0; i < 40; i++) {
    const now = (await work(page)).thumbPaints;
    if (now === last) return;
    last = now;
    await page.waitForTimeout(500);
  }
  throw new Error('Las miniaturas no terminan de dibujarse');
}

/** Lo mínimo que se usa de un control dentro de la página (este proyecto no incluye los tipos del navegador). */
interface ControlHandle {
  value: string;
  dispatchEvent(event: unknown): boolean;
}

/** Una ráfaga de eventos `input` sobre un control, como un arrastre (con el valor de cada paso). */
async function dragThrough(control: Locator, values: string[]): Promise<void> {
  await control.evaluate((el: ControlHandle, steps: string[]) => {
    // El setter nativo: así React ve el valor como cambiado, igual que con una persona.
    const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set;
    if (!set) throw new Error('El control no tiene valor');
    for (const v of steps) {
      set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, values);
}

/** Soltar: el evento `change` nativo. */
async function release(control: Locator): Promise<void> {
  await control.evaluate((el: ControlHandle) => el.dispatchEvent(new Event('change', { bubbles: true })));
}

/** Dos cuadros de animación: lo que el limitador entrega en el cuadro siguiente ya llegó. */
const frames = (page: Page): Promise<void> => page.evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))');

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

  test('Ajustes y Ayuda: idioma, tamaño de la interfaz y «Acerca de»', async ({ page }) => {
    await open(page);
    // Tamaño de la interfaz: la raíz se escala y un arrastre sigue siendo exacto.
    await setUiScale(page, 125);
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
    await page.getByRole('button', { name: 'Ajustes' }).click();
    await page.getByRole('menuitem', { name: 'English' }).click();
    await expect(page.getByRole('button', { name: 'Print / export' })).toBeVisible();
    // «Acerca de».
    await page.getByRole('button', { name: 'Help' }).click();
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
  test('arrastrar un deslizador se ve en el lienzo sin tocar historial ni miniaturas, y se confirma una sola vez al soltar', async ({ page }) => {
    await openQuiet(page);
    await page.getByRole('tab', { name: 'Estilo' }).click();
    const slider = page.getByRole('slider', { name: 'Separación entre renglones (mm)' });
    await expect(slider).toBeVisible();
    await settled(page);
    const before = await work(page);
    expect(before.committedPitch).toBeNull();

    await dragThrough(slider, ['7', '8', '9', '10']);
    await frames(page);
    const during = await work(page);
    // El lienzo ve el último valor; el diseño confirmado, el historial, la revisión y las miniaturas, nada.
    expect(during.hasPreview).toBe(true);
    expect(during.previewPitch).toBe(10);
    expect(during.committedPitch).toBeNull();
    expect(during.past).toBe(before.past);
    expect(during.revision).toBe(before.revision);
    expect(during.thumbPaints).toBe(before.thumbPaints);
    // El control muestra lo arrastrado.
    await expect(page.getByRole('spinbutton', { name: 'Separación entre renglones (mm)' })).toHaveValue('10');

    await release(slider);
    await expect.poll(async () => (await work(page)).hasPreview).toBe(false);
    const after = await work(page);
    expect(after.committedPitch).toBe(10);
    expect(after.past).toBe(before.past + 1);
    expect(after.revision).toBe(before.revision + 1);

    // Un solo «Deshacer» lo quita todo.
    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await work(page)).committedPitch).toBeNull();
  });

  test('un selector de color en arrastre también es una vista previa y un solo paso de historial', async ({ page }) => {
    await openQuiet(page);
    await page.getByRole('tab', { name: 'Estilo' }).click();
    const color = page.locator('[data-reveal="role.title"] input[type="color"]');
    await expect(color).toBeVisible();
    await settled(page);
    const before = await work(page);

    await dragThrough(color, ['#112233', '#223344', '#334455']);
    await frames(page);
    const during = await work(page);
    expect(during.previewInk).toBe('#334455');
    expect(during.committedInk).toBe(before.committedInk);
    expect(during.past).toBe(before.past);
    expect(during.thumbPaints).toBe(before.thumbPaints);

    await release(color);
    await expect.poll(async () => (await work(page)).hasPreview).toBe(false);
    const after = await work(page);
    expect(after.committedInk).toBe('#334455');
    expect(after.past).toBe(before.past + 1);
  });

  test('un control que desaparece a mitad de un arrastre confirma lo arrastrado', async ({ page }) => {
    await openQuiet(page);
    await page.getByRole('tab', { name: 'Estilo' }).click();
    const slider = page.getByRole('slider', { name: 'Separación entre renglones (mm)' });
    await settled(page);
    const before = await work(page);
    await dragThrough(slider, ['8', '9']);
    await frames(page);
    expect((await work(page)).hasPreview).toBe(true);
    // Cambiar de pestaña desmonta el panel con el control en pleno arrastre.
    await page.getByRole('tab', { name: 'Secciones' }).click();
    await expect.poll(async () => (await work(page)).hasPreview).toBe(false);
    const after = await work(page);
    expect(after.committedPitch).toBe(9);
    expect(after.past).toBe(before.past + 1);
  });
});

/** Selecciona por el almacén el bloque `blockId` de la primera página que lo muestra y devuelve el tipo y la clave de esa página. */
async function selectBlock(page: Page, blockId: string): Promise<{ pageKey: string; pageType: string }> {
  const where = await page.evaluate<{ pageKey: string; pageType: string } | null>(`(() => {
    const wrap = document.querySelector('[data-block="${blockId}"]')?.closest('[data-page-key]');
    if (!wrap) return null;
    const where = { pageKey: wrap.getAttribute('data-page-key') ?? '', pageType: wrap.getAttribute('data-page-type') ?? '' };
    globalThis.__agenda.getState().setSelection({ ...where, blockId: '${blockId}', role: 'content' }, ['${blockId}']);
    return where;
  })()`);
  if (!where) throw new Error(`No hay un bloque ${blockId} a la vista`);
  return where;
}

/** Lo que el almacén sabe del ajuste de un bloque: en la vista previa, confirmado, y cuánto historial hay. */
interface BoxState {
  hasPreview: boolean;
  previewDw: number;
  committedDw: number | null;
  past: number;
  transform: string;
}
const boxState = (page: Page, blockId: string): Promise<BoxState> =>
  page.evaluate<BoxState>(`(() => {
    const s = globalThis.__agenda.getState();
    const find = (d) => d?.overrides.find((q) => q.blockId === '${blockId}');
    return {
      hasPreview: s.previewDesign !== null,
      previewDw: find(s.previewDesign)?.dw ?? 0,
      committedDw: find(s.design)?.dw ?? null,
      past: s.past.length,
      transform: document.querySelector('[data-block="${blockId}"]')?.getAttribute('transform') ?? '',
    };
  })()`);

test.describe('tiradores con reflujo en bloques del programa', () => {
  test('un tirador lateral ensancha el bloque reacomodando su contenido, con vista previa y un solo paso de historial', async ({ page }) => {
    await openQuiet(page);
    await toWeek(page);
    await settled(page);
    const where = await selectBlock(page, 'week.notes');
    const handle = page.locator(`[data-page-key="${where.pageKey}"] [data-handle="e"]`).first();
    await expect(handle).toBeVisible();
    const before = await boxState(page, 'week.notes');
    const box = (await handle.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 40, y, { steps: 8 });
    await frames(page);

    // Durante el arrastre: la vista previa lleva el ajuste de ancho, nada está confirmado y la página se
    // dibuja de nuevo (el bloque no lleva una transformación de escala: es contenido reacomodado, no deformado).
    const during = await boxState(page, 'week.notes');
    expect(during.hasPreview).toBe(true);
    expect(Math.abs(during.previewDw)).toBeGreaterThan(1);
    expect(during.committedDw).toBeNull();
    expect(during.past).toBe(before.past);
    expect(during.transform).not.toContain('scale(');

    await page.mouse.up();
    await expect.poll(async () => (await boxState(page, 'week.notes')).hasPreview).toBe(false);
    const after = await boxState(page, 'week.notes');
    expect(after.past).toBe(before.past + 1);
    expect(Math.abs(after.committedDw ?? 0)).toBeGreaterThan(1);

    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await boxState(page, 'week.notes')).committedDw).toBeNull();
  });
});

/** Lo que el almacén guarda de un texto de la persona, en vista previa y confirmado. */
interface PersonaState {
  previewName: string | null;
  committedName: string;
  past: number;
  hasPreview: boolean;
  editors: number;
}
const personaState = (page: Page): Promise<PersonaState> =>
  page.evaluate<PersonaState>(`(() => {
    const s = globalThis.__agenda.getState();
    return {
      previewName: s.previewDesign?.persona.name ?? null,
      committedName: s.design.persona.name,
      past: s.past.length,
      hasPreview: s.previewDesign !== null,
      editors: document.querySelectorAll('[data-text-editor]').length,
    };
  })()`);

test.describe('texto en su lugar', () => {
  test('doble clic edita un texto del programa: vista previa al escribir y un solo paso al confirmar', async ({ page }) => {
    await openQuiet(page);
    // La portada muestra el nombre solo si la persona tiene uno.
    await page.evaluate(`globalThis.__agenda.getState().update((d) => { d.persona.name = 'Norma'; }, 'e2e-name')`);
    const name = page.locator('[data-block="title.name"]').first();
    await expect(name).toBeVisible();
    const before = await personaState(page);
    await name.dblclick({ force: true });
    const editor = page.locator('[data-text-editor]');
    await expect(editor).toBeVisible();
    await expect(editor).toBeFocused();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('Ana María');
    await frames(page);

    const during = await personaState(page);
    expect(during.previewName).toBe('Ana María');
    expect(during.committedName).toBe(before.committedName);
    expect(during.past).toBe(before.past);
    expect(during.editors).toBe(1);

    // En un texto de un renglón, Enter confirma.
    await page.keyboard.press('Enter');
    await expect(editor).toHaveCount(0);
    const after = await personaState(page);
    expect(after.committedName).toBe('Ana María');
    expect(after.hasPreview).toBe(false);
    expect(after.past).toBe(before.past + 1);

    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await personaState(page)).committedName).toBe(before.committedName);
  });

  test('Esc descarta lo escrito y no deja vista previa', async ({ page }) => {
    await openQuiet(page);
    // La portada muestra el nombre solo si la persona tiene uno.
    await page.evaluate(`globalThis.__agenda.getState().update((d) => { d.persona.name = 'Norma'; }, 'e2e-name')`);
    const name = page.locator('[data-block="title.name"]').first();
    await name.dblclick({ force: true });
    const editor = page.locator('[data-text-editor]');
    await expect(editor).toBeFocused();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('Otro nombre');
    await frames(page);
    expect((await personaState(page)).previewName).toBe('Otro nombre');
    const before = await personaState(page);
    await page.keyboard.press('Escape');
    await expect(editor).toHaveCount(0);
    const after = await personaState(page);
    expect(after.hasPreview).toBe(false);
    expect(after.committedName).toBe(before.committedName);
    expect(after.past).toBe(before.past);
  });

  test('un texto propio crece con sus renglones si tiene alto automático', async ({ page }) => {
    await openQuiet(page);
    await page.evaluate(`globalThis.__agenda.getState().update((d) => {
      d.customBlocks.push({ id: 'e2e', pageType: 'titlePage', pageKey: null, kind: 'text', x: 20, y: 20, w: 40, h: 30, mirror: false, props: { text: 'Hola', size: 10, autoHeight: true } });
    }, 'e2e')`);
    const block = page.locator('[data-block="custom.e2e"]').first();
    await expect(block).toBeVisible();
    const h1 = (await block.boundingBox())!.height;
    await block.dblclick({ force: true });
    const editor = page.locator('[data-text-editor]');
    await expect(editor).toBeFocused();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('Primer renglón');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Segundo renglón');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Tercero');
    await frames(page);
    await page.keyboard.press('Control+Enter');
    await expect(editor).toHaveCount(0);
    const saved = await page.evaluate<string>(`globalThis.__agenda.getState().design.customBlocks.find((c) => c.id === 'e2e').props.text`);
    expect(saved).toBe('Primer renglón\nSegundo renglón\nTercero');
    await expect.poll(async () => (await page.locator('[data-block="custom.e2e"]').first().boundingBox())!.height).toBeGreaterThan(h1 * 2);
  });
});

test.describe('estilo propio de un elemento', () => {
  test('el panel cambia el dibujo y el grosor de sus líneas: un paso por cambio, con vista previa al arrastrar', async ({ page }) => {
    await openQuiet(page);
    await toWeek(page);
    await settled(page);
    await selectBlock(page, 'week.notes');
    const section = page.locator('[data-reveal="blockstyle"]');
    await expect(section).toBeVisible();
    const state = () => page.evaluate<{ styles: unknown[]; past: number; previewStyles: number | null }>(`(() => {
      const s = globalThis.__agenda.getState();
      return { styles: s.design.blockStyles, past: s.past.length, previewStyles: s.previewDesign ? s.previewDesign.blockStyles.length : null };
    })()`);
    const before = await state();
    expect(before.styles).toHaveLength(0);

    await section.locator('fieldset').first().locator('select').selectOption('dashed');
    await expect.poll(async () => (await state()).styles.length).toBe(1);
    const after = await state();
    expect(after.past).toBe(before.past + 1);
    expect(JSON.stringify(after.styles)).toContain('"pattern":"dashed"');

    // El grosor se ve mientras se arrastra y se confirma una sola vez al soltar.
    const slider = section.getByRole('slider').first();
    await dragThrough(slider, ['1', '2', '3']);
    await frames(page);
    const during = await state();
    expect(during.past).toBe(after.past);
    expect(during.previewStyles).toBe(1);
    await release(slider);
    await expect.poll(async () => (await state()).previewStyles).toBeNull();
    expect((await state()).past).toBe(after.past + 1);
    expect(JSON.stringify((await state()).styles)).toContain('"widthPt":3');

    // «Quitar el estilo propio» deja todo como estaba.
    await section.getByRole('button', { name: 'Quitar el estilo propio' }).click();
    await expect.poll(async () => (await state()).styles.length).toBe(0);
  });
});

test.describe('copiar, pegar y duplicar elementos propios', () => {
  test('Ctrl+C / Ctrl+V pega una copia corrida, Ctrl+D duplica y Ctrl+X corta; cada uno es un paso', async ({ page }) => {
    await openQuiet(page);
    await page.evaluate(`globalThis.__agenda.getState().update((d) => {
      d.customBlocks.push({ id: 'clip', pageType: 'titlePage', pageKey: null, kind: 'text', x: 20, y: 20, w: 40, h: 10, mirror: false, props: { text: 'Copiame', size: 10 } });
    }, 'e2e')`);
    await expect(page.locator('[data-block="custom.clip"]').first()).toBeVisible();
    await selectBlock(page, 'custom.clip');
    const blocks = () => page.evaluate<Array<{ id: string; x: number; y: number }>>(`globalThis.__agenda.getState().design.customBlocks.map((c) => ({ id: c.id, x: c.x, y: c.y }))`);
    const past = () => page.evaluate<number>('globalThis.__agenda.getState().past.length');
    const p0 = await past();

    await page.keyboard.press('Control+c');
    await page.keyboard.press('Control+v');
    await expect.poll(async () => (await blocks()).length).toBe(2);
    const pasted = (await blocks())[1]!;
    expect(pasted.id).not.toBe('clip');
    expect([pasted.x, pasted.y]).toEqual([25, 25]);
    expect(await past()).toBe(p0 + 1);
    // La copia queda seleccionada: Ctrl+D la duplica.
    await page.keyboard.press('Control+d');
    await expect.poll(async () => (await blocks()).length).toBe(3);
    // Ctrl+X corta la selección.
    await page.keyboard.press('Control+x');
    await expect.poll(async () => (await blocks()).length).toBe(2);
    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await blocks()).length).toBe(3);
  });
});

test.describe('enlaces por zona', () => {
  test('tocar el número de un día elige esa zona y su destino se cambia sin tocar los demás días', async ({ page }) => {
    await openQuiet(page);
    await page.evaluate(`globalThis.__agenda.getState().setShowLinks(true)`);
    for (let i = 0; i < 12 && (await page.locator('[data-page-type="yearOverview"]').count()) === 0; i++) await page.keyboard.press('PageDown');
    const zones = page.locator('[data-page-type="yearOverview"] [aria-label^="→"]');
    await expect(zones.first()).toBeVisible();
    const before = await zones.count();
    const past = () => page.evaluate<number>('globalThis.__agenda.getState().past.length');
    const p0 = await past();

    await zones.nth(8).click();
    const area = await page.evaluate<string>('globalThis.__agenda.getState().linkArea');
    expect(area).toMatch(/^(date|month):/);
    const fields = page.getByTestId('link-fields');
    await expect(fields).toContainText(area);
    await fields.getByRole('combobox', { name: 'Al tocarlo en el PDF' }).first().selectOption('none');

    await expect.poll(async () => page.evaluate<number>('globalThis.__agenda.getState().design.links.blocks.length')).toBe(1);
    const saved = await page.evaluate<{ area: string; mode: string }>('(() => { const l = globalThis.__agenda.getState().design.links.blocks[0]; return { area: l.area, mode: l.mode }; })()');
    expect(saved).toEqual({ area, mode: 'none' });
    expect(await past()).toBe(p0 + 1);
    // Solo esa zona desaparece: las demás conservan su enlace.
    await expect(zones).toHaveCount(before - 1);
  });
});

test.describe('tira inferior y filetes', () => {
  test('la rueda del mouse desplaza la tira de miniaturas a los costados', async ({ page }) => {
    await openQuiet(page);
    const strip = page.locator('[data-thumb="0"]').first().locator('xpath=ancestor::div[contains(@class,"overflow-x-auto")][1]');
    await expect(strip).toBeVisible();
    const left = () => strip.evaluate((el) => (el as unknown as { scrollLeft: number }).scrollLeft);
    expect(await left()).toBe(0);
    await strip.hover();
    await page.mouse.wheel(0, 600);
    await expect.poll(left).toBeGreaterThan(100);
    await page.mouse.wheel(0, -600);
    await expect.poll(left).toBeLessThan(50);
  });

  test('«Año» lleva al calendario anual y el menú de un mes oculta y vuelve a mostrar ese mes', async ({ page }) => {
    await openQuiet(page);
    await page.getByRole('button', { name: 'Año', exact: true }).click();
    await expect(page.locator('[data-page-type="yearOverview"]').first()).toBeVisible();

    const feb = page.getByRole('button', { name: 'Feb 27', exact: true });
    await expect(feb).toBeVisible();
    await feb.click({ button: 'right' });
    await expect(page.getByRole('menuitem', { name: 'Ir a la portada del mes' })).toBeVisible();
    await page.getByRole('menuitem', { name: 'Ocultar este mes de la agenda' }).click();
    await expect(feb).toHaveCount(0);
    const hidden = () => page.evaluate<string[]>('globalThis.__agenda.getState().design.calendar.hiddenMonths');
    expect(await hidden()).toEqual(['2027-02']);

    // Se vuelve a mostrar desde el panel de calendario.
    await page.getByRole('tab', { name: 'Calendario' }).click();
    await page.getByRole('button', { name: /Mostrar febrero 2027/i }).click();
    expect(await hidden()).toEqual([]);
    await expect(page.getByRole('button', { name: 'Feb 27', exact: true })).toBeVisible();
  });

  test('elegir un filete lleva solo al estilo de sus líneas, sin quitarle el foco a la página', async ({ page }) => {
    await openQuiet(page);
    await page.getByRole('button', { name: 'Año', exact: true }).click();
    await expect(page.locator('[data-page-type="yearOverview"]').first()).toBeVisible();
    await selectBlock(page, 'header.rule');
    const target = page.locator('[data-reveal="line.separator"]');
    await expect(target).toBeVisible();
    await expect(target).toHaveClass(/reveal-flash/);
    // El Inspector ofrece el mismo atajo para quien no tiene el panel de Estilo abierto.
    await expect(page.getByTestId('line-uses')).toBeVisible();
  });
});

test.describe('tiradores con escala y deformación', () => {
  const override = (page: Page, id: string): Promise<{ dw: number; dh: number; scale: number; scaleY: number | null; deform: boolean } | null> =>
    page.evaluate(`(() => { const o = globalThis.__agenda.getState().design.overrides.find((q) => q.blockId === '${id}'); return o ? { dw: o.dw, dh: o.dh, scale: o.scale, scaleY: o.scaleY, deform: o.deform } : null; })()`);

  test('con escala distinta de 1 los tiradores laterales siguen y reacomodan sin tocar la escala', async ({ page }) => {
    await openQuiet(page);
    await toWeek(page);
    await settled(page);
    const where = await selectBlock(page, 'week.notes');
    await page.evaluate(`globalThis.__agenda.getState().update((d) => { d.overrides.push({ pageType: '${where.pageType}', pageKey: null, blockId: 'week.notes', dx: 0, dy: 0, dw: 0, dh: 0, scale: 0.8, scaleY: null, deform: false, rotation: 0, opacity: 1, hidden: false }); }, 'e2e')`);
    const handle = page.locator(`[data-page-key="${where.pageKey}"] [data-handle="e"]`).first();
    await expect(handle).toBeVisible();
    const box = (await handle.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 40, y, { steps: 8 });
    await page.mouse.up();
    await expect.poll(async () => (await override(page, 'week.notes'))?.dw ?? 0).toBeLessThan(-1);
    const after = await override(page, 'week.notes');
    expect(after!.scale).toBe(0.8);
    expect(after!.deform).toBe(false);
  });

  test('«Permitir deformar» deja aplastar en cualquier dirección: cada eje con su escala', async ({ page }) => {
    await openQuiet(page);
    await toWeek(page);
    await settled(page);
    const where = await selectBlock(page, 'week.notes');
    await page.getByRole('checkbox', { name: 'Permitir deformar' }).check();
    await expect.poll(async () => (await override(page, 'week.notes'))?.deform).toBe(true);
    const handle = page.locator(`[data-page-key="${where.pageKey}"] [data-handle="s"]`).first();
    await expect(handle).toBeVisible();
    const box = (await handle.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y - 40, { steps: 8 });
    await page.mouse.up();
    await expect.poll(async () => (await override(page, 'week.notes'))?.scaleY ?? 1).toBeLessThan(0.95);
    const after = await override(page, 'week.notes');
    // Se aplastó solo a lo alto y la caja de la sección no se reacomodó.
    expect(after!.scale).toBe(1);
    expect(after!.dh).toBe(0);
    // Desactivarlo devuelve la proporción.
    await page.getByRole('checkbox', { name: 'Permitir deformar' }).uncheck();
    await expect.poll(async () => (await override(page, 'week.notes'))?.scaleY).toBeNull();
  });

  test('un texto nuevo se dibuja al tamaño que se elige; «Ajustar al recuadro» lo achica y lo dice', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Texto', exact: true }).first().click();
    const prop = () => page.evaluate<Record<string, unknown>>('globalThis.__agenda.getState().design.customBlocks.at(-1).props');
    expect((await prop()).fit).toBe(false);
    // Un tamaño enorme en un recuadro chico: no se achica por su cuenta.
    await page.evaluate(`globalThis.__agenda.getState().update((d) => { const c = d.customBlocks.at(-1); c.props = { ...c.props, size: 80, autoHeight: false, text: 'Hola mundo grande' }; c.h = 10; }, 'e2e-size')`);
    await expect(page.getByText(/Se dibuja a/)).toHaveCount(0);
    await page.getByRole('checkbox', { name: 'Ajustar la letra al recuadro' }).check();
    await expect(page.getByText(/Se dibuja a .* pt para que entre en el recuadro/)).toBeVisible();
    expect((await prop()).fit).toBeUndefined();
  });
});

test.describe('copiar elementos del programa', () => {
  test('Ctrl+C / Ctrl+V sobre un texto del programa pega un texto propio editable; sobre un marco, un dibujo', async ({ page }) => {
    await openQuiet(page);
    await toWeek(page);
    await settled(page);
    const owned = () => page.evaluate<Array<{ kind: string; text?: string }>>(`globalThis.__agenda.getState().design.customBlocks.map((c) => ({ kind: c.kind, text: c.props.text }))`);

    await selectBlock(page, 'week.title');
    await page.keyboard.press('Control+c');
    await page.keyboard.press('Control+v');
    await expect.poll(async () => (await owned()).length).toBe(1);
    const text = (await owned())[0]!;
    expect(text.kind).toBe('text');
    expect(String(text.text).toUpperCase()).toContain('SEMANA');

    // La copia es un texto propio: se edita con doble clic como cualquier otro.
    const copy = page.locator('[data-block^="custom."]').first();
    await expect(copy).toBeVisible();
    await copy.dblclick({ force: true });
    await expect(page.locator('[data-text-editor]')).toBeFocused();
    await page.keyboard.press('Escape');

    await selectBlock(page, 'week.minical');
    await page.keyboard.press('Control+c');
    await page.keyboard.press('Control+v');
    await expect.poll(async () => (await owned()).length).toBe(2);
    expect((await owned())[1]!.kind).toBe('drawing');
    // El original sigue donde estaba.
    await expect(page.locator('[data-block="week.minical"]').first()).toBeVisible();
  });
});

test.describe('atajos de teclado', () => {
  test('Ctrl+F busca, Ctrl+3 cambia de pestaña, Inicio y Fin cambian de página', async ({ page }) => {
    await openQuiet(page);
    await page.keyboard.press('Control+f');
    await expect(page.getByRole('dialog').or(page.getByRole('combobox')).first()).toBeVisible();
    await page.keyboard.press('Escape');

    await page.keyboard.press('Control+3');
    await expect(page.locator('[data-sidebar="methods"]')).toBeVisible();
    await page.keyboard.press('Control+7');
    await expect(page.locator('[data-sidebar="fonts"]')).toBeVisible();
    // La impresión es de su propio modo: pedirla desde el diseño lo cambia.
    await page.keyboard.press('Control+8');
    await expect(page.locator('[data-sidebar="print"]')).toBeVisible();
    expect(await page.evaluate<string>('globalThis.__agenda.getState().mode')).toBe('print');

    const index = () => page.evaluate<number>('globalThis.__agenda.getState().pageIndex');
    await page.keyboard.press('End');
    await expect.poll(index).toBeGreaterThan(100);
    await page.keyboard.press('Home');
    await expect.poll(index).toBe(0);
    await page.keyboard.press('PageDown');
    await expect.poll(index).toBe(1);
  });

  test('F1 abre la lista de atajos, que sale del registro, y Esc la cierra', async ({ page }) => {
    await openQuiet(page);
    await page.keyboard.press('F1');
    const dialog = page.getByRole('dialog', { name: 'Atajos de teclado' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Buscar en la interfaz')).toBeVisible();
    await expect(dialog.getByText('Ctrl+F', { exact: false }).first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });

  test('Ctrl+A elige todos los elementos de la página, Esc los suelta y el menú Edición muestra las teclas', async ({ page }) => {
    await openQuiet(page);
    await toWeek(page);
    await settled(page);
    await page.keyboard.press('Control+a');
    await expect.poll(() => page.evaluate<number>('globalThis.__agenda.getState().selectedIds.length')).toBeGreaterThan(3);
    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate<number>('globalThis.__agenda.getState().selectedIds.length')).toBe(0);

    await page.getByRole('button', { name: 'Edición', exact: true }).click();
    await expect(page.getByRole('menuitem', { name: /Deshacer/ })).toContainText('Ctrl+Z');
    await expect(page.getByRole('menuitem', { name: /Elegir todos los elementos/ })).toContainText('Ctrl+A');
  });

  test('con un elemento propio elegido, las flechas lo mueven y Enter edita su texto; sin nada elegido las flechas pasan de página', async ({ page }) => {
    await openQuiet(page);
    await page.evaluate(`globalThis.__agenda.getState().update((d) => { d.customBlocks.push({ id: 'kb', pageType: 'titlePage', pageKey: null, kind: 'text', x: 20, y: 20, w: 40, h: 10, mirror: false, props: { text: 'Hola' } }); }, 'e2e')`);
    await expect(page.locator('[data-block="custom.kb"]').first()).toBeVisible();
    await selectBlock(page, 'custom.kb');
    const x = () => page.evaluate<number>(`globalThis.__agenda.getState().design.customBlocks.find((c) => c.id === 'kb').x`);
    const x0 = await x();
    await page.keyboard.press('ArrowRight');
    await expect.poll(x).toBeCloseTo(x0 + 0.5, 3);
    await page.keyboard.press('Shift+ArrowRight');
    await expect.poll(x).toBeCloseTo(x0 + 5.5, 3);
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-text-editor]')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-text-editor]')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => page.evaluate<number>('globalThis.__agenda.getState().pageIndex')).toBe(1);
  });
});

test.describe('avisos, ocultos y encuadre', () => {
  test('el pie de la página cuenta sus avisos, lleva a la verificación y la miniatura lleva un punto', async ({ page }) => {
    await openQuiet(page);
    await expect(page.getByTestId('page-warnings')).toHaveCount(0);
    // Un texto con letra enorme en un recuadro chico no entra: avisa.
    await page.evaluate(`globalThis.__agenda.getState().update((d) => { d.customBlocks.push({ id: 'big', pageType: 'titlePage', pageKey: null, kind: 'text', x: 20, y: 20, w: 30, h: 8, mirror: false, props: { text: 'Un texto muy largo que no puede entrar en un recuadro tan chico', size: 60, fit: false, autoHeight: false } }); }, 'e2e-warn')`);
    const counter = page.getByTestId('page-warnings');
    await expect(counter).toBeVisible();
    await expect(counter).toContainText(/\d+ avisos/);
    await expect(page.getByTestId('thumb-warning').first()).toBeVisible();
    await counter.click();
    // Abre el panel del elemento en la verificación previa y la corre.
    await expect(page.locator('[data-inspector] [data-reveal="preflight"]')).toBeVisible();
    await expect(page.locator('[data-inspector] [data-reveal="preflight"]').getByText(/\d+ avisos/)).toBeVisible();
  });

  test('Edición › Mostrar elementos ocultos lista lo que se ocultó y lo devuelve', async ({ page }) => {
    await openQuiet(page);
    await toWeek(page);
    await settled(page);
    await page.getByRole('button', { name: 'Edición', exact: true }).click();
    await expect(page.getByRole('menuitem', { name: /Mostrar elementos ocultos/ })).toBeDisabled();
    await page.keyboard.press('Escape');
    await selectBlock(page, 'week.notes');
    await page.keyboard.press('Control+h');
    await expect(page.locator('[data-block="week.notes"]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Edición', exact: true }).click();
    await page.getByRole('menuitem', { name: /Mostrar elementos ocultos/ }).click();
    const list = page.getByTestId('hidden-list');
    await expect(list).toBeVisible();
    await list.getByRole('button', { name: 'Mostrar', exact: true }).click();
    // Sin nada más que mostrar, el diálogo se cierra y el elemento vuelve.
    await expect(page.getByTestId('hidden-list')).toHaveCount(0);
    await expect(page.locator('[data-block="week.notes"]').first()).toBeVisible();
    expect(await page.evaluate<number>("globalThis.__agenda.getState().design.overrides.filter((o) => o.blockId === 'week.notes').length")).toBe(0);
  });

  test('Ctrl+Mayús+2 acerca la vista al elemento elegido y lo deja a la vista', async ({ page }) => {
    await openQuiet(page);
    await toWeek(page);
    await settled(page);
    await selectBlock(page, 'week.notes');
    const zoom0 = await page.evaluate<number>('globalThis.__agenda.getState().zoom');
    await page.keyboard.press('Control+Shift+Digit2');
    await expect.poll(() => page.evaluate<number>('globalThis.__agenda.getState().zoom')).toBeGreaterThan(zoom0 * 1.2);
    // El elemento queda dentro del área visible del lienzo.
    await expect
      .poll(async () => {
        const b = await page.locator('[data-block="week.notes"]').first().boundingBox();
        const area = await page.locator('.desk').boundingBox();
        return Boolean(b && area && b.x >= area.x - 1 && b.y >= area.y - 1 && b.x + b.width <= area.x + area.width + 1 && b.y + b.height <= area.y + area.height + 1);
      })
      .toBe(true);
  });
});

test.describe('modos y destino', () => {
  const sheet = (page: Page) => page.getByRole('button', { name: 'Hoja impresa', exact: true });

  test('Diseño y Impresión ofrecen cada uno sus vistas y pestañas; imprimir muestra las franjas de imprenta', async ({ page }) => {
    await openQuiet(page);
    // Diseño: libro sí, hoja impresa y pestaña de impresión no.
    await expect(page.getByRole('button', { name: 'Libro', exact: true })).toBeVisible();
    await expect(sheet(page)).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Impresión' })).toHaveCount(0);
    await expect(page.getByTestId('press-guides')).toHaveCount(0);

    await page.getByRole('button', { name: 'Impresión', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Impresión' })).toHaveAttribute('aria-selected', 'true');
    await expect(sheet(page)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Libro', exact: true })).toHaveCount(0);
    await expect(page.getByTestId('press-guides').first()).toBeVisible();
    await expect(page.getByTestId('press-legend')).toContainText('No se imprime');

    await page.getByRole('button', { name: 'Diseño', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Impresión' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Libro', exact: true })).toBeVisible();
    await expect(page.getByTestId('press-guides')).toHaveCount(0);
  });

  test('Ctrl+E abre Impresión desde el diseño; la hoja impresa vuelve a «página doble» en Diseño', async ({ page }) => {
    await openQuiet(page);
    await page.keyboard.press('Control+e');
    await expect(page.getByRole('tab', { name: 'Impresión' })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('button', { name: 'Hoja impresa', exact: true }).click();
    await expect.poll(() => page.evaluate<string>('globalThis.__agenda.getState().view')).toBe('sheet');
    await page.getByRole('button', { name: 'Diseño', exact: true }).click();
    await expect.poll(() => page.evaluate<string>('globalThis.__agenda.getState().view')).toBe('spread');
  });

  test('«Leer en pantalla» quita la costura, las hojas y las opciones de imprenta, y se puede volver', async ({ page }) => {
    await openQuiet(page);
    await page.getByRole('button', { name: 'Impresión', exact: true }).click();
    const nonPrintable = () => page.getByRole('spinbutton', { name: 'Zona no imprimible' });
    const content = () => page.evaluate<number>('globalThis.__agenda.getState().design.binding.gutter');
    expect(await content()).toBeGreaterThanOrEqual(0);

    await page.getByRole('button', { name: 'Leer en pantalla', exact: true }).click();
    await expect.poll(() => page.evaluate<string>('globalThis.__agenda.getState().design.binding.target')).toBe('screen');
    await expect(page.getByRole('button', { name: 'PDF para leer en pantalla' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Hoja de calibración' })).toHaveCount(0);
    await expect(nonPrintable()).toHaveCount(0);
    await expect(sheet(page)).toHaveCount(0);
    await expect(page.getByTestId('press-guides')).toHaveCount(0);
    // Lo guardado no se perdió: al volver a imprimir está todo como estaba.
    await page.getByRole('button', { name: 'Imprimir y encuadernar', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Hoja de calibración' })).toBeVisible();
    await expect(sheet(page)).toBeVisible();
  });

  test('con la hoja impresa a la vista, pasar a «Leer en pantalla» vuelve a la página doble', async ({ page }) => {
    await openQuiet(page);
    await page.getByRole('button', { name: 'Impresión', exact: true }).click();
    await sheet(page).click();
    await expect(page.getByRole('button', { name: /Dar vuelta la hoja/ })).toBeVisible();
    await page.getByRole('button', { name: 'Leer en pantalla', exact: true }).click();
    await expect(sheet(page)).toHaveCount(0);
    await expect(page.locator('[data-page-index]').first()).toBeVisible();
  });
});

test.describe('elementos compuestos', () => {
  const last = (page: Page) => page.evaluate<{ kind: string; props: Record<string, unknown> }>('(() => { const c = globalThis.__agenda.getState().design.customBlocks.at(-1); return { kind: c.kind, props: c.props }; })()');

  test('se agregan desde el panel, se editan sus campos y se dibujan en la página', async ({ page }) => {
    await openQuiet(page);
    const add = page.getByTestId('add-elements');
    await add.getByRole('button', { name: 'Tabla' }).click();
    expect((await last(page)).kind).toBe('table');
    await expect(page.locator('[data-block^="custom."]').first()).toBeVisible();

    await page.getByRole('spinbutton', { name: 'Filas' }).fill('8');
    await expect.poll(async () => (await last(page)).props.rows).toBe(8);
    await page.getByRole('textbox').filter({ hasText: /Columna 1/ }).fill('Día\nTarea\nHecho');
    await expect.poll(async () => (await last(page)).props.headers).toEqual(['Día', 'Tarea', 'Hecho']);

    await add.getByRole('button', { name: 'Valoración' }).click();
    expect((await last(page)).kind).toBe('rating');
    await page.getByRole('spinbutton', { name: 'Cantidad' }).fill('7');
    await expect.poll(async () => (await last(page)).props.count).toBe(7);
    await page.getByRole('button', { name: 'Corazones' }).click();
    await expect.poll(async () => (await last(page)).props.shape).toBe('heart');
  });

  test('cada tipo se puede agregar desde el menú de la página y queda elegido', async ({ page }) => {
    await openQuiet(page);
    const kinds = ['table', 'checklist', 'habits', 'finance', 'minical', 'quadrants', 'notes', 'timeline', 'rating', 'qr'];
    const names = ['Tabla', 'Lista de pendientes', 'Seguimiento de hábitos', 'Finanzas', 'Minicalendario', 'Cuadrantes', 'Notas', 'Horario del día', 'Valoración', 'Código QR'];
    for (const [i, name] of names.entries()) {
      await page.locator('[data-page-index]').first().click({ button: 'right', position: { x: 30, y: 30 } });
      await page.getByRole('menuitem', { name, exact: true }).click();
      expect((await last(page)).kind).toBe(kinds[i]);
      // Se agrega en el lugar del clic: se quita para que el próximo clic derecho caiga en la página y no sobre él.
      await page.evaluate("globalThis.__agenda.getState().update((d) => { d.customBlocks.pop(); }, 'e2e-pop')");
      await expect(page.locator('[data-block^="custom."]')).toHaveCount(0);
    }
  });
});

test.describe('capas y fusión', () => {
  const overrideOf = (page: Page, id: string) =>
    page.evaluate<Record<string, unknown> | null>(`(globalThis.__agenda.getState().design.overrides.find((o) => o.blockId === ${JSON.stringify(id)}) ?? null)`);

  test('el panel de capas lista los elementos de arriba hacia abajo y los sube y baja', async ({ page }) => {
    await openQuiet(page);
    await toWeek(page);
    await settled(page);
    await page.getByRole('button', { name: 'Capas', exact: true }).click();
    const rows = page.getByTestId('layer-row');
    await expect(rows.first()).toBeVisible();
    const order = async () => rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-block-id')));
    const before = await order();
    expect(before.length).toBeGreaterThan(4);
    // Elige el segundo de la lista y lo sube: pasa a ser el primero.
    const second = before[1]!;
    await rows.nth(1).getByRole('button', { name: 'Subir una capa' }).click();
    await expect.poll(order).toEqual([second, before[0], ...before.slice(2)]);
    expect(await overrideOf(page, second)).toMatchObject({ layer: expect.any(Number) });
    // «Restablecer el orden» deja todo como lo da la sección.
    await page.getByRole('button', { name: 'Restablecer el orden' }).click();
    await expect.poll(order).toEqual(before);
    expect(await overrideOf(page, second)).toBeNull();
  });

  test('un renglón del panel elige el elemento, y Ctrl+↑ / Ctrl+↓ lo mueven en el apilado', async ({ page }) => {
    await openQuiet(page);
    await toWeek(page);
    await settled(page);
    await page.getByRole('button', { name: 'Capas', exact: true }).click();
    const rows = page.getByTestId('layer-row');
    const order = async () => rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-block-id')));
    const before = await order();
    const target = before[3]!;
    await page.locator(`[data-testid="layer-row"][data-block-id="${target}"]`).getByRole('button').nth(1).click();
    await expect.poll(() => page.evaluate<string | undefined>('globalThis.__agenda.getState().selection?.blockId')).toBe(target);
    await page.keyboard.press('Control+ArrowUp');
    await expect.poll(async () => (await order()).indexOf(target)).toBe(2);
    await page.keyboard.press('Control+Shift+ArrowDown');
    await expect.poll(async () => (await order()).indexOf(target)).toBe(before.length - 1);
    await page.keyboard.press('Control+Shift+ArrowUp');
    await expect.poll(async () => (await order()).indexOf(target)).toBe(0);
  });

  test('un elemento se renombra con doble clic y el nombre se ve en el panel y en su campo', async ({ page }) => {
    await openQuiet(page);
    await toWeek(page);
    await settled(page);
    await page.getByRole('button', { name: 'Capas', exact: true }).click();
    // Uno editable (los fijos no se renombran): los que tienen el ojo para ocultarlos lo son.
    const row = page.getByTestId('layer-row').filter({ has: page.getByRole('button', { name: 'Ocultar en la página' }) }).first();
    const id = (await row.getAttribute('data-block-id'))!;
    await row.locator('button[title^="Renombrar"]').dblclick();
    const field = page.getByTestId('layers-panel').getByRole('textbox', { name: 'Nombre' });
    await field.fill('Mi nombre');
    await field.blur();
    await expect(page.locator(`[data-testid="layer-row"][data-block-id="${id}"]`)).toContainText('Mi nombre');
    expect(await overrideOf(page, id)).toMatchObject({ label: 'Mi nombre' });
  });

  test('clic derecho en una capa: bloquear (no se mueve ni se oculta), desbloquear, y fusión y opacidad a mano', async ({ page }) => {
    await openQuiet(page);
    await toWeek(page);
    await settled(page);
    await page.getByRole('button', { name: 'Capas', exact: true }).click();
    const row = page.getByTestId('layer-row').filter({ has: page.getByRole('button', { name: 'Ocultar en la página' }) }).first();
    const id = (await row.getAttribute('data-block-id'))!;
    const sameRow = page.locator(`[data-testid="layer-row"][data-block-id="${id}"]`);
    await row.click({ button: 'right' });
    await page.getByRole('menuitem', { name: /^Bloquear/ }).click();
    await expect(sameRow).toHaveAttribute('data-locked', 'true');
    expect(await overrideOf(page, id)).toMatchObject({ locked: true });
    // Elegido, las flechas no lo mueven y Suprimir no lo oculta.
    await expect.poll(() => page.evaluate<string | undefined>('globalThis.__agenda.getState().selection?.blockId')).toBe(id);
    await page.evaluate('document.activeElement?.blur?.()');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Delete');
    expect(await overrideOf(page, id)).toMatchObject({ dx: 0, hidden: false, locked: true });
    // En la página no tiene tiradores.
    await expect(page.locator('[data-handle]')).toHaveCount(0);
    // Debajo de la lista: fusión, opacidad y el bloqueo del elegido.
    const fields = page.getByTestId('layers-panel').getByTestId('stack-fields');
    await expect(fields.getByRole('checkbox', { name: /^Bloquear/ })).toBeChecked();
    const opacity = fields.getByRole('spinbutton', { name: 'Opacidad' });
    await opacity.fill('50');
    await opacity.press('Enter');
    await expect.poll(async () => (await overrideOf(page, id))?.opacity).toBeCloseTo(0.5, 5);
    await fields.getByRole('combobox', { name: 'Fusión con lo de abajo' }).selectOption('multiply');
    await expect.poll(async () => (await overrideOf(page, id))?.blend).toBe('multiply');
    await page.screenshot({ path: 'test-results/layers-lock.png' });
    // El candado de la fila lo desbloquea.
    await sameRow.getByRole('button', { name: 'Desbloquear' }).click();
    await expect(sameRow).not.toHaveAttribute('data-locked', 'true');
    expect(await overrideOf(page, id)).toMatchObject({ locked: false });
  });

  test('clic derecho en una capa propia: duplicar deja una copia corrida 5 mm, con un id nuevo', async ({ page }) => {
    await openQuiet(page);
    await page.getByTestId('add-elements').locator('..').getByRole('button', { name: 'Forma', exact: true }).click();
    const blocks = () => page.evaluate<Array<{ id: string; x: number; y: number }>>('globalThis.__agenda.getState().design.customBlocks.map((c) => ({ id: c.id, x: c.x, y: c.y }))');
    const [first] = await blocks();
    await page.getByRole('button', { name: 'Capas', exact: true }).click();
    const row = page.locator(`[data-testid="layer-row"][data-block-id="custom.${first!.id}"]`);
    await row.click({ button: 'right' });
    await expect(page.getByRole('menuitem', { name: 'Al frente' })).toBeVisible();
    await page.getByRole('menuitem', { name: 'Duplicar', exact: true }).click();
    await expect.poll(async () => (await blocks()).length).toBe(2);
    const copy = (await blocks())[1]!;
    expect(copy.id).not.toBe(first!.id);
    expect(copy.x).toBeCloseTo(first!.x + 5, 1);
    expect(copy.y).toBeCloseTo(first!.y + 5, 1);
  });

  test('el modo de fusión se aplica a la página de verdad (el navegador lo dibuja con mix-blend-mode)', async ({ page }) => {
    await openQuiet(page);
    await toWeek(page);
    await settled(page);
    await selectBlock(page, 'week.notes');
    await page.getByRole('combobox', { name: 'Fusión con lo de abajo' }).selectOption('multiply');
    await expect.poll(async () => (await overrideOf(page, 'week.notes'))?.blend).toBe('multiply');
    // Si la política de seguridad bloqueara el estilo, el modo calculado seguiría siendo «normal».
    const blendOf = () => page.evaluate<string>(`getComputedStyle(document.querySelector('[data-block="week.notes"]')).mixBlendMode`);
    await expect.poll(blendOf).toBe('multiply');
    await page.getByRole('combobox', { name: 'Fusión con lo de abajo' }).selectOption('normal');
    await expect.poll(blendOf).toBe('normal');
  });
});

test.describe('imágenes y fuentes', () => {
  test('cada imagen dice dónde se usa y al quitarla se va de todo lo que la usaba', async ({ page }) => {
    await openQuiet(page);
    await page.evaluate(`globalThis.__agenda.getState().update((d) => {
      d.assets.push({ id: 'img-e2e', name: 'Imagen de prueba', kind: 'vector', mime: 'image/svg+xml', width: 10, height: 10, builtin: null });
      d.assets.push({ id: 'img-sola', name: 'Imagen sola', kind: 'vector', mime: 'image/svg+xml', width: 10, height: 10, builtin: null });
      d.cover.imageAssetId = 'img-e2e';
      d.customBlocks.push({ id: 'pic', pageType: 'titlePage', pageKey: null, kind: 'image', x: 20, y: 20, w: 30, h: 30, mirror: true, props: { assetId: 'img-e2e', label: 'Mi foto' } });
    }, 'e2e-asset')`);
    await page.getByRole('tab', { name: 'Recursos / Vectores', exact: true }).click();
    const uses = page.locator('[data-testid="asset-uses"][data-asset="img-e2e"]');
    await expect(uses).toContainText('Tapa');
    await expect(uses).toContainText('Elemento «Mi foto»');
    await expect(page.locator('[data-testid="asset-uses"][data-asset="img-sola"]')).toContainText('No se usa en ningún lugar');
    // «Ir» lleva a la página del elemento.
    await page.evaluate('globalThis.__agenda.getState().goToPage(5)');
    await uses.getByRole('button', { name: 'Ir' }).click();
    await expect.poll(() => page.evaluate<number>('globalThis.__agenda.getState().pageIndex')).toBe(0);
    // Quitarla es un solo paso, y se deshace de una vez.
    await page.locator('li', { has: page.locator('[data-asset="img-e2e"]') }).getByRole('button', { name: 'Quitar la imagen y todo lo que la usa' }).click();
    const gone = () => page.evaluate<{ assets: number; cover: string | null; blocks: number }>(`(() => { const d = globalThis.__agenda.getState().design; return { assets: d.assets.filter((a) => a.id === 'img-e2e').length, cover: d.cover.imageAssetId, blocks: d.customBlocks.filter((c) => c.id === 'pic').length }; })()`);
    expect(await gone()).toEqual({ assets: 0, cover: null, blocks: 0 });
    await page.keyboard.press('Control+z');
    await expect.poll(gone).toEqual({ assets: 1, cover: 'img-e2e', blocks: 1 });
  });

  test('una fuente sin puntuación (como la de una camiseta): los signos salen de la de reserva, sin avisos, y Estilo y Fuentes lo explican', async ({ page }) => {
    await openQuiet(page);
    // Una fuente con letras y números pero sin ningún signo (e2e/fixtures: Manrope reducida y renombrada).
    await page.keyboard.press('Control+7');
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Subir fuentes' }).click()]);
    await chooser.setFiles('e2e/fixtures/dorsal-prueba.ttf');
    const item = page.getByTestId('font-list').locator('[data-font="Dorsal Prueba"]');
    await expect(item).toBeVisible();
    // Un texto con coma y paréntesis en la primera página.
    await page.evaluate(`globalThis.__agenda.getState().update((d) => { d.customBlocks.push({ id: 'coma', pageType: 'titlePage', pageKey: null, kind: 'text', x: 20, y: 30, w: 100, h: 14, mirror: true, props: { text: 'Hola, mundo (2027)' } }); }, 'e2e-coma')`);
    // Se la elige para el texto corrido desde Estilo: avisa que no tiene puntuación y de dónde salen los signos.
    await page.getByRole('tab', { name: 'Estilo', exact: true }).click();
    await page.getByRole('combobox', { name: 'Texto', exact: true }).selectOption('Dorsal Prueba');
    const note = page.getByTestId('punctuation-body');
    await expect(note).toContainText('salen de Manrope');
    await expect(note).toContainText(', .');
    await note.scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'test-results/punctuation-note.png' });
    // La página no tiene avisos: la coma y los paréntesis se dibujaron con Manrope.
    const footer = page.getByTestId('page-footer');
    await expect(footer).toBeVisible();
    await expect(page.locator('[data-block="custom.coma"]')).toBeVisible();
    await expect(page.getByTestId('page-warnings')).toHaveCount(0);
    // Un signo que no tiene ninguna fuente sí avisa, con el nombre de la fuente.
    await page.evaluate(`globalThis.__agenda.getState().update((d) => { d.customBlocks.find((c) => c.id === 'coma').props.text = 'Hola, mundo ✓'; }, 'e2e-coma2')`);
    await expect(page.getByTestId('page-warnings')).toBeVisible();
    await page.getByTestId('page-warnings').click();
    await expect(page.locator('[data-reveal="preflight"]')).toContainText('Ni la fuente Dorsal Prueba ni las de reserva tienen estos caracteres: ✓');
    // En Fuentes: lo que toma de Manrope, sin marcarlo como faltante.
    await page.keyboard.press('Control+7');
    await expect(item.getByTestId('font-borrowed')).toContainText('salen de Manrope');
    await item.scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'test-results/font-borrowed.png' });
  });

  test('la pestaña de fuentes lista las familias, y el buscador encuentra una fuente', async ({ page }) => {
    await openQuiet(page);
    await page.keyboard.press('Control+7');
    await expect(page.getByRole('tab', { name: 'Fuentes', exact: true })).toHaveAttribute('aria-selected', 'true');
    const list = page.getByTestId('font-list');
    await expect(list.locator('[data-font="Manrope"]')).toBeVisible();
    await expect(list.locator('[data-font="Manrope"]')).toContainText('integrada');
    // Cada familia dice dónde se usa o si le faltan caracteres.
    await expect(list.locator('[data-font="Manrope"]')).toContainText(/Se usa en|Tiene todos los caracteres|Le faltan/);
    // Desde otra pestaña, el buscador lleva a la fuente.
    await page.getByRole('tab', { name: 'Estilo', exact: true }).click();
    await page.keyboard.press('Control+f');
    await page.getByRole('combobox').or(page.getByRole('textbox', { name: /Buscar/ })).first().fill('Manrope');
    await expect(page.getByText('Fuente', { exact: true }).first()).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('tab', { name: 'Fuentes', exact: true })).toHaveAttribute('aria-selected', 'true');
  });
});

test.describe('arreglos de la 2.4', () => {
  test('una capa se renombra con el teclado: F2 abre el campo, Enter guarda y Esc deja todo como estaba', async ({ page }) => {
    await openQuiet(page);
    await toWeek(page);
    await settled(page);
    await page.getByRole('button', { name: 'Capas', exact: true }).click();
    const row = page.getByTestId('layer-row').filter({ has: page.getByRole('button', { name: 'Ocultar en la página' }) }).first();
    const id = (await row.getAttribute('data-block-id'))!;
    const name = row.locator('button[title^="Renombrar"]');
    await name.focus();
    await page.keyboard.press('F2');
    const field = row.getByRole('textbox', { name: 'Nombre' });
    await expect(field).toBeFocused();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('Con teclado');
    await page.keyboard.press('Enter');
    await expect(row).toContainText('Con teclado');
    // El foco vuelve a la fila: se puede seguir con el teclado.
    await expect(name).toBeFocused();
    const label = () => page.evaluate<string | null>(`globalThis.__agenda.getState().design.overrides.find((o) => o.blockId === ${JSON.stringify(id)})?.label ?? null`);
    expect(await label()).toBe('Con teclado');
    await page.keyboard.press('F2');
    await page.keyboard.press('Control+A');
    await page.keyboard.type('No va');
    await page.keyboard.press('Escape');
    await expect(row).toContainText('Con teclado');
    expect(await label()).toBe('Con teclado');
  });

  test('copiar desde el menú Edición y pegar con Ctrl+V pega los elementos', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openQuiet(page);
    await toWeek(page);
    await settled(page);
    await selectBlock(page, 'week.notes');
    const count = () => page.evaluate<number>('globalThis.__agenda.getState().design.customBlocks.length');
    const before = await count();
    await page.getByRole('button', { name: 'Edición', exact: true }).click();
    await page.getByRole('menuitem', { name: /^Copiar/ }).click();
    // Lo que el menú escribió en el portapapeles es el texto de lo copiado: Ctrl+V lo reconoce y pega los elementos.
    await page.locator('.desk').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+V');
    await expect.poll(count).toBe(before + 1);
  });

  test('en una página izquierda espejada, deformar «por tipo» deja el elemento donde se soltó y la derecha queda espejada', async ({ page }) => {
    await openQuiet(page);
    // El resumen del año cae a los dos lados (páginas 8 y 9): sus ajustes «por tipo» se espejan en la izquierda.
    await page.evaluate('globalThis.__agenda.getState().goToPage(7)');
    const spread = async () =>
      page.evaluate<{ verso: string | null; recto: string | null }>(`(() => {
        const pages = [...document.querySelectorAll('.desk [data-page-type="yearOverview"]')];
        const pick = (odd) => pages.find((el) => Number(el.getAttribute('data-page-index')) % 2 === (odd ? 1 : 0))?.getAttribute('data-page-key') ?? null;
        return { verso: pick(true), recto: pick(false) };
      })()`);
    await expect.poll(async () => { const s = await spread(); return Boolean(s.verso && s.recto); }).toBe(true);
    const { verso, recto } = await spread();
    await settled(page);
    // La caja del elemento es la de sus tiradores (el dibujo de las letras puede ser más chico).
    const boxOf = async (key: string) => {
      await page.evaluate(`globalThis.__agenda.getState().setSelection({ pageKey: ${JSON.stringify(key)}, pageType: 'yearOverview', blockId: 'header.title', role: 'content' }, ['header.title'])`);
      const pageBox = (await page.locator(`.desk [data-page-key="${key}"]`).first().boundingBox())!;
      const nw = (await page.locator(`[data-page-key="${key}"] [data-handle="nw"]`).first().boundingBox())!;
      const se = (await page.locator(`[data-page-key="${key}"] [data-handle="se"]`).first().boundingBox())!;
      const cx = (b: { x: number; width: number }) => b.x + b.width / 2;
      const cy = (b: { y: number; height: number }) => b.y + b.height / 2;
      return { left: cx(nw) - pageBox.x, top: cy(nw) - pageBox.y, right: cx(se) - pageBox.x, bottom: cy(se) - pageBox.y, pw: pageBox.width, se: { x: cx(se), y: cy(se) } };
    };
    const v0 = await boxOf(verso!);
    const r0 = await boxOf(recto!);
    await page.evaluate(`globalThis.__agenda.getState().update((d) => { d.overrides.push({ pageType: 'yearOverview', pageKey: null, blockId: 'header.title', dx: 6, dy: 4, dw: 0, dh: 0, scale: 0.8, scaleY: null, deform: true, rotation: 0, opacity: 1, hidden: false }); }, 'e2e')`);
    // Sin imán: que nada corra el punto donde se suelta.
    await page.evaluate('globalThis.__agenda.setState({ snap: false })');
    await page.evaluate(`globalThis.__agenda.getState().setSelection({ pageKey: ${JSON.stringify(verso)}, pageType: 'yearOverview', blockId: 'header.title', role: 'content' }, ['header.title'])`);
    const handle = page.locator(`[data-page-key="${verso}"] [data-handle="se"]`).first();
    await expect(handle).toBeVisible();
    const h = (await handle.boundingBox())!;
    const x = h.x + h.width / 2;
    const y = h.y + h.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 12, y - 6, { steps: 10 });
    await page.mouse.up();
    await expect.poll(() => page.evaluate<number>(`globalThis.__agenda.getState().design.overrides.find((o) => o.blockId === 'header.title').scale`)).toBeLessThan(0.79);
    const v = await boxOf(verso!);
    // La esquina que se arrastró quedó donde se soltó el mouse.
    expect(Math.abs(v.se.x - (x - 12))).toBeLessThan(2);
    expect(Math.abs(v.se.y - (y - 6))).toBeLessThan(2);
    const r = await boxOf(recto!);
    // La derecha es el espejo de la izquierda: lo que se corrió el borde del lomo en una se corrió igual en la
    // otra (en sentido contrario, porque el lomo está del otro lado), y el tamaño cambió en la misma proporción.
    expect(Math.abs(r.left - r0.left - (v0.right - v.right))).toBeLessThan(1.5);
    expect(Math.abs(r.top - r0.top - (v.top - v0.top))).toBeLessThan(1.5);
    expect(Math.abs((r.right - r.left) / (r0.right - r0.left) - (v.right - v.left) / (v0.right - v0.left))).toBeLessThan(0.02);
  });
});

test.describe('asistente de IA', () => {
  // Con el service worker de la PWA activo, los pedidos al proveedor salen por él y la prueba no los ve.
  test.use({ serviceWorkers: 'block' });

  /** Un proveedor (la API de Anthropic) que contesta lo que dice el guion, y lo que recibió. */
  async function fakeAnthropic(page: Page, replies: unknown[]): Promise<Array<{ url: string; headers: Record<string, string>; body: Record<string, unknown> | null }>> {
    const seen: Array<{ url: string; headers: Record<string, string>; body: Record<string, unknown> | null }> = [];
    await page.route('https://api.anthropic.com/**', async (route) => {
      const req = route.request();
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST' } });
      seen.push({ url: req.url(), headers: req.headers(), body: req.postData() ? (JSON.parse(req.postData()!) as Record<string, unknown>) : null });
      const body = req.url().includes('/v1/models') ? { data: [{ id: 'claude-opus-5-5' }, { id: 'claude-haiku-5-5' }] } : replies.shift();
      await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
    });
    return seen;
  }

  const propose = (value: string) => ({
    model: 'claude-opus-5-5',
    stop_reason: 'tool_use',
    content: [{ type: 'tool_use', id: 'p1', name: 'propose_change', input: { patch: [{ op: 'replace', path: '/theme/comfort', value }], summary: 'Letra amplia para leer mejor' } }],
  });

  async function configure(page: Page): Promise<void> {
    await page.locator('header').getByRole('button', { name: 'Ajustes', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Asistente de IA…' }).click();
    const dialog = page.getByTestId('ai-settings');
    // Lo de siempre es lo compatible con OpenAI: estas pruebas usan Claude.
    await dialog.getByRole('button', { name: 'Claude', exact: true }).click();
    await dialog.getByLabel('Clave de API').fill('sk-ant-prueba');
    await dialog.getByRole('button', { name: 'Comprobar y cargar modelos' }).click();
    await expect(dialog.getByText('Funciona: 2 modelos disponibles.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Cerrar' }).click();
  }

  test('la píldora es discreta, propone un cambio que se ve en la página y Aplicar lo deja como un paso que se deshace', async ({ page }) => {
    await openQuiet(page);
    const seen = await fakeAnthropic(page, [
      { model: 'claude-opus-5-5', stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'c1', name: 'get_context', input: {} }] },
      propose('wide'),
    ]);
    await configure(page);
    const pill = page.getByTestId('assistant-pill');
    await expect(pill).toBeVisible();
    // Plegada es un botón redondo en la esquina de abajo a la derecha: no tapa el lomo del centro.
    const box = (await pill.boundingBox())!;
    expect(box.height).toBeLessThanOrEqual(40);
    expect(box.width).toBeLessThanOrEqual(40);
    const desk = (await page.locator('.desk').boundingBox())!;
    expect(box.x).toBeGreaterThan(desk.x + desk.width * 0.75);
    expect(box.y + box.height).toBeGreaterThan(desk.y + desk.height - 80);
    await page.keyboard.press('Control+j');
    const input = page.getByTestId('assistant-input');
    await expect(input).toBeFocused();
    await input.fill('Agrandá la letra para leer mejor');
    await page.keyboard.press('Enter');
    const card = page.getByTestId('ai-proposal');
    await expect(card).toBeVisible();
    await expect(card).toContainText('Letra amplia para leer mejor');
    // Mientras tanto la agenda no cambió: lo que se ve es una vista previa.
    expect(await page.evaluate<string>('globalThis.__agenda.getState().design.theme.comfort')).toBe('normal');
    expect(await page.evaluate<string>('globalThis.__agenda.getState().previewDesign.theme.comfort')).toBe('wide');
    // La política de seguridad dejó salir el pedido (si no, el proveedor simulado no lo habría visto), con la clave.
    expect(seen.filter((s) => s.url.endsWith('/v1/messages'))).toHaveLength(2);
    expect(seen[1]!.headers['x-api-key']).toBe('sk-ant-prueba');
    await page.screenshot({ path: 'test-results/assistant-proposal.png' });

    const past = await page.evaluate<number>('globalThis.__agenda.getState().past.length');
    await card.getByTestId('ai-apply').click();
    await expect.poll(() => page.evaluate<string>('globalThis.__agenda.getState().design.theme.comfort')).toBe('wide');
    expect(await page.evaluate<number>('globalThis.__agenda.getState().past.length')).toBe(past + 1);
    await expect(page.getByTestId('ai-notice')).toContainText('Letra amplia');
    await page.locator('.desk').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+z');
    await expect.poll(() => page.evaluate<string>('globalThis.__agenda.getState().design.theme.comfort')).toBe('normal');
  });

  test('desplegado, el campo se abre hacia la izquierda desde la esquina sin cruzar el centro del lienzo', async ({ page }) => {
    await openQuiet(page);
    await page.locator('.desk').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+j');
    const form = page.getByTestId('assistant').getByRole('search');
    await expect(form).toBeVisible();
    const f = (await form.boundingBox())!;
    const desk = (await page.locator('.desk').boundingBox())!;
    expect(f.x + f.width).toBeGreaterThan(desk.x + desk.width - 60);
    expect(f.x).toBeGreaterThan(desk.x + desk.width / 2 - 40);
  });

  test('un servidor local: los modelos aparecen solos en una lista, y sin /v1 se propone la dirección correcta', async ({ page }) => {
    await openQuiet(page);
    await page.route('http://localhost:8080/**', async (route) => {
      const url = route.request().url();
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
      if (url === 'http://localhost:8080/v1/models') return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ data: [{ id: 'qwen3-27b' }] }) });
      return route.fulfill({ status: 404, contentType: 'text/html', headers: { 'access-control-allow-origin': '*' }, body: '<h1>404</h1>' });
    });
    await page.locator('header').getByRole('button', { name: 'Ajustes', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Asistente de IA…' }).click();
    const dialog = page.getByTestId('ai-settings');
    await dialog.getByLabel('Dirección de la API').fill('http://localhost:8080');
    // Sin tocar «Comprobar»: la dirección sin /v1 no contesta, la otra sí, y se ofrece.
    await expect(dialog.getByTestId('ai-use-v1')).toBeVisible();
    await dialog.getByTestId('ai-use-v1').click();
    await expect(dialog.getByLabel('Dirección de la API')).toHaveValue('http://localhost:8080/v1');
    await expect(dialog.getByTestId('ai-check')).toContainText('un modelo disponible');
    // El único modelo quedó elegido, en una lista (no un campo que filtra por lo escrito).
    await expect(dialog.getByRole('combobox', { name: 'Modelo' })).toHaveValue('qwen3-27b');
    await page.screenshot({ path: 'test-results/assistant-local-models.png' });
  });

  test('llama.cpp muestra «listening on http://0.0.0.0:8080»: esa dirección sirve tal cual, y se conecta a 127.0.0.1', async ({ page }) => {
    await openQuiet(page);
    const asked: string[] = [];
    await page.route('http://127.0.0.1:8080/**', async (route) => {
      asked.push(route.request().url());
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ data: [{ id: 'qwen3-27b' }] }) });
    });
    await page.locator('header').getByRole('button', { name: 'Ajustes', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Asistente de IA…' }).click();
    const dialog = page.getByTestId('ai-settings');
    await dialog.getByLabel('Dirección de la API').fill('http://0.0.0.0:8080/v1');
    await expect(dialog.getByTestId('ai-listen-all')).toContainText('http://127.0.0.1:8080/v1');
    // Es una dirección de esta computadora: no pide clave, y los modelos se buscan solos en 127.0.0.1.
    await expect(dialog.getByTestId('ai-check')).toContainText('un modelo disponible');
    await expect(dialog.getByRole('combobox', { name: 'Modelo' })).toHaveValue('qwen3-27b');
    expect(asked.some((u) => u === 'http://127.0.0.1:8080/v1/models')).toBe(true);
  });

  test('si una parte del programa no se puede cargar (se actualizó con la ventana abierta), se ofrece recargar y lo hecho queda guardado', async ({ page }) => {
    await openQuiet(page);
    // El motor del asistente se descarga al usarlo: acá no llega.
    await page.route('**/assets/engine-*.js', (route) => route.abort());
    await page.locator('header').getByRole('button', { name: 'Ajustes', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Asistente de IA…' }).click();
    const dialog = page.getByTestId('ai-settings');
    await dialog.getByRole('button', { name: 'Claude', exact: true }).click();
    await dialog.getByLabel('Clave de API').fill('sk-ant-prueba');
    await dialog.getByRole('button', { name: 'Cerrar' }).click();
    // Un cambio recién hecho, que tiene que sobrevivir a la recarga.
    await page.getByRole('textbox', { name: 'Nombre de la agenda' }).fill('Antes de recargar');
    await page.keyboard.press('Control+j');
    await page.getByTestId('assistant-input').fill('Traducí la agenda al inglés');
    await page.keyboard.press('Enter');
    const card = page.getByTestId('ai-error');
    await expect(card).toContainText('Una parte del programa no se pudo cargar');
    // Reintentar no serviría: el botón es recargar la ventana.
    await expect(card.getByRole('button', { name: 'Reintentar' })).toHaveCount(0);
    await page.unroute('**/assets/engine-*.js');
    await Promise.all([page.waitForEvent('load'), card.getByRole('button', { name: 'Recargar la ventana' }).click()]);
    await expect(page.locator('[data-page-index]').first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('textbox', { name: 'Nombre de la agenda' })).toHaveValue('Antes de recargar');
  });

  test('Esc descarta la propuesta y la página vuelve a como estaba', async ({ page }) => {
    await openQuiet(page);
    await fakeAnthropic(page, [propose('compact')]);
    await configure(page);
    await page.keyboard.press('Control+j');
    await page.getByTestId('assistant-input').fill('Más apretado');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('ai-proposal')).toBeVisible();
    await page.getByTestId('assistant-input').press('Escape');
    await expect(page.getByTestId('ai-proposal')).toBeHidden();
    expect(await page.evaluate<unknown>('globalThis.__agenda.getState().previewDesign')).toBeNull();
    expect(await page.evaluate<string>('globalThis.__agenda.getState().design.theme.comfort')).toBe('normal');
  });

  test('se puede ocultar desde el menú Ver, y Ctrl+J la vuelve a mostrar', async ({ page }) => {
    await openQuiet(page);
    await page.locator('header').getByRole('button', { name: 'Ver', exact: true }).click();
    await page.getByRole('menuitem', { name: /Asistente de IA/ }).click();
    await expect(page.getByTestId('assistant-pill')).toBeHidden();
    await page.locator('.desk').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+j');
    await expect(page.getByTestId('assistant-input')).toBeFocused();
  });
});

test.describe('recursos: colocar y pincel de sello y trazo', () => {
  const customs = (page: Page) => page.evaluate<Array<{ id: string; kind: string; pageKey: string | null; props: Record<string, unknown> }>>('globalThis.__agenda.getState().design.customBlocks.map((c) => ({ id: c.id, kind: c.kind, pageKey: c.pageKey, props: c.props }))');

  test('un ícono se coloca con un clic, y como pincel: un clic deja una copia, un trazo deja varias en un solo elemento que se deshace entero', async ({ page }) => {
    await openQuiet(page);
    await page.getByRole('tab', { name: 'Recursos / Vectores', exact: true }).click();
    // Un ícono de la biblioteca entra a los recursos.
    await page.getByRole('button', { name: 'Biblioteca de íconos…' }).click();
    const picker = page.getByRole('dialog', { name: 'Biblioteca de íconos' });
    await picker.getByRole('textbox', { name: /Buscar un ícono/ }).fill('trofeo');
    await expect(picker.getByTestId('icon-grid').locator('[data-icon]')).toHaveCount(1);
    await page.keyboard.press('Enter');
    await expect(picker).toHaveCount(0);
    const item = page.locator('li', { has: page.getByText('trophy', { exact: true }) }).first();
    // Colocar: un elemento imagen en la página que se ve.
    await item.getByRole('button', { name: 'Colocar' }).click();
    await expect.poll(async () => (await customs(page)).length).toBe(1);
    expect((await customs(page))[0]).toMatchObject({ kind: 'image', props: { assetId: 'icon:trophy' } });

    // El pincel.
    await item.getByRole('button', { name: 'Pincel' }).click();
    const toolbar = page.getByTestId('stamp-toolbar');
    await expect(toolbar).toBeVisible();
    const layer = page.getByTestId('stamp-layer').first();
    await expect(layer).toBeVisible();
    const box = (await layer.boundingBox())!;
    // Un clic: una copia más.
    await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.3);
    await expect.poll(async () => (await customs(page)).length).toBe(2);
    // Un trazo: un solo elemento «dibujo» con varias copias.
    const y = box.y + box.height * 0.6;
    await page.mouse.move(box.x + box.width * 0.15, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.85, y + 20, { steps: 25 });
    await page.screenshot({ path: 'test-results/stamp-stroke.png' });
    await page.mouse.up();
    await expect.poll(async () => (await customs(page)).length).toBe(3);
    const stroke = (await customs(page))[2]!;
    expect(stroke.kind).toBe('drawing');
    expect((stroke.props.prims as unknown[]).length).toBeGreaterThan(3);
    // Se ve en la página como trazados (no una imagen rota).
    await expect(page.locator(`[data-block="custom.${stroke.id}"] path`).first()).toBeVisible();
    // Esc deja el pincel; Ctrl+Z quita el trazo entero.
    await page.keyboard.press('Escape');
    await expect(toolbar).toHaveCount(0);
    await page.locator('.desk').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await customs(page)).length).toBe(2);
  });
});

test.describe('pantalla completa', () => {
  test('F11 deja solo la página (sin barra lateral ni inspector) y otra vez F11 los devuelve como estaban', async ({ page }) => {
    await openQuiet(page);
    const inspector = page.locator('[data-inspector]');
    await expect(inspector).toBeVisible();
    const sidebar = page.getByRole('button', { name: 'Estilo' }).first();
    await expect(sidebar).toBeVisible();
    const deskBefore = (await page.locator('.desk').boundingBox())!;
    await page.locator('.desk').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('F11');
    await expect(inspector).toBeHidden();
    await expect(sidebar).toBeHidden();
    // Tampoco quedan la tira de miniaturas ni el pie con el número de página: solo la página.
    await expect(page.getByTestId('navigator')).toHaveCount(0);
    await expect(page.getByTestId('page-footer')).toHaveCount(0);
    const deskFull = (await page.locator('.desk').boundingBox())!;
    expect(deskFull.width).toBeGreaterThan(deskBefore.width + 200);
    expect(deskFull.height).toBeGreaterThan(deskBefore.height + 60);
    // Se sigue pasando de página con el teclado.
    const before = await page.evaluate<number>('globalThis.__agenda.getState().pageIndex');
    await page.keyboard.press('PageDown');
    await expect.poll(() => page.evaluate<number>('globalThis.__agenda.getState().pageIndex')).not.toBe(before);
    await page.screenshot({ path: 'test-results/fullscreen.png' });
    await page.keyboard.press('F11');
    await expect(inspector).toBeVisible();
    await expect(sidebar).toBeVisible();
    await expect(page.getByTestId('navigator')).toBeVisible();
    await expect(page.getByTestId('page-footer')).toBeVisible();
    // También desde el menú Ver.
    await page.locator('header').getByRole('button', { name: 'Ver', exact: true }).click();
    await page.getByRole('menuitem', { name: /Pantalla completa/ }).click();
    await expect(inspector).toBeHidden();
    expect(await page.evaluate<boolean>('globalThis.__agenda.getState().sidebarOpen')).toBe(true);
  });
});

test.describe('desplazar arrastrando', () => {
  /** El desplazamiento del área de trabajo, con la página acercada para que haya hacia dónde moverse. */
  async function zoomedDesk(page: Page): Promise<{ desk: Locator; scroll: () => Promise<{ left: number; top: number }> }> {
    await openQuiet(page);
    await settled(page);
    await page.evaluate('globalThis.__agenda.getState().setZoom(3, false)');
    const desk = page.locator('.desk');
    await desk.evaluate((el) => {
      el.scrollLeft = el.scrollWidth / 2 - el.clientWidth / 2;
      el.scrollTop = el.scrollHeight / 2 - el.clientHeight / 2;
    });
    return { desk, scroll: () => desk.evaluate((el) => ({ left: el.scrollLeft, top: el.scrollTop })) };
  }

  test('con el botón del medio se arrastra el área de trabajo y no se toca ningún elemento', async ({ page }) => {
    const { desk, scroll } = await zoomedDesk(page);
    const box = (await desk.boundingBox())!;
    const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const before = await scroll();
    const overrides = (await state(page)).design!.overrides.length;
    await page.mouse.move(from.x, from.y);
    await page.mouse.down({ button: 'middle' });
    await expect(desk).toHaveAttribute('data-pan', 'dragging');
    await page.mouse.move(from.x - 120, from.y - 80, { steps: 6 });
    await page.mouse.up({ button: 'middle' });
    const after = await scroll();
    // La página acompaña al puntero: arrastrar hacia arriba a la izquierda desplaza hacia abajo a la derecha.
    expect(Math.abs(after.left - before.left - 120)).toBeLessThan(3);
    expect(Math.abs(after.top - before.top - 80)).toBeLessThan(3);
    await expect(desk).not.toHaveAttribute('data-pan', /.*/);
    expect((await state(page)).design!.overrides.length).toBe(overrides);
    expect((await state(page)).selection).toBeNull();
  });

  test('con la barra espaciadora apretada, el botón principal también arrastra; en un campo, la barra escribe un espacio', async ({ page }) => {
    const { desk, scroll } = await zoomedDesk(page);
    const box = (await desk.boundingBox())!;
    const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await desk.click({ position: { x: 5, y: 5 } });
    const before = await scroll();
    await page.keyboard.down('Space');
    await expect(desk).toHaveAttribute('data-pan', 'ready');
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 90, from.y + 60, { steps: 5 });
    await page.mouse.up();
    await page.keyboard.up('Space');
    const after = await scroll();
    expect(Math.abs(before.left - after.left - 90)).toBeLessThan(3);
    expect(Math.abs(before.top - after.top - 60)).toBeLessThan(3);
    expect((await state(page)).selection).toBeNull();
    await expect(desk).not.toHaveAttribute('data-pan', /.*/);
    // Escribiendo el nombre de la agenda, la barra es un espacio y no prepara el arrastre.
    const name = page.getByRole('textbox', { name: 'Nombre de la agenda' });
    await name.fill('Mi');
    await name.press('Space');
    await name.press('A');
    await expect(name).toHaveValue('Mi A');
    await expect(desk).not.toHaveAttribute('data-pan', /.*/);
  });
});

test.describe('feriados', () => {
  test('un feriado se renombra con el lápiz (Enter guarda, Esc no), se ve el original y se vuelve a él', async ({ page }) => {
    await openQuiet(page);
    await page.getByRole('tab', { name: 'Calendario', exact: true }).click();
    const row = page.getByTestId('holiday-list').locator('[data-holiday="2027-01-01"]').first();
    await expect(row).toContainText('Año Nuevo');
    const renamed = () => page.evaluate<Record<string, string>>('globalThis.__agenda.getState().design.holidays.renamed');
    // Esc cierra sin guardar.
    await row.getByRole('button', { name: /^Cambiar el nombre/ }).click();
    const field = row.getByRole('textbox');
    await expect(field).toBeFocused();
    await field.fill('Otro nombre');
    await field.press('Escape');
    expect(await renamed()).toEqual({});
    // Enter guarda: la agenda usa el nombre nuevo y el panel recuerda el original.
    await row.getByRole('button', { name: /^Cambiar el nombre/ }).click();
    await row.getByRole('textbox').fill('Año nuevo propio');
    await row.getByRole('textbox').press('Enter');
    await expect.poll(renamed).toEqual({ '2027-01-01': 'Año nuevo propio' });
    await expect(row).toContainText('Año nuevo propio');
    await expect(row).toContainText('Original: Año Nuevo');
    // Un paso de «Deshacer», y «Volver al nombre original» lo quita.
    await page.keyboard.press('Control+z');
    await expect.poll(renamed).toEqual({});
    await page.keyboard.press('Control+Shift+z');
    await expect.poll(renamed).toEqual({ '2027-01-01': 'Año nuevo propio' });
    await row.getByRole('button', { name: /^Volver al nombre original/ }).click();
    await expect.poll(renamed).toEqual({});
  });
});

test.describe('menús Archivo, Ajustes y Ayuda', () => {
  test('Archivo tiene lo de la agenda (con «Mis agendas»), Ajustes el idioma y el tamaño, Ayuda la guía y «Acerca de»', async ({ page }) => {
    await openQuiet(page);
    const header = page.locator('header');
    // «Mis agendas» ya no es un botón suelto de la barra.
    await expect(header.getByRole('button', { name: 'Mis agendas' })).toHaveCount(0);
    await header.getByRole('button', { name: 'Archivo', exact: true }).click();
    const menu = page.getByRole('menu');
    for (const name of ['Nuevo…', /^Abrir archivo/, 'Mis agendas…', /^Guardar(?! como)/, 'Guardar como plantilla…', 'Tamaño de la hoja…', 'Copia de seguridad de todo']) await expect(menu.getByRole('menuitem', { name })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'English' })).toHaveCount(0);
    await page.screenshot({ path: 'test-results/menu-file.png' });
    await menu.getByRole('menuitem', { name: 'Mis agendas…' }).click();
    await expect(page.getByRole('dialog', { name: 'Mis agendas' })).toBeVisible();
    await page.keyboard.press('Escape');

    await header.getByRole('button', { name: 'Ajustes', exact: true }).click();
    // Cada idioma figura en su propio idioma.
    for (const name of ['Español', 'English', 'Português', 'Italiano', 'Deutsch', 'Français']) await expect(menu.getByRole('menuitem', { name })).toBeVisible();
    const scale = page.getByTestId('ui-scale');
    await page.screenshot({ path: 'test-results/menu-settings.png' });
    await expect(scale.getByRole('slider', { name: 'Tamaño de la interfaz' })).toHaveValue('100');
    // Escribir el número no cambia nada hasta Enter (ni pasa por 80 % al escribir el «1»).
    const field = scale.getByRole('spinbutton', { name: 'Tamaño de la interfaz' });
    await field.fill('1');
    expect((await state(page)).uiScale).toBe(1);
    await field.fill('130');
    await field.press('Enter');
    await expect.poll(() => page.evaluate('document.documentElement.style.zoom')).toBe('1.3');
    await expect(menu).toBeVisible();
    // El deslizador con el teclado: un paso de 5 %, y el menú sigue abierto.
    const slider = scale.getByRole('slider', { name: 'Tamaño de la interfaz' });
    await slider.focus();
    await page.keyboard.press('ArrowLeft');
    await expect.poll(async () => (await state(page)).uiScale).toBeCloseTo(1.25, 5);
    await expect(menu).toBeVisible();
    // La rueda sobre el menú no lo cierra.
    await menu.hover();
    await page.mouse.wheel(0, 40);
    await expect(menu).toBeVisible();
    await scale.getByRole('button', { name: /Restablecer/ }).click();
    await expect.poll(async () => (await state(page)).uiScale).toBe(1);
    await page.keyboard.press('Escape');

    await header.getByRole('button', { name: 'Ayuda', exact: true }).click();
    await expect(menu.getByRole('menuitem', { name: /^Atajos de teclado/ })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Guía para modelos de IA (MCP)' })).toBeVisible();
    // La guía se abre fuera del programa (se registra la dirección en lugar de salir a la red).
    await page.evaluate(() => {
      const g = globalThis as unknown as { open: (url?: string | URL) => null; __opened: string };
      g.open = (url) => {
        g.__opened = String(url);
        return null;
      };
    });
    await menu.getByRole('menuitem', { name: 'Guía para modelos de IA (MCP)' }).click();
    expect(await page.evaluate<string>('globalThis.__opened')).toMatch(/github\.com\/jonidimo\/agenda-heritage-generator\/blob\/main\/docs\/plantillas-llm\.md$/);
    await header.getByRole('button', { name: 'Ayuda', exact: true }).click();
    await menu.getByRole('menuitem', { name: 'Acerca de Heritage Studio…' }).click();
    await expect(page.getByRole('dialog', { name: 'Acerca de Heritage Studio' })).toBeVisible();
  });
});

test.describe('zoom con la rueda y barra superior', () => {
  test('Ctrl + rueda acerca y aleja la página dejando quieto el punto bajo el cursor; sin Ctrl la rueda desplaza', async ({ page }) => {
    await openQuiet(page);
    await settled(page);
    // Desde un zoom en el que la página ya desborda la ventana (si entra entera, queda centrada y no hay qué anclar).
    await page.evaluate('globalThis.__agenda.getState().setZoom(2, false)');
    await page.waitForTimeout(300);
    const target = page.locator('.desk [data-page-index]').first();
    const box = (await target.boundingBox())!;
    const x = box.x + box.width * 0.3;
    const y = box.y + box.height * 0.4;
    // Qué punto de la página (fracción de su ancho y alto) está bajo el cursor.
    const under = async () => {
      const b = (await target.boundingBox())!;
      return { fx: (x - b.x) / b.width, fy: (y - b.y) / b.height, w: b.width };
    };
    const before = await under();
    await page.mouse.move(x, y);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -100);
    await page.keyboard.up('Control');
    await expect.poll(async () => (await state(page)).zoom).toBeCloseTo(2.4, 2);
    expect((await state(page)).fit).toBe(false);
    const after = await under();
    expect(after.w).toBeGreaterThan(before.w * 1.1);
    expect(Math.abs(after.fx - before.fx) * after.w).toBeLessThan(3);
    expect(Math.abs(after.fy - before.fy) * after.w).toBeLessThan(3);
    // El navegador no agrandó la interfaz.
    expect(await page.evaluate<number>('visualViewport.scale')).toBe(1);
    expect(await page.evaluate<string>('document.documentElement.style.zoom')).toBe('');
    // Sin Ctrl, la rueda no cambia el zoom.
    await page.mouse.wheel(0, 200);
    await page.waitForTimeout(200);
    expect((await state(page)).zoom).toBeCloseTo(2.4, 2);
  });

  test('el buscador se ve en la barra y abre la búsqueda; en una ventana angosta el zoom pasa al menú «⋯»', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await openQuiet(page);
    const field = page.getByTestId('search-field');
    await expect(field).toBeVisible();
    await expect(field).toContainText('Ctrl+K');
    await field.click();
    await expect(page.getByRole('combobox', { name: 'Buscar (Ctrl+K)' })).toBeFocused();
    await page.keyboard.press('Escape');
    // Ninguna zona de la barra pisa a otra.
    const overlaps = () =>
      page.evaluate<boolean>(`(() => {
        const z = [...document.querySelectorAll('header [data-zone]')].map((e) => e.getBoundingClientRect());
        return z.some((a, i) => z.some((b, j) => i < j && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1));
      })()`);
    expect(await overlaps()).toBe(false);
    await page.setViewportSize({ width: 900, height: 900 });
    await expect(page.getByTestId('search-field')).toBeHidden();
    expect(await overlaps()).toBe(false);
    await page.locator('header').getByRole('button', { name: 'Más', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Acercar' }).click();
    await expect.poll(async () => (await state(page)).zoom).toBeGreaterThan(1.1);
  });
});

test.describe('2.4: empezar de cero, marcas de agua, portada del mes, QR y créditos', () => {
  /** El asistente de nueva agenda, con la interfaz en castellano. */
  async function welcome(page: Page): Promise<Locator> {
    await page.addInitScript(() => localStorage.setItem('agenda-studio.uiLang', 'es'));
    await page.goto('/');
    const dialog = page.getByRole('dialog', { name: 'Nueva agenda' });
    await expect(dialog).toBeVisible({ timeout: 60_000 });
    return dialog;
  }

  test('una agenda en blanco arranca sin páginas ni errores, dice qué hacer y se arma con secciones', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => void (m.type() === 'error' && errors.push(m.text())));
    const dialog = await welcome(page);
    await dialog.getByRole('radio', { name: /En blanco/ }).check();
    // Sin calendario: no se piden semana, meses ni país.
    await expect(dialog.getByLabel('Cantidad de meses')).toHaveCount(0);
    await expect(dialog.getByLabel('País (feriados)')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Crear agenda' }).click();
    const empty = page.getByTestId('no-pages');
    await expect(empty).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('[data-page-index]')).toHaveCount(0);
    await empty.getByRole('button', { name: 'Agregar sección' }).click();
    const add = page.getByTestId('add-section');
    await expect(add).toBeVisible();
    await add.click();
    await page.getByRole('menuitem', { name: 'Notas', exact: true }).click();
    await expect(page.locator('[data-page-index]').first()).toBeVisible({ timeout: 30_000 });
    await expect(empty).toHaveCount(0);
    expect(await page.evaluate<string[]>('globalThis.__agenda.getState().design.sections.map((s) => s.type)')).toEqual(['notes']);
    // Una segunda sección de notas convive con la primera (otra id, otras páginas).
    await add.click();
    await page.getByRole('menuitem', { name: 'Notas', exact: true }).click();
    await expect.poll(() => page.evaluate<string[]>('globalThis.__agenda.getState().design.sections.map((s) => s.id)')).toEqual(['notes', 'notes-2']);
    // Agregar una sección es un solo paso de «Deshacer».
    await page.keyboard.press('Control+z');
    await expect.poll(() => page.evaluate<number>('globalThis.__agenda.getState().design.sections.length')).toBe(1);
    expect(errors).toEqual([]);
  });

  test('«Nueva agenda» entra en una ventana chica: el título y «Crear agenda» siempre a la vista', async ({ browser }) => {
    for (const { width, height, scale } of [
      { width: 1280, height: 720, scale: '1' },
      { width: 1366, height: 768, scale: '1.25' },
    ]) {
      const ctx = await browser.newContext({ viewport: { width, height } });
      const page = await ctx.newPage();
      await page.addInitScript((s) => localStorage.setItem('agenda-studio.uiScale', s), scale);
      const dialog = await welcome(page);
      const inView = async (l: Locator): Promise<void> => {
        const b = (await l.boundingBox())!;
        expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.y + b.height).toBeLessThanOrEqual(height + 0.5);
      };
      await inView(dialog.getByRole('heading', { name: 'Nueva agenda' }));
      await inView(dialog.getByRole('button', { name: 'Crear agenda' }));
      await inView(dialog.getByRole('button', { name: 'Cerrar' }));
      // Dos columnas: las plantillas a la izquierda y la hoja a la derecha.
      const tpl = (await dialog
        .getByRole('radio', { name: /Heritage/ })
        .first()
        .boundingBox())!;
      const paper = (await dialog.getByTestId('welcome-paper').boundingBox())!;
      expect(paper.x).toBeGreaterThan(tpl.x + 200);
      // Lo que no entra se desplaza dentro del diálogo, y la hoja se alcanza.
      await dialog.getByTestId('welcome-paper').scrollIntoViewIfNeeded();
      await inView(dialog.getByTestId('welcome-paper').getByTestId('paper-result'));
      await inView(dialog.getByRole('button', { name: 'Crear agenda' }));
      await page.screenshot({ path: `test-results/welcome-${width}x${height}.png` });
      await ctx.close();
    }
  });

  test('el tamaño de la hoja se elige al empezar, a la vista, y la agenda nace con él', async ({ page }) => {
    const dialog = await welcome(page);
    const paper = dialog.getByTestId('welcome-paper');
    await expect(paper).toBeVisible();
    await expect(paper.getByTestId('paper-result')).toContainText('Cada página');
    await paper.getByRole('button', { name: 'Leer en pantalla' }).click();
    await paper.getByRole('combobox', { name: 'Pantalla' }).selectOption('TABLET_10_3');
    await expect(paper.getByTestId('paper-result')).toContainText('157,8 × 210,4 mm');
    await page.screenshot({ path: 'test-results/welcome-paper.png' });
    await dialog.getByRole('button', { name: 'Crear agenda' }).click();
    await expect(page.locator('[data-page-index]').first()).toBeVisible({ timeout: 60_000 });
    const d = await page.evaluate<{ preset: string; target: string; method: string }>(`(() => { const d = globalThis.__agenda.getState().design; return { preset: d.paper.preset, target: d.binding.target, method: d.binding.method }; })()`);
    expect(d).toEqual({ preset: 'TABLET_10_3', target: 'screen', method: 'single' });
  });

  test('Edición → Tamaño de la hoja cambia el papel y lleva lo hecho a mano en proporción, en un paso que se deshace', async ({ page }) => {
    await openQuiet(page);
    await page.evaluate(`globalThis.__agenda.getState().update((d) => { d.customBlocks.push({ id: 'cb-paper', pageType: d.customBlocks[0]?.pageType ?? 'notes', pageKey: null, kind: 'rect', x: 20, y: 40, w: 30, h: 30, mirror: true, props: {} }); })`);
    await page.locator('header').getByRole('button', { name: 'Edición', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Tamaño de la hoja…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Tamaño de la hoja' });
    await dialog.getByRole('combobox', { name: 'Papel' }).selectOption('A3');
    await expect(dialog.getByTestId('paper-change')).toBeVisible();
    await expect(dialog.getByRole('checkbox', { name: /Llevar lo hecho a mano/ })).toBeChecked();
    await dialog.getByRole('button', { name: 'Aplicar', exact: true }).click();
    await expect(dialog).toBeHidden();
    const after = await page.evaluate<{ preset: string; x: number }>(`(() => { const d = globalThis.__agenda.getState().design; return { preset: d.paper.preset, x: d.customBlocks.find((b) => b.id === 'cb-paper').x }; })()`);
    expect(after.preset).toBe('A3');
    expect(after.x).toBeGreaterThan(25);
    await page.locator('.desk').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+z');
    await expect.poll(() => page.evaluate<string>('globalThis.__agenda.getState().design.paper.preset')).toBe('A4');
  });

  test('el cuaderno pide páginas y estilo, y sale sin calendario', async ({ page }) => {
    const dialog = await welcome(page);
    await dialog.getByRole('radio', { name: /Cuaderno/ }).check();
    const opts = dialog.getByTestId('notebook-options');
    await expect(opts).toBeVisible();
    await expect(dialog.getByLabel('Cantidad de meses')).toHaveCount(0);
    await opts.getByRole('spinbutton').fill('60');
    await opts.getByRole('combobox').selectOption('lines');
    await dialog.getByRole('button', { name: 'Crear agenda' }).click();
    await expect(page.locator('[data-page-index]').first()).toBeVisible({ timeout: 60_000 });
    const notes = await page.evaluate<{ types: string[]; options: Record<string, unknown> }>(`(() => {
      const d = globalThis.__agenda.getState().design;
      return { types: d.sections.map((s) => s.type), options: d.sections.find((s) => s.type === 'notes').options };
    })()`);
    expect(notes.types).toEqual(['titlePage', 'notes']);
    expect(notes.options).toMatchObject({ count: 60, style: 'lines' });
  });

  test('marca de agua solo en las derechas, con fusión, y los créditos se apagan desde Métodos', async ({ page }) => {
    await openQuiet(page);
    await toWeek(page);
    await settled(page);
    await page.getByRole('tab', { name: 'Recursos / Vectores', exact: true }).click();
    const wm = () => page.evaluate<{ side: string; blend: string }>('(() => { const w = globalThis.__agenda.getState().design.watermarks[0]; return { side: w.side, blend: w.blend }; })()');
    await page.getByRole('button', { name: 'Derechas', exact: true }).first().click();
    await expect.poll(async () => (await wm()).side).toBe('recto');
    await page.getByRole('combobox', { name: 'Fusión' }).first().selectOption('multiply');
    await expect.poll(async () => (await wm()).blend).toBe('multiply');
    // En el pliego, la izquierda queda sin colibrí y la derecha lo tiene.
    const sides = () =>
      page.evaluate<{ left: number; right: number }>(`(() => {
        const pages = [...document.querySelectorAll('.desk [data-page-index]')];
        const count = (odd) => pages.filter((el) => Number(el.getAttribute('data-page-index')) % 2 === (odd ? 1 : 0)).reduce((n, el) => n + el.querySelectorAll('[data-block^="wm."]').length, 0);
        return { left: count(true), right: count(false) };
      })()`);
    await expect.poll(sides).toEqual({ left: 0, right: 1 });
    // Créditos del autor: encendidos por defecto, se apagan con un interruptor.
    await page.getByRole('tab', { name: 'Métodos', exact: true }).click();
    const credits = page.getByRole('checkbox', { name: /créditos del autor/ });
    await expect(credits).toBeChecked();
    await credits.uncheck();
    await expect.poll(() => page.evaluate<boolean>('globalThis.__agenda.getState().design.methods.guide.credits')).toBe(false);
  });

  test('la portada del mes lleva una imagen propia en lugar del sticker', async ({ page }) => {
    await openQuiet(page);
    await page.evaluate(`globalThis.__agenda.getState().update((d) => {
      d.assets.push({ id: 'img-mes', name: 'Imagen del mes', kind: 'vector', mime: 'image/svg+xml', width: 10, height: 10, builtin: 'watermarks/colibri.svg' });
    }, 'e2e-asset')`);
    // Una portada de mes a la vista y su sticker elegido.
    await expect.poll(async () => {
      for (let i = 0; i < 30; i++) {
        if (await page.locator('[data-page-type="monthCover"] [data-block="cover.sticker"]').count()) return true;
        await page.keyboard.press('PageDown');
      }
      return false;
    }).toBe(true);
    await selectBlock(page, 'cover.sticker');
    const pick = page.getByTestId('cover-image');
    await expect(pick).toBeVisible();
    await pick.getByRole('button', { name: 'Todos los meses' }).click();
    await pick.getByRole('combobox', { name: 'Imagen de la portada' }).selectOption('img-mes');
    const images = () => page.evaluate<Record<string, string> | null>(`(() => { for (const s of globalThis.__agenda.getState().design.sections) for (const it of [s, ...(s.items ?? [])]) if (it.type === 'monthCover') return it.options.images ?? null; return null; })()`);
    await expect.poll(images).toEqual({ default: 'img-mes' });
    // Vuelve al sticker con «Ninguna».
    await pick.getByRole('combobox', { name: 'Imagen de la portada' }).selectOption('');
    await expect.poll(images).toEqual(null);
  });

  test('un código QR se agrega, guarda lo que se escribe y avisa si es demasiado largo', async ({ page }) => {
    await openQuiet(page);
    const last = () => page.evaluate<{ kind: string; props: Record<string, unknown> }>('(() => { const c = globalThis.__agenda.getState().design.customBlocks.at(-1); return { kind: c.kind, props: c.props }; })()');
    await page.getByTestId('add-elements').getByRole('button', { name: 'Código QR' }).click();
    expect((await last()).kind).toBe('qr');
    await page.locator('textarea[placeholder="https://"]').fill('https://example.com/receta');
    await expect.poll(async () => (await last()).props.text).toBe('https://example.com/receta');
    await expect(page.getByText(/Código de \d+ × \d+ módulos/)).toBeVisible();
    await page.getByRole('button', { name: 'Máxima', exact: true }).click();
    await expect.poll(async () => (await last()).props.ecc).toBe('H');
    // Tocable en el PDF mientras guarde una dirección; se puede apagar.
    const link = page.getByRole('checkbox', { name: 'Tocarlo en el PDF abre la dirección' });
    await expect(link).toBeChecked();
    await link.uncheck();
    await expect.poll(async () => (await last()).props.link).toBe(false);
    await page.locator('textarea[placeholder="https://"]').fill('x'.repeat(1400));
    await expect(page.getByText('Es demasiado texto para un código QR: acortalo.')).toBeVisible();
  });
});

test.describe('2.4: íconos y formas', () => {
  const last = (page: Page) => page.evaluate<{ kind: string; props: Record<string, unknown> }>('(() => { const c = globalThis.__agenda.getState().design.customBlocks.at(-1); return { kind: c.kind, props: c.props }; })()');

  test('un ícono de la biblioteca se busca, se agrega a la página y se tiñe', async ({ page }) => {
    await openQuiet(page);
    await page.getByTestId('add-elements').locator('..').getByRole('button', { name: 'Ícono', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Biblioteca de íconos' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('textbox', { name: /Buscar un ícono/ }).fill('trofeo');
    await expect(dialog.getByTestId('icon-grid').locator('[data-icon]')).toHaveCount(1);
    // Las imágenes de la grilla cargan (los SVG están en la carpeta de íconos).
    await expect.poll(() => dialog.locator('[data-icon="trophy"] img').evaluate((img: { naturalWidth: number }) => img.naturalWidth)).toBeGreaterThan(0);
    await page.keyboard.press('Enter');
    await expect(dialog).toHaveCount(0);
    expect(await last(page)).toMatchObject({ kind: 'image', props: { assetId: 'icon:trophy' } });
    expect(await page.evaluate<boolean>("globalThis.__agenda.getState().design.assets.some((a) => a.id === 'icon:trophy')")).toBe(true);
    await expect(page.locator('[data-block^="custom."]').first()).toBeVisible();
    // Agregarlo es un solo paso de «Deshacer» (el elemento y la imagen juntos).
    const trophies = () => page.evaluate<number>("globalThis.__agenda.getState().design.assets.filter((a) => a.id === 'icon:trophy').length + globalThis.__agenda.getState().design.customBlocks.filter((c) => c.props.assetId === 'icon:trophy').length");
    await page.locator('.desk').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+z');
    await expect.poll(trophies).toBe(0);
    await page.keyboard.press('Control+Shift+z');
    await expect.poll(trophies).toBe(2);
    // Un dibujo vectorial se tiñe.
    await page.evaluate("(() => { const s = globalThis.__agenda.getState(); const c = s.design.customBlocks.at(-1); const el = document.querySelector('[data-block=\"custom.' + c.id + '\"]'); const w = el.closest('[data-page-key]'); s.setSelection({ pageKey: w.getAttribute('data-page-key'), pageType: w.getAttribute('data-page-type'), blockId: 'custom.' + c.id, role: 'custom' }, ['custom.' + c.id]); })()");
    const tint = page.locator('label', { hasText: 'Color del dibujo' }).locator('input[type="color"]');
    await tint.fill('#c0392b');
    await expect.poll(async () => (await last(page)).props.color).toBe('#c0392b');
  });

  test('una forma se agrega, cambia de forma y muestra solo sus parámetros', async ({ page }) => {
    await openQuiet(page);
    await page.getByTestId('add-elements').locator('..').getByRole('button', { name: 'Forma', exact: true }).click();
    expect((await last(page)).kind).toBe('shape');
    const fields = page.getByTestId('shape-fields');
    await expect(fields).toBeVisible();
    await expect(fields.getByText('Esquinas redondeadas')).toBeVisible();
    await fields.getByRole('combobox', { name: 'Forma' }).selectOption('star');
    await expect.poll(async () => (await last(page)).props.shape).toBe('star');
    await expect(fields.getByText('Puntas', { exact: true })).toBeVisible();
    await expect(fields.getByText('Lados', { exact: true })).toHaveCount(0);
    await fields.getByRole('combobox', { name: 'Forma' }).selectOption('polygon');
    await expect(fields.getByText('Lados', { exact: true })).toBeVisible();
    // La forma se dibuja en la página como un trazado.
    await expect(page.locator('[data-block^="custom."] path').first()).toBeVisible();
    await fields.getByRole('button', { name: 'Guiones', exact: true }).click();
    await expect.poll(async () => (await last(page)).props.dash).toBe('dashed');
    // El relleno es una muestra de color siempre a mano, con «Sin relleno» al lado.
    const fill = fields.getByTestId('shape-fill');
    await fill.locator('input[type="color"]').fill('#336699');
    await expect.poll(async () => (await last(page)).props.fill).toBe('#336699');
    await fill.getByRole('button', { name: 'Sin relleno' }).click();
    await expect.poll(async () => (await last(page)).props.fill).toBeUndefined();
    // Opacidad en por ciento (se guarda de 0 a 1).
    const opacity = fields.getByRole('spinbutton', { name: 'Opacidad' });
    await opacity.fill('40');
    await opacity.press('Enter');
    await expect.poll(async () => (await last(page)).props.opacity).toBeCloseTo(0.4, 5);
    // Toda forma (todo elemento propio) gira de 0 a 360°.
    const id = await page.evaluate<string>('globalThis.__agenda.getState().design.customBlocks.at(-1).id');
    const rotation = page.getByRole('spinbutton', { name: 'Rotación (°)', exact: true });
    await rotation.fill('300');
    await rotation.press('Enter');
    await expect.poll(() => page.evaluate<number | undefined>(`globalThis.__agenda.getState().design.overrides.find((o) => o.blockId === 'custom.${id}')?.rotation`)).toBe(300);
    await page.screenshot({ path: 'test-results/shape-fields.png' });
  });
});
