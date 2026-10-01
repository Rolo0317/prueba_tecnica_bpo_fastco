import { createAgent, expect, loginAs, test, unique } from './fixtures';

const PASSWORD = 'Inicial-2026x';

test.describe('Vigencia de las sesiones', () => {
  test('si el administrador desactiva a un agente, su sesión abierta se cierra de inmediato', async ({
    browser,
  }) => {
    const agent = `e2e.s${unique()}`;
    const adminContext = await browser.newContext();
    const agentContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    const agentPage = await agentContext.newPage();

    await createAgent(adminPage, agent, PASSWORD);
    await loginAs(agentPage, agent, PASSWORD);
    await expect(agentPage).toHaveURL(/\/tasks/);

    // Mientras el agente sigue dentro, el administrador lo desactiva desde otro navegador.
    const userRow = adminPage.locator('.users-table tbody tr', { hasText: `@${agent}` });
    await userRow.getByRole('button', { name: /^Desactivar a / }).click();
    await adminPage.getByRole('dialog').getByRole('button', { name: 'Desactivar' }).click();
    await expect(userRow).toContainText('Inactivo');

    // La siguiente acción del agente ya no está autorizada: vuelve al login con el aviso.
    await agentPage.getByRole('button', { name: 'Actualizar listado e indicadores' }).click();
    await expect(agentPage).toHaveURL(/\/login\?expired=1/);
    await expect(agentPage.getByText(/Tu sesión expiró o dejó de ser válida/)).toBeVisible();

    await adminContext.close();
    await agentContext.close();
  });

  test('cambiar la propia contraseña no saca de la sesión actual', async ({ page }) => {
    const agent = `e2e.p${unique()}`;
    await createAgent(page, agent, PASSWORD);
    await page.getByRole('button', { name: /^Menú de / }).click();
    await page.getByRole('listitem').filter({ hasText: 'Salir' }).click();
    await loginAs(page, agent, PASSWORD);

    await page.getByRole('button', { name: /^Menú de / }).click();
    await page.getByRole('listitem').filter({ hasText: 'Cambiar mi contraseña' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Contraseña actual *', { exact: true }).fill(PASSWORD);
    await dialog.getByLabel('Nueva contraseña *', { exact: true }).fill('Renovada-2026xy');
    await dialog.getByLabel('Confirmar nueva contraseña *', { exact: true }).fill('Renovada-2026xy');
    await dialog.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(page.getByText('Tu contraseña se actualizó correctamente.')).toBeVisible();

    // La sesión sigue funcionando con el token renovado.
    await page.getByRole('button', { name: 'Actualizar listado e indicadores' }).click();
    await expect(page).toHaveURL(/\/tasks/);
    await expect(page.getByRole('heading', { name: 'Tareas operativas' })).toBeVisible();
  });
});
