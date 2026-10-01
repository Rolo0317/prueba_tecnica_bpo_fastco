import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { bearerFor, buildTestContext, TEST_USER, type TestContext } from '../helpers/fakes.js';

let ctx: TestContext;

beforeEach(async () => {
  ctx = await buildTestContext();
});

const createTask = (body: object) =>
  request(ctx.app).post('/api/v1/tasks').set('Authorization', bearerFor(ctx)).send(body);

describe('POST /api/v1/auth/login', () => {
  it('200 con credenciales válidas: devuelve token utilizable', async () => {
    const { username, password } = TEST_USER;
    const res = await request(ctx.app).post('/api/v1/auth/login').send({ username, password });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ tokenType: 'Bearer', expiresIn: 3600, user: { username: 'agente' } });

    const protectedRes = await request(ctx.app)
      .get('/api/v1/tasks')
      .set('Authorization', `Bearer ${String(res.body.token)}`);
    expect(protectedRes.status).toBe(200);
  });

  it('401 con contraseña incorrecta', async () => {
    const res = await request(ctx.app)
      .post('/api/v1/auth/login')
      .send({ username: TEST_USER.username, password: 'mala' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('400 con el detalle de cada campo inválido', async () => {
    const res = await request(ctx.app).post('/api/v1/auth/login').send({ username: '' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.map((d: { field: string }) => d.field)).toEqual(['username', 'password']);
  });

  it('429 después de varios intentos fallidos (fuerza bruta)', async () => {
    const attempt = () =>
      request(ctx.app).post('/api/v1/auth/login').send({ username: 'agente', password: 'mala' });
    for (let i = 0; i < 3; i++) await attempt();

    const res = await attempt();

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('TOO_MANY_REQUESTS');
  });
});

describe('Rutas protegidas', () => {
  it.each([
    ['GET', '/api/v1/tasks'],
    ['POST', '/api/v1/tasks'],
    ['PATCH', '/api/v1/tasks/1/status'],
    ['GET', '/api/v1/task-statuses'],
  ])('401 en %s %s sin token', async (method, path) => {
    const res = await request(ctx.app)[method.toLowerCase() as 'get'](path);

    expect(res.status).toBe(401);
  });

  it('401 con un token manipulado', async () => {
    const res = await request(ctx.app)
      .get('/api/v1/tasks')
      .set('Authorization', `${bearerFor(ctx)}x`);

    expect(res.status).toBe(401);
  });
});

describe('Tareas', () => {
  it('POST 201: crea la tarea en PENDING con Location', async () => {
    const res = await createTask({ title: 'Escalar reclamo', priority: 'HIGH', dueDate: '2026-10-20' });

    expect(res.status).toBe(201);
    expect(res.headers.location).toBe('/api/v1/tasks/1');
    expect(res.body).toMatchObject({
      id: 1,
      title: 'Escalar reclamo',
      status: { code: 'PENDING' },
      priority: 'HIGH',
      dueDate: '2026-10-20',
      createdBy: { id: 1 },
    });
  });

  it('POST 400: título vacío y prioridad inválida', async () => {
    const res = await createTask({ title: '', priority: 'URGENTE' });

    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d: { field: string }) => d.field)).toEqual(['title', 'priority']);
  });

  it('GET 200: filtra por estado y pagina', async () => {
    for (let i = 1; i <= 12; i++) await createTask({ title: `Tarea ${i}` });
    await request(ctx.app).patch('/api/v1/tasks/1/status').set('Authorization', bearerFor(ctx)).send({ status: 'IN_PROGRESS' });

    const res = await request(ctx.app)
      .get('/api/v1/tasks?status=PENDING&page=2&pageSize=5')
      .set('Authorization', bearerFor(ctx));

    expect(res.status).toBe(200);
    expect(res.body.pagination).toEqual({ page: 2, pageSize: 5, total: 11, totalPages: 3 });
    expect(res.body.data).toHaveLength(5);
  });

  it('GET 400: parámetros de paginación inválidos', async () => {
    const res = await request(ctx.app).get('/api/v1/tasks?page=0').set('Authorization', bearerFor(ctx));

    expect(res.status).toBe(400);
  });

  it('PATCH 200 → 409: permite transiciones válidas y bloquea las inválidas', async () => {
    await createTask({ title: 'Validar soporte de pago' });
    const patch = (status: string) =>
      request(ctx.app).patch('/api/v1/tasks/1/status').set('Authorization', bearerFor(ctx)).send({ status });

    expect((await patch('IN_PROGRESS')).status).toBe(200);
    expect((await patch('COMPLETED')).body.status.code).toBe('COMPLETED');

    const reopen = await patch('PENDING');
    expect(reopen.status).toBe(409);
    expect(reopen.body.error.code).toBe('CONFLICT');
  });

  it('PATCH 404: la tarea no existe', async () => {
    const res = await request(ctx.app)
      .patch('/api/v1/tasks/999/status')
      .set('Authorization', bearerFor(ctx))
      .send({ status: 'IN_PROGRESS' });

    expect(res.status).toBe(404);
  });

  it('PATCH 400: id no numérico', async () => {
    const res = await request(ctx.app)
      .patch('/api/v1/tasks/abc/status')
      .set('Authorization', bearerFor(ctx))
      .send({ status: 'IN_PROGRESS' });

    expect(res.status).toBe(400);
  });

  it('GET /task-statuses 200: incluye transiciones permitidas', async () => {
    const res = await request(ctx.app).get('/api/v1/task-statuses').set('Authorization', bearerFor(ctx));

    expect(res.status).toBe(200);
    expect(res.body[0]).toEqual({
      code: 'PENDING',
      name: 'Pendiente',
      isFinal: false,
      allowedTransitions: ['IN_PROGRESS', 'CANCELLED'],
    });
  });
});

describe('Comportamiento transversal', () => {
  it('400 con JSON malformado', async () => {
    const res = await request(ctx.app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"username": ');

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/JSON/);
  });

  it('413 con un cuerpo demasiado grande', async () => {
    const res = await createTask({ title: 'x', description: 'a'.repeat(20_000) });

    expect(res.status).toBe(413);
  });

  it('404 con formato de error uniforme en rutas inexistentes', async () => {
    const res = await request(ctx.app).get('/api/v1/no-existe');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: expect.any(String) } });
  });

  it('500 sin filtrar detalles internos', async () => {
    ctx.tasks.listStatuses = () => Promise.reject(new Error('Login failed for user task_app'));

    const res = await request(ctx.app).get('/api/v1/task-statuses').set('Authorization', bearerFor(ctx));

    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/task_app|Login failed/);
  });

  it('aplica cabeceras de seguridad y oculta la tecnología del servidor', async () => {
    const res = await request(ctx.app).get('/health');

    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('CORS: solo permite los orígenes configurados', async () => {
    const allowed = await request(ctx.app).get('/health').set('Origin', 'http://localhost:8080');
    const denied = await request(ctx.app).get('/health').set('Origin', 'https://malicioso.example');

    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:8080');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('GET /health: 200 con BD disponible y 503 sin ella', async () => {
    expect((await request(ctx.app).get('/health')).status).toBe(200);

    ctx.databaseUp.value = false;
    expect((await request(ctx.app).get('/health')).status).toBe(503);
  });
});
