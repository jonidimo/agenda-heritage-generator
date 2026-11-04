import { devices, expect, test, type Page } from '@playwright/test';

type StoreHandle = {
  getState: () => {
    design: { overrides: Array<{ blockId: string; dx: number }>; theme: { comfort: string }; binding: { signature: { sheets: number } }; pageStyles: Array<{ pageType: string; tokens: Record<string, unknown> }>; watermarks: Array<{ excludePages: string[] }> } | null;
    pageIndex: number;
    selectedIds: string[];
    uiLang: string;
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
  await page.getByRole('combobox', { name: 'Idioma de la interfaz' }).selectOption('en');
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
  await expect(page.getByText('prueba.pdf')).toBeVisible();
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
  await page.getByRole('dialog', { name: 'Mis agendas' }).getByRole('button', { name: /Norma/ }).first().click();
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
  await page.getByRole('group', { name: 'Estilo' }).getByRole('button', { name: 'Renglones' }).click();
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

test('sin elegir idioma, la interfaz sigue al idioma de la agenda', async ({ browser }) => {
  const ctx = await browser.newContext({ locale: 'en-US' });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.getByRole('button', { name: 'Create planner' }).click();
  await expect(page.getByRole('button', { name: 'Imprimir / exportar' })).toBeVisible({ timeout: 60_000 });
  expect(await page.evaluate(() => (globalThis as unknown as { __agenda: StoreHandle }).__agenda.getState().uiLang)).toBe('es');
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

  test('el calendario anual muestra sus enlaces y un clic en un día lleva a su semana', async ({ page }) => {
    await open(page);
    await page.evaluate(() => (globalThis as unknown as { __agenda: StoreHandle }).__agenda.getState().goToPage(7));
    await page.getByRole('button', { name: 'Ver y seguir los enlaces del PDF' }).click();
    // Los dos calendarios del pliego: 365 días y 12 meses (más el título de la segunda página).
    await expect.poll(async () => areas(page).count()).toBeGreaterThan(370);
    const day = areas(page).and(page.locator('[title*="Semana 9 "]')).first();
    const to = Number(await day.getAttribute('data-link-to'));
    await day.click();
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
    expect(pdf).toContain('/Lang (es-AR)');
  });
});
