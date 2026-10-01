import { expect, test } from './fixtures';

test.describe('Indicadores y tema', () => {
  test('los indicadores reflejan una tarea nueva y filtran la tabla al hacer clic', async ({
    tasksPage: page,
  }) => {
    const pending = page.locator('.gauge-button').filter({ hasText: 'Pendiente' });
    const countOf = async () => Number(await pending.locator('.gauge-button__count').innerText());
    const before = await countOf();

    await page.getByRole('button', { name: 'Nueva tarea' }).first().click();
    await page.getByLabel('Título *').fill(`E2E Indicador ${Date.now().toString(36)}`);
    await page.getByRole('button', { name: 'Crear tarea' }).click();
    await expect.poll(countOf).toBe(before + 1);

    await pending.click();
    await expect(page).toHaveURL(/status=PENDING/);
    await expect(pending).toHaveAttribute('aria-pressed', 'true');
  });

  test('el modo oscuro se activa y se mantiene al recargar', async ({ tasksPage: page }) => {
    await page.getByRole('button', { name: 'Activar modo oscuro' }).click();
    await expect(page.locator('.v-application')).toHaveClass(/v-theme--fastcoDark/);

    await page.reload();
    await expect(page.locator('.v-application')).toHaveClass(/v-theme--fastcoDark/);

    await page.getByRole('button', { name: 'Activar modo claro' }).click();
    await expect(page.locator('.v-application')).toHaveClass(/v-theme--fastco\b/);
  });
});
