import { defineConfig, devices } from '@playwright/test';

// Credenciales del usuario demo desde el mismo .env que usa docker compose (nada escrito en el código).
try {
  process.loadEnvFile('../.env');
} catch {
  // Sin .env se usan las variables del entorno (por ejemplo, en CI).
}

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  // En CI, cada fallo se publica además como anotación de GitHub (visible sin descargar el reporte).
  reporter: process.env.CI
    ? [['github'], ['list'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${process.env.FRONTEND_PORT ?? '8080'}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'es-CO',
    // Permite usar un Chrome ya instalado en lugar de descargar Chromium.
    ...(process.env.CHROME_PATH && { launchOptions: { executablePath: process.env.CHROME_PATH } }),
  },
  projects: [
    { name: 'escritorio', use: { ...devices['Desktop Chrome'] } },
    { name: 'movil', use: { ...devices['Pixel 7'] } },
  ],
});
