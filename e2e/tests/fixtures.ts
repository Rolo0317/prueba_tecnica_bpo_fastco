import { expect, test as base, type Locator, type Page } from '@playwright/test';

/** Marca "No soy un robot" (espera a que se resuelva el desafío) y envía el login. */
export async function passCaptcha(scope: Page | Locator): Promise<void> {
  const box = scope.getByRole('checkbox', { name: 'No soy un robot' });
  await box.click();
  await expect(box).toHaveAttribute('aria-checked', 'true', { timeout: 15_000 });
}

export async function submitLogin(page: Page): Promise<void> {
  await passCaptcha(page);
  await page.getByRole('button', { name: 'Ingresar' }).click();
}

export const credentials = {
  username: process.env.SEED_ADMIN_USERNAME ?? '',
  password: process.env.SEED_ADMIN_PASSWORD ?? '',
};

export async function login(page: Page, password = credentials.password): Promise<void> {
  await page.getByLabel('Usuario').fill(credentials.username);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await submitLogin(page);
}

/** Página ya autenticada y con la tabla de tareas cargada. */
export const test = base.extend<{ tasksPage: Page }>({
  tasksPage: async ({ page }, use) => {
    await page.goto('/login');
    await login(page);
    await expect(page).toHaveURL(/\/tasks/);
    await expect(page.locator('.task-table tbody tr').first()).toBeVisible();
    await use(page);
  },
});

export { expect };

export const unique = () => Date.now().toString(36);

export async function loginAs(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Usuario').fill(username);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await submitLogin(page);
}

export async function logout(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Menú de / }).click();
  await page.getByRole('listitem').filter({ hasText: 'Salir' }).click();
  await expect(page).toHaveURL(/\/login/);
}

/** El administrador crea un agente nuevo desde el módulo de usuarios. */
export async function createAgent(page: Page, username: string, password: string): Promise<void> {
  // Funciona con o sin sesión de administrador ya iniciada.
  await page.goto('/users');
  // El router redirige al login de forma asíncrona: se espera a que aparezca una de las dos
  // pantallas en lugar de leer la URL justo después de navegar (carrera en máquinas lentas).
  const loginButton = page.getByRole('button', { name: 'Ingresar' });
  await expect(loginButton.or(page.getByRole('heading', { name: 'Usuarios' }))).toBeVisible();
  if (await loginButton.isVisible()) {
    await page.getByLabel('Usuario').fill(credentials.username);
    await page.getByLabel('Contraseña', { exact: true }).fill(credentials.password);
    await submitLogin(page);
  }
  await expect(page).toHaveURL(/\/users/);
  await expect(page.getByRole('heading', { name: 'Usuarios' })).toBeVisible();

  await page.getByRole('button', { name: 'Nuevo usuario' }).click();
  await page.getByLabel('Usuario *').fill(username);
  await page.getByLabel('Nombre completo *').fill(`Agente ${username}`);
  await page.getByLabel('Contraseña inicial *', { exact: true }).fill(password);
  await page.getByLabel('Confirmar contraseña *', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Crear usuario' }).click();

  await expect(page.getByText(`Usuario "${username}" creado.`)).toBeVisible();
}

