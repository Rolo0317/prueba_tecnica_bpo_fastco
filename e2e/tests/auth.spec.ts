import { credentials, expect, login, test } from './fixtures';

test.describe('Autenticación', () => {
  test('una ruta protegida redirige al login y vuelve a ella tras autenticarse', async ({ page }) => {
    await page.goto('/tasks?status=PENDING');
    await expect(page).toHaveURL(/\/login\?redirect=/);

    await login(page);

    await expect(page).toHaveURL(/\/tasks\?status=PENDING/);
    await expect(page.getByRole('heading', { name: 'Tareas operativas' })).toBeVisible();
  });

  test('credenciales inválidas muestran un error sin revelar si el usuario existe', async ({ page }) => {
    await page.goto('/login');

    await login(page, 'contraseña-incorrecta');

    await expect(page.locator('.v-alert')).toHaveText('Usuario o contraseña incorrectos.');
    await expect(page).toHaveURL(/\/login/);
  });

  test('cerrar sesión impide volver a la página protegida', async ({ page }) => {
    await page.goto('/login');
    await login(page);
    await expect(page).toHaveURL(/\/tasks/);

    await page.getByRole('button', { name: /^Menú de / }).click();
    await page.getByRole('listitem').filter({ hasText: 'Salir' }).click();
    await expect(page).toHaveURL(/\/login/);

    await page.goto('/tasks');
    await expect(page).toHaveURL(/\/login/);
  });

  test('la API rechaza peticiones sin token', async ({ request }) => {
    const response = await request.get('/api/v1/tasks');

    expect(response.status()).toBe(401);
    expect(credentials.username).not.toBe('');
  });
});
