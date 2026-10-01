import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from '@/core/http/apiClient';
import { ApiError } from '@/core/http/apiError';

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function setup(token: string | null, response: Response | Error) {
  const fetchFn = vi.fn<typeof fetch>(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  );
  const onUnauthorized = vi.fn();
  const client = createApiClient({
    baseUrl: '/api/v1',
    getToken: () => token,
    onUnauthorized,
    fetchFn,
  });
  return { client, fetchFn, onUnauthorized };
}

describe('createApiClient', () => {
  it('envía el token Bearer y omite parámetros vacíos de la query', async () => {
    const { client, fetchFn } = setup('abc', jsonResponse(200, { ok: true }));

    await client.get('/tasks', { status: null, page: 2, pageSize: undefined });

    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe('/api/v1/tasks?page=2');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer abc');
  });

  it('convierte el formato de error del backend en ApiError con detalles por campo', async () => {
    const body = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Datos inválidos',
        details: [{ field: 'title', message: 'Requerido' }],
      },
    };
    const { client } = setup('abc', jsonResponse(400, body));

    const error = await client.post('/tasks', {}).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      details: [{ field: 'title' }],
    });
  });

  it('cierra la sesión ante un 401 cuando había sesión activa', async () => {
    const { client, onUnauthorized } = setup(
      'expirado',
      jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'x' } }),
    );

    await expect(client.get('/tasks')).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it('no cierra sesión en un login fallido (401 sin token)', async () => {
    const { client, onUnauthorized } = setup(
      null,
      jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'x' } }),
    );

    await expect(client.post('/auth/login', {})).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('informa un error de red con un mensaje comprensible', async () => {
    const { client } = setup(null, new TypeError('Failed to fetch'));

    await expect(client.get('/tasks')).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });

  it('usa un mensaje genérico si el servidor responde algo que no es JSON', async () => {
    const { client } = setup('abc', new Response('<html>Bad Gateway</html>', { status: 502 }));

    await expect(client.get('/tasks')).rejects.toMatchObject({
      status: 502,
      message: 'Ocurrió un error inesperado. Intenta de nuevo.',
    });
  });
});
