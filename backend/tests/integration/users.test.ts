import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  bearerFor,
  buildTestContext,
  TEST_AGENT,
  TEST_USER,
  type TestContext,
} from '../helpers/fakes.js';

let ctx: TestContext;

beforeEach(async () => {
  ctx = await buildTestContext();
});

const asAdmin = () => bearerFor(ctx, 'ADMIN');
const asAgent = () => bearerFor(ctx, 'AGENT');
const NEW_USER = {
  username: 'nuevo.agente',
  fullName: 'Nuevo Agente',
  role: 'AGENT',
  password: 'Segura-2026x',
};

const login = (username: string, password: string) =>
  request(ctx.app).post('/api/v1/auth/login').send({ username, password });

describe('Administración de usuarios: autorización', () => {
  it.each([
    ['GET', '/api/v1/users'],
    ['POST', '/api/v1/users'],
    ['PATCH', '/api/v1/users/2'],
    ['PATCH', '/api/v1/users/2/status'],
    ['PUT', '/api/v1/users/2/password'],
  ])('403 para un agente en %s %s', async (method, path) => {
    const method_ = method.toLowerCase() as 'get' | 'post' | 'patch' | 'put';
    const res = await request(ctx.app)[method_](path).set('Authorization', asAgent());

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('401 sin token', async () => {
    expect((await request(ctx.app).get('/api/v1/users')).status).toBe(401);
  });
});

describe('Administración de usuarios: casos de uso', () => {
  it('GET lista los usuarios paginados sin exponer hashes', async () => {
    const res = await request(ctx.app).get('/api/v1/users').set('Authorization', asAdmin());

    expect(res.status).toBe(200);
    expect(res.body.pagination).toEqual({ page: 1, pageSize: 10, total: 2, totalPages: 1 });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|hashed:/);
  });

  it('POST 201 crea un usuario que puede iniciar sesión con su rol', async () => {
    const res = await request(ctx.app)
      .post('/api/v1/users')
      .set('Authorization', asAdmin())
      .send(NEW_USER);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ username: 'nuevo.agente', role: 'AGENT', isActive: true });
    expect((await login(NEW_USER.username, NEW_USER.password)).body.user.role).toBe('AGENT');
  });

  it('POST 400 aplica la política de contraseñas y el formato del usuario', async () => {
    const res = await request(ctx.app)
      .post('/api/v1/users')
      .set('Authorization', asAdmin())
      .send({ ...NEW_USER, username: 'con espacios', password: 'corta' });

    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d: { field: string }) => d.field)).toEqual(
      expect.arrayContaining(['username', 'password']),
    );
  });

  it('POST 409 con un nombre de usuario existente', async () => {
    const res = await request(ctx.app)
      .post('/api/v1/users')
      .set('Authorization', asAdmin())
      .send({ ...NEW_USER, username: TEST_AGENT.username });

    expect(res.status).toBe(409);
  });

  it('PATCH edita nombre y rol', async () => {
    const res = await request(ctx.app)
      .patch('/api/v1/users/2')
      .set('Authorization', asAdmin())
      .send({ fullName: 'Agente Senior', role: 'ADMIN' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ fullName: 'Agente Senior', role: 'ADMIN' });
  });

  it('desactivar a un usuario le impide iniciar sesión; reactivarlo lo habilita', async () => {
    const setStatus = (isActive: boolean) =>
      request(ctx.app)
        .patch('/api/v1/users/2/status')
        .set('Authorization', asAdmin())
        .send({ isActive });

    expect((await setStatus(false)).body.isActive).toBe(false);
    expect((await login(TEST_AGENT.username, TEST_AGENT.password)).status).toBe(401);

    await setStatus(true);
    expect((await login(TEST_AGENT.username, TEST_AGENT.password)).status).toBe(200);
  });

  it('409: un administrador no puede desactivarse ni quitarse el rol', async () => {
    const deactivateSelf = await request(ctx.app)
      .patch('/api/v1/users/1/status')
      .set('Authorization', asAdmin())
      .send({ isActive: false });
    const demoteSelf = await request(ctx.app)
      .patch('/api/v1/users/1')
      .set('Authorization', asAdmin())
      .send({ fullName: 'Admin', role: 'AGENT' });

    expect(deactivateSelf.status).toBe(409);
    expect(demoteSelf.status).toBe(409);
  });

  it('PUT 204 restablece la contraseña de otro usuario', async () => {
    const res = await request(ctx.app)
      .put('/api/v1/users/2/password')
      .set('Authorization', asAdmin())
      .send({ newPassword: 'Restablecida-2026' });

    expect(res.status).toBe(204);
    expect((await login(TEST_AGENT.username, TEST_AGENT.password)).status).toBe(401);
    expect((await login(TEST_AGENT.username, 'Restablecida-2026')).status).toBe(200);
  });

  it('404 al operar sobre un usuario inexistente', async () => {
    const res = await request(ctx.app)
      .patch('/api/v1/users/999/status')
      .set('Authorization', asAdmin())
      .send({ isActive: false });

    expect(res.status).toBe(404);
  });
});

describe('Cambio de la propia contraseña (cualquier rol)', () => {
  const changeOwn = (token: string, body: object) =>
    request(ctx.app).put('/api/v1/account/password').set('Authorization', token).send(body);

  it('204: un agente cambia su contraseña y la anterior deja de funcionar', async () => {
    const res = await changeOwn(asAgent(), {
      currentPassword: TEST_AGENT.password,
      newPassword: 'Nueva-Clave-2026',
    });

    expect(res.status).toBe(204);
    expect((await login(TEST_AGENT.username, TEST_AGENT.password)).status).toBe(401);
    expect((await login(TEST_AGENT.username, 'Nueva-Clave-2026')).status).toBe(200);
  });

  it('400 en el campo currentPassword si la actual es incorrecta (no cierra la sesión)', async () => {
    const res = await changeOwn(asAdmin(), {
      currentPassword: 'equivocada',
      newPassword: 'Nueva-Clave-2026',
    });

    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe('currentPassword');
  });

  it('400 si la nueva es igual a la actual o no cumple la política', async () => {
    const same = await changeOwn(asAdmin(), {
      currentPassword: TEST_USER.password,
      newPassword: TEST_USER.password,
    });
    const weak = await changeOwn(asAdmin(), {
      currentPassword: TEST_USER.password,
      newPassword: 'debil',
    });

    expect(same.status).toBe(400);
    expect(same.body.error.details[0].field).toBe('newPassword');
    expect(weak.status).toBe(400);
  });

  it('429 tras varios intentos fallidos (fuerza bruta sobre la contraseña actual)', async () => {
    const attempt = () =>
      changeOwn(asAdmin(), { currentPassword: 'mala', newPassword: 'Nueva-Clave-2026' });
    for (let i = 0; i < 3; i++) await attempt();

    expect((await attempt()).status).toBe(429);
  });
});
