import type { Page } from '@playwright/test';
import { expect, login, loginAs, logout, test, unique } from './fixtures';

const PASSWORD = 'E2e-Clave-2026';

async function loginAdmin(page: Page): Promise<void> {
  await page.goto('/login');
  await login(page);
  await expect(page).toHaveURL(/\/tasks/);
}

async function chooseOption(page: Page, field: ReturnType<Page['getByRole']>, name: string) {
  await field.click();
  await field.fill('');
  await field.pressSequentially(name);
  // El nombre accesible de la opción incluye la descripción del rol.
  await page.getByRole('option').filter({ hasText: name }).first().click();
}

/** Crea un usuario con rol y área; el área se escribe y, si no existe, se crea al guardar. */
async function createUser(page: Page, username: string, role: string, area: string) {
  await page.goto('/users');
  await page.getByRole('button', { name: 'Nuevo usuario' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Usuario *').fill(username);
  await dialog.getByLabel('Nombre completo *').fill(`Persona ${username}`);
  await chooseOption(page, dialog.getByRole('combobox', { name: 'Rol *' }), role);
  await dialog.getByRole('combobox', { name: 'Área' }).fill(area);
  await dialog.getByLabel('Contraseña inicial *', { exact: true }).click();
  await dialog.getByLabel('Contraseña inicial *', { exact: true }).fill(PASSWORD);
  await dialog.getByLabel('Confirmar contraseña *', { exact: true }).fill(PASSWORD);
  await dialog.getByRole('button', { name: 'Crear usuario' }).click();
  await expect(page.getByText(`Usuario "${username}" creado.`)).toBeVisible();
}

async function createTask(page: Page, title: string, area: string | null) {
  await page.goto('/tasks');
  await page.getByRole('button', { name: 'Nueva tarea' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Título *').fill(title);
  if (area) {
    const field = dialog.getByRole('combobox', { name: 'Área' });
    await field.pressSequentially(area);
    await page.getByRole('option', { name: area, exact: true }).click();
  }
  await dialog.getByRole('button', { name: 'Crear tarea' }).click();
  await expect(page.getByText(`Tarea "${title}" creada.`)).toBeVisible();
}

const navLink = (page: Page, name: string) => page.getByRole('link', { name, exact: true });

test.describe('Roles, áreas y permisos', () => {
  test('el administrador crea un usuario con rol y un área nueva desde el mismo formulario', async ({
    page,
  }) => {
    const id = unique();
    const area = `E2E Área ${id}`;
    await loginAdmin(page);

    await createUser(page, `e2e.sup${id}`, 'Supervisor', area);

    const row = page.locator('tr', { hasText: `e2e.sup${id}` });
    await expect(row).toContainText('Supervisor');
    await expect(row).toContainText(area);
    await navLink(page, 'Áreas').click();
    await expect(page.locator('tr', { hasText: area })).toContainText('Activa');
  });

  test('un supervisor ve las tareas de su área, no las de otras, ni la administración', async ({
    page,
  }) => {
    const id = unique();
    const area = `E2E Soporte ${id}`;
    const inArea = `E2E del área ${id}`;
    const outside = `E2E de otra área ${id}`;
    await loginAdmin(page);
    await createUser(page, `e2e.sup${id}`, 'Supervisor', area);
    await createTask(page, inArea, area);
    await createTask(page, outside, null);
    await logout(page);

    await loginAs(page, `e2e.sup${id}`, PASSWORD);
    await expect(page).toHaveURL(/\/tasks/);
    await expect(page.getByText(`Las tareas del área ${area}`)).toBeVisible();
    await expect(page.locator('tr', { hasText: inArea })).toContainText(area);
    await expect(page.locator('tr', { hasText: outside })).toHaveCount(0);
    await expect(navLink(page, 'Usuarios')).toHaveCount(0);
    await expect(navLink(page, 'Roles')).toHaveCount(0);
  });

  test('un rol nuevo con un solo permiso habilita solo esa pantalla', async ({ page }) => {
    const id = unique();
    const role = `E2E Gestor de áreas ${id}`;
    await loginAdmin(page);

    await navLink(page, 'Roles').click();
    await page.getByRole('button', { name: 'Nuevo rol' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Nombre del rol *').fill(role);
    await dialog.getByLabel('Administrar áreas').check();
    await dialog.getByRole('button', { name: 'Crear rol' }).click();
    await expect(page.getByText(`Rol "${role}" creado.`)).toBeVisible();
    await expect(page.getByRole('listitem').filter({ hasText: role })).toContainText(
      'Administrar áreas',
    );

    await createUser(page, `e2e.ga${id}`, role, `E2E Área ${id}`);
    await logout(page);
    await loginAs(page, `e2e.ga${id}`, PASSWORD);

    await expect(navLink(page, 'Áreas')).toBeVisible();
    await expect(navLink(page, 'Usuarios')).toHaveCount(0);
    await expect(navLink(page, 'Roles')).toHaveCount(0);
    await page.goto('/roles');
    await expect(page).toHaveURL(/\/tasks/);
  });

  test('el rol Administrador está protegido', async ({ page }) => {
    await loginAdmin(page);
    await navLink(page, 'Roles').click();

    const adminCard = page.getByRole('listitem').filter({ hasText: 'Rol protegido' });
    await expect(adminCard.getByRole('button', { name: 'Editar el rol Administrador' })).toBeDisabled();
  });
});
