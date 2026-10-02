import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  addUser,
  AREA,
  bearerFor,
  buildTestContext,
  ROLE,
  type TestContext,
} from '../helpers/fakes.js';

let ctx: TestContext;
const PASSWORD = 'Clave-Inicial-2026';

beforeEach(async () => {
  ctx = await buildTestContext();
  await addUser(ctx.users, {
    username: 'laura.gomez',
    fullName: 'Laura Gómez',
    email: 'laura.gomez@fastco.test',
    password: PASSWORD,
    roleId: ROLE.COLLABORATOR,
    areaId: AREA.OPERATIONS,
  });
});

const requestReset = (username: string) =>
  request(ctx.app).post('/api/v1/auth/password-reset-requests').send({ username });
const resetPassword = (token: string, newPassword = 'Nueva-Clave-2026') =>
  request(ctx.app).post('/api/v1/auth/password-resets').send({ token, newPassword });
const login = (password: string) =>
  request(ctx.app).post('/api/v1/auth/login').send({ username: 'laura.gomez', password });

/** El token viaja en el enlace del último correo enviado. */
function tokenFromLastMail(): string {
  const mail = ctx.mail.sent.at(-1);
  const token = /token=([A-Za-z0-9_-]{43})/.exec(mail?.text ?? '')?.[1];
  if (!token) throw new Error('No se envió el enlace.');
  return token;
}

describe('Restablecer la contraseña por correo', () => {
  it('con usuario o con correo se envía un enlace; la respuesta no revela si existe', async () => {
    const byUsername = await requestReset('laura.gomez');
    const byEmail = await requestReset('LAURA.GOMEZ@fastco.test');
    const unknown = await requestReset('nadie@fastco.test');

    expect([byUsername.status, byEmail.status, unknown.status]).toEqual([202, 202, 202]);
    expect(byUsername.body).toEqual(unknown.body);
    expect(ctx.mail.sent).toHaveLength(2);
    expect(ctx.mail.sent[0]).toMatchObject({ to: 'laura.gomez@fastco.test' });
    expect(ctx.mail.sent[0]?.text).toContain('http://localhost:8080/reset-password?token=');
  });

  it('el enlace asigna la contraseña nueva: la anterior deja de servir', async () => {
    await requestReset('laura.gomez');

    const res = await resetPassword(tokenFromLastMail());

    expect(res.status).toBe(204);
    expect((await login(PASSWORD)).status).toBe(401);
    expect((await login('Nueva-Clave-2026')).status).toBe(200);
  });

  it('el enlace sirve una sola vez', async () => {
    await requestReset('laura.gomez');
    const token = tokenFromLastMail();
    await resetPassword(token);

    const replay = await resetPassword(token, 'Otra-Clave-2026');

    expect(replay.status).toBe(400);
  });

  it('400 con un token inventado o una contraseña que no cumple la política', async () => {
    await requestReset('laura.gomez');

    const invented = await resetPassword('a'.repeat(43));
    const weak = await resetPassword(tokenFromLastMail(), 'corta');

    expect(invented.status).toBe(400);
    expect(weak.status).toBe(400);
    expect(weak.body.error.details[0].field).toBe('newPassword');
  });

  it('una cuenta sin correo queda como solicitud para administración (sin correo enviado)', async () => {
    await requestReset('agente');

    const pending = await request(ctx.app)
      .get('/api/v1/users?pendingReset=true')
      .set('Authorization', bearerFor(ctx));

    expect(ctx.mail.sent).toHaveLength(0);
    expect(pending.body.data.map((u: { username: string }) => u.username)).toEqual(['agente']);
  });
});
