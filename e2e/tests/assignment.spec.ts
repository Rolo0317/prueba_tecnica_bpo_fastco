import type { Page } from '@playwright/test';
import { createAgent, credentials, expect, loginAs, logout, test, unique } from './fixtures';

const PASSWORD = 'Inicial-2026x';

/** El administrador crea una tarea asignada a un usuario (por su nombre completo). */
async function createAssignedTask(page: Page, title: string, assigneeName: string): Promise<void> {
  await page.getByRole('link', { name: 'Tareas' }).click();
  await page.getByRole('button', { name: 'Nueva tarea' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Título *').fill(title);
  await chooseAssignee(page, assigneeName);
  await dialog.getByRole('button', { name: 'Crear tarea' }).click();
  await expect(page.getByText(`Tarea "${title}" creada.`)).toBeVisible();
}

/** Con muchos usuarios se busca escribiendo, igual que lo haría una persona. */
async function chooseAssignee(page: Page, fullName: string): Promise<void> {
  const box = page.getByRole('dialog').getByRole('combobox', { name: 'Responsable' });
  await box.click();
  await box.clear();
  await box.pressSequentially(fullName, { delay: 10 });
  await page.getByRole('option', { name: fullName }).click();
}

const row = (page: Page, title: string) => page.locator('.task-table tbody tr', { hasText: title });

test.describe('Asignación de tareas y visibilidad por rol', () => {
  test('cada agente ve solo lo asignado a él; el administrador ve todo', async ({ page }) => {
    const [agentA, agentB] = [`e2e.a${unique()}`, `e2e.b${unique()}`];
    await createAgent(page, agentA, PASSWORD);
    await createAgent(page, agentB, PASSWORD);
    const titleA = `E2E para A ${unique()}`;
    const titleB = `E2E para B ${unique()}`;
    await createAssignedTask(page, titleA, `Agente ${agentA}`);
    await createAssignedTask(page, titleB, `Agente ${agentB}`);

    await expect(row(page, titleA)).toContainText(`Agente ${agentA}`);
    await expect(row(page, titleB)).toBeVisible();
    await logout(page);

    await loginAs(page, agentA, PASSWORD);
    await expect(page.getByText('Tus tareas: las que tienes asignadas y las que creaste.')).toBeVisible();
    await expect(row(page, titleA)).toBeVisible();
    await expect(row(page, titleB)).toHaveCount(0);
    // Los indicadores también son solo suyos.
    await expect(page.locator('.kpi').filter({ hasText: 'Total de tareas' })).toContainText('1');
  });

  test('un agente crea tareas para sí mismo y solo edita las que creó', async ({ page }) => {
    const agent = `e2e.c${unique()}`;
    await createAgent(page, agent, PASSWORD);
    const assignedByAdmin = `E2E del admin ${unique()}`;
    await createAssignedTask(page, assignedByAdmin, `Agente ${agent}`);
    await logout(page);

    await loginAs(page, agent, PASSWORD);
    const own = `E2E propia ${unique()}`;
    await page.getByRole('button', { name: 'Nueva tarea' }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('La tarea quedará asignada a ti.')).toBeVisible();
    await expect(dialog.getByRole('combobox', { name: 'Responsable' })).toHaveCount(0);
    await dialog.getByLabel('Título *').fill(own);
    await dialog.getByRole('button', { name: 'Crear tarea' }).click();
    await expect(row(page, own)).toContainText(`Agente ${agent}`);

    // Puede editar la suya, pero no la que le asignó el administrador.
    await expect(row(page, assignedByAdmin).getByRole('button', { name: /^Editar la tarea/ })).toHaveCount(0);
    await row(page, own).getByRole('button', { name: /^Editar la tarea/ }).click();
    await dialog.getByLabel('Título *').fill(`${own} (editada)`);
    await dialog.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(row(page, `${own} (editada)`)).toBeVisible();
  });

  test('el administrador reasigna una tarea desde la edición', async ({ page }) => {
    const agent = `e2e.d${unique()}`;
    await createAgent(page, agent, PASSWORD);
    const title = `E2E reasignar ${unique()}`;
    await createAssignedTask(page, title, 'Administrador Demo');

    await row(page, title).getByRole('button', { name: /^Editar la tarea/ }).click();
    const dialog = page.getByRole('dialog');
    await chooseAssignee(page, `Agente ${agent}`);
    await dialog.getByRole('button', { name: 'Guardar cambios' }).click();

    await expect(row(page, title)).toContainText(`Agente ${agent}`);
  });

  test('al eliminar un usuario no puede entrar y sus tareas abiertas quedan sin asignar', async ({ page }) => {
    const agent = `e2e.e${unique()}`;
    await createAgent(page, agent, PASSWORD);
    const title = `E2E de eliminado ${unique()}`;
    await createAssignedTask(page, title, `Agente ${agent}`);

    await page.getByRole('link', { name: 'Usuarios' }).click();
    const userRow = page.locator('.users-table tbody tr', { hasText: `@${agent}` });
    await userRow.getByRole('button', { name: /^Eliminar a / }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Eliminar', exact: true }).click();
    await expect(page.getByText(`Usuario "${agent}" eliminado. 1 tarea(s) abiertas quedaron sin asignar.`)).toBeVisible();
    await expect(userRow).toHaveCount(0);

    await page.getByRole('link', { name: 'Tareas' }).click();
    await expect(row(page, title)).toContainText('Sin asignar');
    await logout(page);

    await loginAs(page, agent, PASSWORD);
    await expect(page.locator('.v-alert')).toHaveText('Usuario o contraseña incorrectos.');
    expect(credentials.username).not.toBe(agent);
  });
});
