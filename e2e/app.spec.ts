import { devices, expect, test, type Page } from '@playwright/test';

type StoreHandle = { getState: () => { design: { overrides: unknown[]; theme: { comfort: string }; binding: { signature: { sheets: number } } } | null; pageIndex: number; goToPage: (i: number) => void } };

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
