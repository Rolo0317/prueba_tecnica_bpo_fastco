import type { APIRequestContext, Page } from '@playwright/test';
import {
  credentials,
  expect,
  fillCredentials,
  logout,
  passCaptcha,
  submitLogin,
  test,
  unique,
} from './fixtures';

const MAIL_API = process.env.MAIL_API_URL ?? `http://localhost:${process.env.MAIL_UI_PORT ?? '8025'}/api/v1`;

/** Lee de Mailpit el último correo enviado a `to` y devuelve el enlace de restablecimiento. */
async function resetLinkFor(request: APIRequestContext, to: string): Promise<string> {
  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const search = await request.get(`${MAIL_API}/search?query=${encodeURIComponent(`to:${to}`)}`);
        const { messages } = (await search.json()) as { messages: { ID: string }[] };
        const [latest] = messages;
        if (!latest) return null;
        const message = (await (await request.get(`${MAIL_API}/message/${latest.ID}`)).json()) as {
          Text: string;
        };
        link = /https?:\/\/\S+\/reset-password\?token=[A-Za-z0-9_-]+/.exec(message.Text)?.[0];
        return link ?? null;
      },
      { timeout: 15_000 },
    )
    .not.toBeNull();
  return link ?? '';
}

async function adminCreatesUserWithEmail(page: Page, username: string, email: string, password: string) {
  await page.goto('/login');
  await fillCredentials(page, credentials.username, credentials.password);
  await submitLogin(page);
  await expect(page).toHaveURL(/\/tasks/);
  await page.goto('/users');
  await page.getByRole('button', { name: 'Nuevo usuario' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Usuario *').fill(username);
  await dialog.getByLabel('Nombre completo *').fill(`Persona ${username}`);
  await dialog.getByLabel('Correo').fill(email);
  await dialog.getByLabel('Contraseña inicial *', { exact: true }).fill(password);
  await dialog.getByLabel('Confirmar contraseña *', { exact: true }).fill(password);
  await dialog.getByRole('button', { name: 'Crear usuario' }).click();
  await expect(page.getByText(`Usuario "${username}" creado.`)).toBeVisible();
}

test.describe('Protección del login', () => {
  test('sin marcar "No soy un robot" no se envía el login', async ({ page }) => {
    await page.goto('/login');
    await fillCredentials(page, credentials.username, credentials.password);
    await page.getByRole('button', { name: 'Ingresar' }).click();

    await expect(page.getByText('Confirma que no eres un robot.')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('una contraseña incorrecta informa cuántos intentos quedan', async ({ page }) => {
    await page.goto('/login');
    await fillCredentials(page, credentials.username, 'incorrecta-de-prueba');
    await submitLogin(page);

    await expect(page.getByRole('alert').filter({ hasText: /Te quedan? \d+ intentos?/ })).toBeVisible();
  });
});

test.describe('¿Olvidaste tu contraseña?', () => {
  test('una cuenta inexistente recibe el mismo mensaje neutral (no revela qué cuentas existen)', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: '¿Olvidaste tu contraseña?' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Usuario o correo').fill(`nadie.${unique()}@fastco.test`);
    await passCaptcha(dialog);
    await dialog.getByRole('button', { name: 'Solicitar restablecimiento' }).click();

    await expect(dialog.getByRole('status')).toContainText(/Si la cuenta existe/);
    await expect(dialog.getByRole('alert')).toHaveCount(0);
  });

  test('llega un enlace al correo y con él se crea una contraseña nueva', async ({ page, request }) => {
    const id = unique();
    const username = `e2e.reset${id}`;
    const email = `${username}@fastco.test`;
    await adminCreatesUserWithEmail(page, username, email, 'Inicial-E2e-2026');
    await logout(page);

    await page.getByRole('button', { name: '¿Olvidaste tu contraseña?' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Usuario o correo').fill(email);
    await passCaptcha(dialog);
    await dialog.getByRole('button', { name: 'Solicitar restablecimiento' }).click();
    await expect(dialog.getByText(/te enviamos un enlace/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Entendido' }).click();

    await page.goto(await resetLinkFor(request, email));
    await expect(page).not.toHaveURL(/token=/); // el token se quita de la URL
    await page.getByLabel('Contraseña nueva', { exact: true }).fill('Nueva-E2e-2026x');
    await page.getByLabel('Confirmar contraseña', { exact: true }).fill('Nueva-E2e-2026x');
    await page.getByRole('button', { name: 'Guardar contraseña' }).click();
    await expect(page.getByText(/tu contraseña quedó actualizada/)).toBeVisible();

    await page.getByRole('link', { name: 'Ir a iniciar sesión' }).click();
    await fillCredentials(page, username, 'Nueva-E2e-2026x');
    await submitLogin(page);
    await expect(page).toHaveURL(/\/tasks/);
  });
});

test.describe('Buscadores y filtros', () => {
  test('usuarios: buscar por nombre o usuario', async ({ tasksPage: page }) => {
    await page.goto('/users');
    await page.getByRole('textbox', { name: 'Buscar por nombre, usuario o correo' }).fill(credentials.username);

    await expect(page.locator('.users-table tbody tr').first()).toContainText(`@${credentials.username}`);
    await page.getByRole('textbox', { name: 'Buscar por nombre, usuario o correo' }).fill('no-existe-zzz');
    await expect(page.getByText('Ningún usuario coincide con la búsqueda o los filtros.')).toBeVisible();
  });

  test('tareas: buscar por título y filtrar por prioridad (en la URL)', async ({ tasksPage: page }) => {
    const title = `E2E semáforo ${unique()}`;
    await page.getByRole('button', { name: 'Nueva tarea' }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Título *').fill(title);
    await dialog.getByRole('radio', { name: 'Alta' }).click();
    await expect(dialog.getByText(/atender hoy/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Crear tarea' }).click();
    await expect(page.getByText(`Tarea "${title}" creada.`)).toBeVisible();

    await page.getByRole('textbox', { name: 'Buscar por título' }).fill(title);
    await expect(page).toHaveURL(/q=/);
    await expect(page.locator('.task-table tbody tr')).toHaveCount(1);
    await expect(page.locator('.task-table tbody tr').first()).toContainText(title);
  });
});
