import { createAgent, credentials, expect, loginAs, logout, test, unique } from './fixtures';


test.describe('Administración de usuarios', () => {
  test('el administrador crea un agente, que entra sin acceso al módulo de usuarios', async ({ page }) => {
    const username = `e2e.${unique()}`;
    await createAgent(page, username, 'Inicial-2026x');
    await logout(page);

    await loginAs(page, username, 'Inicial-2026x');
    await expect(page).toHaveURL(/\/tasks/);
    await expect(page.getByRole('link', { name: 'Usuarios' })).toHaveCount(0);

    await page.goto('/users');
    await expect(page).toHaveURL(/\/tasks/);
  });

  test('la política de contraseñas se valida antes de enviar', async ({ page }) => {
    await loginAs(page, credentials.username, credentials.password);
    await page.getByRole('link', { name: 'Usuarios' }).click();
    await page.getByRole('button', { name: 'Nuevo usuario' }).click();

    await page.getByLabel('Contraseña inicial *').fill('debil');
    await page.getByRole('button', { name: 'Crear usuario' }).click();

    await expect(page.getByText('Mínimo 10 caracteres.')).toBeVisible();
  });

  test('el administrador no puede desactivarse a sí mismo', async ({ page }) => {
    await loginAs(page, credentials.username, credentials.password);
    await page.getByRole('link', { name: 'Usuarios' }).click();

    const selfRow = page.locator('.users-table tbody tr', { hasText: '(tú)' });
    await expect(selfRow.getByRole('button', { name: /^Desactivar a / })).toBeDisabled();
  });

  test('desactivar a un agente le impide iniciar sesión; reactivarlo lo habilita', async ({ page }) => {
    const username = `e2e.${unique()}`;
    await createAgent(page, username, 'Inicial-2026x');
    const row = page.locator('.users-table tbody tr', { hasText: `@${username}` });

    await row.getByRole('button', { name: /^Desactivar a / }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Desactivar' }).click();
    await expect(row).toContainText('Inactivo');
    await logout(page);

    await loginAs(page, username, 'Inicial-2026x');
    await expect(page.locator('.v-alert')).toHaveText('Usuario o contraseña incorrectos.');
  });

  test('el administrador restablece la contraseña de un agente', async ({ page }) => {
    const username = `e2e.${unique()}`;
    await createAgent(page, username, 'Inicial-2026x');
    const row = page.locator('.users-table tbody tr', { hasText: `@${username}` });

    await row.getByRole('button', { name: /^Restablecer la contraseña de / }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Nueva contraseña *', { exact: true }).fill('Restablecida-2026x');
    await dialog.getByLabel('Confirmar contraseña *', { exact: true }).fill('Restablecida-2026x');
    await dialog.getByRole('button', { name: 'Restablecer', exact: true }).click();
    await expect(page.getByText(`Contraseña de "${username}" restablecida.`)).toBeVisible();
    await logout(page);

    await loginAs(page, username, 'Restablecida-2026x');
    await expect(page).toHaveURL(/\/tasks/);
  });
});

test.describe('Cambio de la propia contraseña', () => {
  test('un agente cambia su contraseña y solo la nueva funciona', async ({ page }) => {
    const username = `e2e.${unique()}`;
    await createAgent(page, username, 'Inicial-2026x');
    await logout(page);
    await loginAs(page, username, 'Inicial-2026x');

    await page.getByRole('button', { name: /^Menú de / }).click();
    await page.getByRole('listitem').filter({ hasText: 'Cambiar mi contraseña' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Contraseña actual *', { exact: true }).fill('equivocada');
    await dialog.getByLabel('Nueva contraseña *', { exact: true }).fill('Propia-2026xyz');
    await dialog.getByLabel('Confirmar nueva contraseña *', { exact: true }).fill('Propia-2026xyz');
    await dialog.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(dialog.getByText('La contraseña actual no es correcta.')).toBeVisible();

    await dialog.getByLabel('Contraseña actual *', { exact: true }).fill('Inicial-2026x');
    await dialog.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(page.getByText('Tu contraseña se actualizó correctamente.')).toBeVisible();
    await logout(page);

    await loginAs(page, username, 'Inicial-2026x');
    await expect(page.locator('.v-alert')).toHaveText('Usuario o contraseña incorrectos.');
    await loginAs(page, username, 'Propia-2026xyz');
    await expect(page).toHaveURL(/\/tasks/);
  });
});
