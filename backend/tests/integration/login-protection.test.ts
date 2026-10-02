import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { CaptchaChallenge } from '../../src/modules/auth/captcha.service.js';
import { ProofOfWorkCaptcha, solveCaptcha } from '../../src/modules/auth/captcha.service.js';
import {
  bearerFor,
  buildTestContext,
  createTestCaptcha,
  TEST_AGENT,
  type TestContext,
} from '../helpers/fakes.js';

let ctx: TestContext;

const login = (body: object) => request(ctx.app).post('/api/v1/auth/login').send(body);
const challenge = async (): Promise<CaptchaChallenge> =>
  (await request(ctx.app).get('/api/v1/auth/captcha')).body as CaptchaChallenge;

describe('Captcha "No soy un robot"', () => {
  beforeEach(async () => {
    ctx = await buildTestContext({ captcha: createTestCaptcha() });
  });

  it('el login exige el captcha resuelto', async () => {
    const res = await login({ username: TEST_AGENT.username, password: TEST_AGENT.password });

    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe('captcha');
  });

  it('con el captcha resuelto, el login funciona', async () => {
    const captcha = solveCaptcha(await challenge());

    const res = await login({
      username: TEST_AGENT.username,
      password: TEST_AGENT.password,
      captcha,
    });

    expect(res.status).toBe(200);
  });

  it('una solución no se puede reutilizar', async () => {
    const captcha = solveCaptcha(await challenge());
    await login({ username: TEST_AGENT.username, password: TEST_AGENT.password, captcha });

    const replay = await login({
      username: TEST_AGENT.username,
      password: TEST_AGENT.password,
      captcha,
    });

    expect(replay.status).toBe(400);
  });

  it('rechaza un desafío alterado (firma inválida)', async () => {
    const real = await challenge();
    const forged = solveCaptcha({ ...real, signature: 'a'.repeat(64) });

    const res = await login({
      username: TEST_AGENT.username,
      password: TEST_AGENT.password,
      captcha: forged,
    });

    expect(res.status).toBe(400);
  });

  it('GET /auth/captcha informa enabled: false si está desactivado', async () => {
    ctx = await buildTestContext();

    expect((await request(ctx.app).get('/api/v1/auth/captcha')).body).toEqual({ enabled: false });
  });
});

describe('ProofOfWorkCaptcha', () => {
  it('rechaza una solución vencida', () => {
    let now = 1_000_000;
    const captcha = new ProofOfWorkCaptcha('secreto', {
      maxNumber: 20,
      ttlMs: 1000,
      now: () => now,
    });
    const solution = solveCaptcha(captcha.create());

    now += 5_000;

    expect(captcha.verify(solution)).toBe(false);
  });

  it('rechaza basura sin lanzar errores', () => {
    const captcha = createTestCaptcha();

    expect(captcha.verify('no-es-base64-json')).toBe(false);
    expect(captcha.verify(undefined)).toBe(false);
  });
});

describe('Límite de intentos visible', () => {
  beforeEach(async () => {
    ctx = await buildTestContext();
  });

  it('cada intento fallido informa cuántos quedan y el bloqueo, cuánto esperar', async () => {
    const wrong = () => login({ username: TEST_AGENT.username, password: 'equivocada' });

    const first = await wrong();
    const second = await wrong();
    await wrong();
    const blocked = await wrong();

    expect(first.body.error.meta).toEqual({ attemptsRemaining: 2 });
    expect(second.body.error.meta).toEqual({ attemptsRemaining: 1 });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.meta.retryAfterSeconds).toBeGreaterThan(0);
  });
});

describe('¿Olvidaste tu contraseña?', () => {
  beforeEach(async () => {
    ctx = await buildTestContext();
  });

  const requestReset = (username: string) =>
    request(ctx.app).post('/api/v1/auth/password-reset-requests').send({ username });

  it('responde 202 con el mismo mensaje exista o no el usuario', async () => {
    const existing = await requestReset(TEST_AGENT.username);
    const unknown = await requestReset('fantasma');

    expect(existing.status).toBe(202);
    expect(unknown.status).toBe(202);
    expect(existing.body).toEqual(unknown.body);
  });

  it('la solicitud aparece en usuarios y se resuelve al restablecer la contraseña', async () => {
    await requestReset(TEST_AGENT.username);
    const pending = () =>
      request(ctx.app).get('/api/v1/users?pendingReset=true').set('Authorization', bearerFor(ctx));

    const before = await pending();
    await request(ctx.app)
      .put('/api/v1/users/2/password')
      .set('Authorization', bearerFor(ctx))
      .send({ newPassword: 'Restablecida-2026' });
    const after = await pending();

    expect(before.body.data[0]).toMatchObject({ username: 'agente' });
    expect(before.body.data[0].passwordResetRequestedAt).toEqual(expect.any(String));
    expect(after.body.pagination.total).toBe(0);
  });

  it('limita las solicitudes por IP', async () => {
    const statuses = [];
    for (let i = 0; i < 6; i++) statuses.push((await requestReset(`u${String(i)}`)).status);

    expect(statuses.slice(0, 5)).toEqual([202, 202, 202, 202, 202]);
    expect(statuses[5]).toBe(429);
  });
});
