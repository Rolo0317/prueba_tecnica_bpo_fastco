import { expect, test } from './fixtures';

const uniqueTitle = (prefix: string) => `${prefix} ${Date.now().toString(36)}`;

test.describe('Gestión de tareas', () => {
  test('crea una tarea y aparece primera en el listado como Pendiente', async ({ tasksPage: page }) => {
    const title = uniqueTitle('E2E Validar soporte de pago');

    await page.getByRole('button', { name: 'Nueva tarea' }).first().click();
    await page.getByRole('button', { name: 'Crear tarea' }).click();
    await expect(page.getByText('El título es obligatorio.')).toBeVisible();

    await page.getByLabel('Título *').fill(title);
    await page.getByLabel('Descripción').fill('Creada por la prueba end-to-end.');
    await page.getByRole('button', { name: 'Alta' }).click();
    await page.getByRole('button', { name: 'Crear tarea' }).click();

    await expect(page.getByText(`Tarea "${title}" creada.`)).toBeVisible();
    const firstRow = page.locator('.task-table tbody tr').first();
    await expect(firstRow).toContainText(title);
    await expect(firstRow).toContainText('Pendiente');
    await expect(firstRow).toContainText('Alta');
  });

  test('cambia el estado respetando las transiciones permitidas', async ({ tasksPage: page }) => {
    const title = uniqueTitle('E2E Escalar reclamo');
    await page.getByRole('button', { name: 'Nueva tarea' }).first().click();
    await page.getByLabel('Título *').fill(title);
    await page.getByRole('button', { name: 'Crear tarea' }).click();
    const row = page.locator('.task-table tbody tr', { hasText: title });
    await expect(row).toBeVisible();

    const openMenu = async () => {
      await row.getByRole('button', { name: `Cambiar estado de la tarea "${title}"` }).click();
      return page.locator('.v-overlay--active .v-list-item-title');
    };

    // Desde Pendiente solo se ofrece En progreso o Cancelada.
    await expect(await openMenu()).toHaveText(['En progreso', 'Cancelada']);
    await page.locator('.v-overlay--active .v-list-item', { hasText: 'En progreso' }).click();
    await expect(row).toContainText('En progreso');

    await (await openMenu()).filter({ hasText: 'Completada' }).click();
    await expect(row).toContainText('Completada');

    // Completada es un estado final: ya no hay menú para cambiarla.
    await expect(row.getByRole('button', { name: /Cambiar estado/ })).toHaveCount(0);
    await expect(row.getByLabel('Estado final, sin cambios disponibles')).toBeVisible();
  });

  test('filtra por estado y conserva el filtro en la URL', async ({ tasksPage: page }) => {
    await page.locator('.status-filter .v-chip', { hasText: 'En progreso' }).click();

    await expect(page).toHaveURL(/status=IN_PROGRESS/);
    const statuses = page.locator('.task-table tbody tr .v-chip').filter({ hasText: /Pendiente|En progreso|Completada|Cancelada/ });
    await expect(statuses.first()).toBeVisible();
    for (const text of await statuses.allInnerTexts()) {
      expect(text.trim()).toBe('En progreso');
    }

    await page.reload();
    // El filtro activo se anuncia a lectores de pantalla con aria-pressed.
    await expect(page.locator('.status-filter [aria-pressed="true"]')).toHaveText('En progreso');
  });

  test('pagina los resultados desde el servidor', async ({ tasksPage: page }) => {
    await expect(page.getByText(/^1-10 de \d+$/)).toBeVisible();

    await page.getByRole('button', { name: /Página siguiente|Next page/i }).click();

    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByText(/^11-\d+ de \d+$/)).toBeVisible();
  });
});
