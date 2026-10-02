import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { bearerFor, buildTestContext, TEST_AGENT, type TestContext } from '../helpers/fakes.js';

let ctx: TestContext;

beforeEach(async () => {
  ctx = await buildTestContext();
});

const ADMIN_ID = 1;
const AGENT_ID = 2;
const asAdmin = () => bearerFor(ctx, 'ADMIN');
const asAgent = () => bearerFor(ctx, 'AGENT');

const createAs = (token: string, body: object) =>
  request(ctx.app).post('/api/v1/tasks').set('Authorization', token).send(body);
const listAs = (token: string) => request(ctx.app).get('/api/v1/tasks').set('Authorization', token);
const updateAs = (token: string, id: number, body: object) =>
  request(ctx.app).patch(`/api/v1/tasks/${id}`).set('Authorization', token).send(body);

describe('Asignación y visibilidad de tareas', () => {
  it('el administrador asigna una tarea y el agente la ve; las ajenas no', async () => {
    await createAs(asAdmin(), { title: 'Para el agente', assignedTo: AGENT_ID });
    await createAs(asAdmin(), { title: 'Del administrador', assignedTo: ADMIN_ID });
    await createAs(asAdmin(), { title: 'Sin asignar' });

    const agentList = await listAs(asAgent());
    const adminList = await listAs(asAdmin());

    expect(agentList.body.data.map((t: { title: string }) => t.title)).toEqual(['Para el agente']);
    expect(agentList.body.data[0].assignedTo).toEqual({
      id: AGENT_ID,
      name: `Usuario ${AGENT_ID}`,
    });
    expect(adminList.body.pagination.total).toBe(3);
  });

  it('la tarea que crea un agente queda asignada a él y la ve', async () => {
    const res = await createAs(asAgent(), { title: 'Mi tarea' });

    expect(res.status).toBe(201);
    expect(res.body.assignedTo.id).toBe(AGENT_ID);
    expect((await listAs(asAgent())).body.pagination.total).toBe(1);
  });

  it('403 si un agente intenta asignar a otra persona', async () => {
    const res = await createAs(asAgent(), { title: 'Ajena', assignedTo: ADMIN_ID });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('404 cuando un agente intenta cambiar el estado de una tarea que no puede ver', async () => {
    await createAs(asAdmin(), { title: 'Ajena', assignedTo: ADMIN_ID });

    const res = await request(ctx.app)
      .patch('/api/v1/tasks/1/status')
      .set('Authorization', asAgent())
      .send({ status: 'IN_PROGRESS' });

    expect(res.status).toBe(404);
  });

  it('las estadísticas de un agente solo cuentan sus tareas', async () => {
    await createAs(asAdmin(), { title: 'Suya', assignedTo: AGENT_ID });
    await createAs(asAdmin(), { title: 'Ajena' });

    const res = await request(ctx.app).get('/api/v1/tasks/stats').set('Authorization', asAgent());

    expect(res.body.total).toBe(1);
  });
});

describe('Edición de tareas', () => {
  it('el agente edita la tarea que creó', async () => {
    await createAs(asAgent(), { title: 'Original' });

    const res = await updateAs(asAgent(), 1, { title: 'Editada', priority: 'HIGH' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      title: 'Editada',
      priority: 'HIGH',
      assignedTo: { id: AGENT_ID },
    });
  });

  it('403: un agente no edita una tarea que le asignaron pero no creó', async () => {
    await createAs(asAdmin(), { title: 'Del admin', assignedTo: AGENT_ID });

    const res = await updateAs(asAgent(), 1, { title: 'Cambio' });

    expect(res.status).toBe(403);
  });

  it('403: un agente no puede cambiar el responsable', async () => {
    await createAs(asAgent(), { title: 'Mía' });

    const res = await updateAs(asAgent(), 1, { title: 'Mía', assignedTo: ADMIN_ID });

    expect(res.status).toBe(403);
  });

  it('el administrador reasigna o deja sin asignar cualquier tarea', async () => {
    await createAs(asAgent(), { title: 'Del agente' });

    const reassigned = await updateAs(asAdmin(), 1, { title: 'Del agente', assignedTo: ADMIN_ID });
    const unassigned = await updateAs(asAdmin(), 1, { title: 'Del agente', assignedTo: null });

    expect(reassigned.body.assignedTo.id).toBe(ADMIN_ID);
    expect(unassigned.body.assignedTo).toBeNull();
  });

  it('400 con datos inválidos al editar', async () => {
    await createAs(asAdmin(), { title: 'X' });

    const res = await updateAs(asAdmin(), 1, { title: '', assignedTo: 'juan' });

    expect(res.status).toBe(400);
  });
});

describe('Usuarios asignables y eliminación', () => {
  it('GET /users/assignable lista usuarios activos (solo administrador)', async () => {
    const admin = await request(ctx.app)
      .get('/api/v1/users/assignable')
      .set('Authorization', asAdmin());
    const agent = await request(ctx.app)
      .get('/api/v1/users/assignable')
      .set('Authorization', asAgent());

    expect(admin.status).toBe(200);
    expect(admin.body.map((u: { username: string }) => u.username)).toEqual(['admin', 'agente']);
    expect(admin.body[1].area).toEqual({ id: 1, name: 'Operaciones' });
    expect(agent.status).toBe(403);
  });

  it('DELETE elimina al agente: deja de iniciar sesión y de aparecer en la lista', async () => {
    const res = await request(ctx.app).delete('/api/v1/users/2').set('Authorization', asAdmin());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ unassignedTasks: 0 });
    const login = await request(ctx.app)
      .post('/api/v1/auth/login')
      .send({ username: TEST_AGENT.username, password: TEST_AGENT.password });
    expect(login.status).toBe(401);
    const list = await request(ctx.app).get('/api/v1/users').set('Authorization', asAdmin());
    expect(list.body.pagination.total).toBe(1);
  });

  it('409 al eliminarse a sí mismo, 404 si no existe y 403 para un agente', async () => {
    const self = await request(ctx.app).delete('/api/v1/users/1').set('Authorization', asAdmin());
    const missing = await request(ctx.app)
      .delete('/api/v1/users/999')
      .set('Authorization', asAdmin());
    const byAgent = await request(ctx.app)
      .delete('/api/v1/users/1')
      .set('Authorization', asAgent());

    expect(self.status).toBe(409);
    expect(missing.status).toBe(404);
    expect(byAgent.status).toBe(403);
  });
});
