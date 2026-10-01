import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { bearerFor, buildTestContext, TEST_AGENT, type TestContext } from '../helpers/fakes.js';

let ctx: TestContext;

beforeEach(async () => {
  ctx = await buildTestContext();
});

const AGENT_ID = 2;
const listTasks = (token: string) =>
  request(ctx.app).get('/api/v1/tasks').set('Authorization', token);
const asAdmin = () => bearerFor(ctx, 'ADMIN');

/** Las sesiones abiertas se revalidan contra la BD en cada petición. */
describe('Vigencia de las sesiones', () => {
  it('desactivar a un usuario invalida su token de inmediato', async () => {
    const agentToken = bearerFor(ctx, 'AGENT');
    expect((await listTasks(agentToken)).status).toBe(200);

    await request(ctx.app)
      .patch(`/api/v1/users/${AGENT_ID}/status`)
      .set('Authorization', asAdmin())
      .send({ isActive: false });

    const res = await listTasks(agentToken);
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Tu sesión ya no es válida. Inicia sesión de nuevo.');
  });

  it('eliminar a un usuario invalida su token de inmediato', async () => {
    const agentToken = bearerFor(ctx, 'AGENT');

    await request(ctx.app).delete(`/api/v1/users/${AGENT_ID}`).set('Authorization', asAdmin());

    expect((await listTasks(agentToken)).status).toBe(401);
  });

  it('un cambio de rol aplica en la siguiente petición, sin esperar a que expire el token', async () => {
    // El agente pasa a administrador: su token (que dice AGENT) ya puede administrar usuarios.
    const agentToken = bearerFor(ctx, 'AGENT');
    expect(
      (await request(ctx.app).get('/api/v1/users').set('Authorization', agentToken)).status,
    ).toBe(403);

    await request(ctx.app)
      .patch(`/api/v1/users/${AGENT_ID}`)
      .set('Authorization', asAdmin())
      .send({ fullName: 'Agente ascendido', role: 'ADMIN' });
    expect(
      (await request(ctx.app).get('/api/v1/users').set('Authorization', agentToken)).status,
    ).toBe(200);

    // Y al quitarle el rol, pierde el acceso de inmediato.
    await request(ctx.app)
      .patch(`/api/v1/users/${AGENT_ID}`)
      .set('Authorization', asAdmin())
      .send({ fullName: 'Agente', role: 'AGENT' });
    expect(
      (await request(ctx.app).get('/api/v1/users').set('Authorization', agentToken)).status,
    ).toBe(403);
  });

  it('restablecer la contraseña cierra las sesiones abiertas de ese usuario', async () => {
    const agentToken = bearerFor(ctx, 'AGENT');

    await request(ctx.app)
      .put(`/api/v1/users/${AGENT_ID}/password`)
      .set('Authorization', asAdmin())
      .send({ newPassword: 'Restablecida-2026' });

    expect((await listTasks(agentToken)).status).toBe(401);
  });

  it('al cambiar su propia contraseña, la sesión nueva funciona y la anterior no', async () => {
    const oldToken = bearerFor(ctx, 'AGENT');

    const res = await request(ctx.app)
      .put('/api/v1/account/password')
      .set('Authorization', oldToken)
      .send({ currentPassword: TEST_AGENT.password, newPassword: 'Nueva-Clave-2026' });

    expect(res.status).toBe(200);
    expect((await listTasks(`Bearer ${String(res.body.token)}`)).status).toBe(200);
    expect((await listTasks(oldToken)).status).toBe(401);
  });
});
