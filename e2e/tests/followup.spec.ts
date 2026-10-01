import type { Page } from '@playwright/test';
import { createAgent, expect, loginAs, logout, test, unique } from './fixtures';

const PASSWORD = 'Inicial-2026x';

const row = (page: Page, title: string) =>
  page.locator('.task-table tbody tr', { hasText: title });

async function openFollowUp(page: Page, title: string): Promise<void> {
  await page.getByRole('button', { name: new RegExp(`^Ver seguimiento de ${title}`) }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
}

/** El administrador crea una tarea asignada a un agente (buscándolo por nombre). */
async function createAssignedTask(page: Page, title: string, assignee: string): Promise<void> {
  await page.getByRole('link', { name: 'Tareas' }).click();
  await page.getByRole('button', { name: 'Nueva tarea' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Título *').fill(title);
  const box = dialog.getByRole('combobox', { name: 'Responsable' });
  await box.click();
  await box.pressSequentially(assignee, { delay: 10 });
  await page.getByRole('option', { name: assignee }).click();
  await dialog.getByRole('button', { name: 'Crear tarea' }).click();
  await expect(page.getByText(`Tarea "${title}" creada.`)).toBeVisible();
}

test.describe('Seguimiento de tareas', () => {
  test('el agente registra avances y el administrador ve la traza completa', async ({ page }) => {
    const agent = `e2e.f${unique()}`;
    const title = `E2E seguimiento ${unique()}`;
    await createAgent(page, agent, PASSWORD);
    await createAssignedTask(page, title, `Agente ${agent}`);
    await logout(page);

    // El agente registra un avance y cambia el estado.
    await loginAs(page, agent, PASSWORD);
    await openFollowUp(page, title);
    const drawer = page.locator('.followup');
    await expect(drawer).toContainText(`asignó la tarea a Agente ${agent}`);
    await drawer.getByLabel('Nuevo avance').fill('Llamé al cliente, no contestó. Reintento 4 p. m.');
    await drawer.getByRole('button', { name: 'Agregar avance' }).click();
    await expect(page.getByText('Avance registrado.')).toBeVisible();
    await expect(drawer.locator('.timeline__item').first()).toContainText(
      'Llamé al cliente, no contestó. Reintento 4 p. m.',
    );
    await page.getByRole('button', { name: 'Cerrar seguimiento' }).click();
    await expect(row(page, title)).toContainText('1');
    await row(page, title).getByRole('button', { name: /^Cambiar estado/ }).click();
    await page.locator('.v-overlay--active .v-list-item', { hasText: 'En progreso' }).click();
    await expect(row(page, title)).toContainText('En progreso');
    await logout(page);

    // El administrador ve todo en orden: creación, asignación, avance y cambio de estado.
    await loginAs(page, 'admin', process.env.SEED_ADMIN_PASSWORD ?? '');
    await openFollowUp(page, title);
    const items = page.locator('.followup .timeline__item');
    await expect(items).toHaveCount(4);
    await expect(items.nth(0)).toContainText('cambió el estado de Pendiente a En progreso');
    await expect(items.nth(1)).toContainText('registró un avance');
    await expect(items.nth(3)).toContainText('creó la tarea');
  });

  test('no se puede registrar un avance vacío', async ({ tasksPage: page }) => {
    const title = `E2E vacío ${unique()}`;
    await page.getByRole('button', { name: 'Nueva tarea' }).first().click();
    await page.getByRole('dialog').getByLabel('Título *').fill(title);
    await page.getByRole('dialog').getByRole('button', { name: 'Crear tarea' }).click();

    await openFollowUp(page, title);
    const drawer = page.locator('.followup');
    await drawer.getByLabel('Nuevo avance').fill('    ');

    await expect(drawer.getByRole('button', { name: 'Agregar avance' })).toBeDisabled();
  });
});
