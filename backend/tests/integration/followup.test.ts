import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { bearerFor, buildTestContext, type TestContext } from '../helpers/fakes.js';

let ctx: TestContext;

beforeEach(async () => {
  ctx = await buildTestContext();
});

const AGENT_ID = 2;
const asAdmin = () => bearerFor(ctx, 'ADMIN');
const asAgent = () => bearerFor(ctx, 'AGENT');

const createTask = (token: string, body: object) =>
  request(ctx.app).post('/api/v1/tasks').set('Authorization', token).send(body);
const addNote = (token: string, taskId: number, body: unknown) =>
  request(ctx.app).post(`/api/v1/tasks/${taskId}/notes`).set('Authorization', token).send({ body });
const timeline = (token: string, taskId: number) =>
  request(ctx.app).get(`/api/v1/tasks/${taskId}/timeline`).set('Authorization', token);

describe('Seguimiento de tareas', () => {
  it('POST /notes 201: registra el avance con autor y fecha, recortando espacios', async () => {
    await createTask(asAdmin(), { title: 'Devolver llamada', assignedTo: AGENT_ID });

    const res = await addNote(asAgent(), 1, '  Llamé al cliente, no contestó.  ');

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: 1,
      body: 'Llamé al cliente, no contestó.',
      author: { id: AGENT_ID },
      createdAt: expect.any(String),
    });
  });

  it('la cantidad de avances aparece en el listado', async () => {
    await createTask(asAdmin(), { title: 'Con avances' });
    await addNote(asAdmin(), 1, 'Primer avance');
    await addNote(asAdmin(), 1, 'Segundo avance');

    const list = await request(ctx.app).get('/api/v1/tasks').set('Authorization', asAdmin());

    expect(list.body.data[0].notesCount).toBe(2);
  });

  it('GET /timeline 200: eventos en orden con la creación primero y los avances después', async () => {
    await createTask(asAdmin(), { title: 'Escalar reclamo' });
    await addNote(asAdmin(), 1, 'Escalado a segundo nivel');

    const res = await timeline(asAdmin(), 1);

    expect(res.status).toBe(200);
    expect(res.body.map((e: { kind: string }) => e.kind)).toEqual(['CREATED', 'NOTE']);
    expect(res.body[1]).toMatchObject({ kind: 'NOTE', body: 'Escalado a segundo nivel' });
  });

  it('400: avance vacío, demasiado largo o con campos extra', async () => {
    await createTask(asAdmin(), { title: 'X' });

    const empty = await addNote(asAdmin(), 1, '   ');
    const tooLong = await addNote(asAdmin(), 1, 'a'.repeat(1001));
    const extra = await request(ctx.app)
      .post('/api/v1/tasks/1/notes')
      .set('Authorization', asAdmin())
      .send({ body: 'ok', author: 99 });

    expect([empty.status, tooLong.status, extra.status]).toEqual([400, 400, 400]);
  });

  it('404: un agente no ve ni comenta el seguimiento de una tarea ajena', async () => {
    await createTask(asAdmin(), { title: 'Ajena' });

    expect((await timeline(asAgent(), 1)).status).toBe(404);
    expect((await addNote(asAgent(), 1, 'Intento')).status).toBe(404);
  });

  it('401 sin token', async () => {
    expect((await request(ctx.app).get('/api/v1/tasks/1/timeline')).status).toBe(401);
  });
});
