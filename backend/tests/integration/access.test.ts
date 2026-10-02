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

beforeEach(async () => {
  ctx = await buildTestContext();
});

const asAdmin = () => bearerFor(ctx, 'ADMIN');
const asAgent = () => bearerFor(ctx, 'AGENT');
const api = (path: string) => `/api/v1${path}`;

/** Crea un rol "Gestor de usuarios" y un usuario con ese rol; devuelve su token. */
async function userManager(): Promise<string> {
  const role = await request(ctx.app)
    .post(api('/roles'))
    .set('Authorization', asAdmin())
    .send({ name: 'Gestor de usuarios', permissions: ['USERS_MANAGE'] });
  const id = await addUser(ctx.users, { username: 'gestor', roleId: role.body.id, areaId: null });
  return bearerFor(ctx, id);
}

describe('Cuenta propia', () => {
  it('GET /account/me devuelve rol, área y permisos vigentes', async () => {
    const res = await request(ctx.app).get(api('/account/me')).set('Authorization', asAgent());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: 2,
      username: 'agente',
      fullName: 'Agente de Prueba',
      role: { id: ROLE.COLLABORATOR, name: 'Colaborador' },
      area: { id: AREA.OPERATIONS, name: 'Operaciones' },
      permissions: [],
    });
  });
});

describe('Roles y permisos', () => {
  it('403 para un colaborador; el administrador lista roles y permisos', async () => {
    const forbidden = await request(ctx.app).get(api('/roles')).set('Authorization', asAgent());
    const roles = await request(ctx.app).get(api('/roles')).set('Authorization', asAdmin());
    const permissions = await request(ctx.app)
      .get(api('/permissions'))
      .set('Authorization', asAdmin());

    expect(forbidden.status).toBe(403);
    expect(roles.body.map((r: { name: string }) => r.name)).toEqual([
      'Administrador',
      'Supervisor',
      'Colaborador',
    ]);
    expect(permissions.body).toHaveLength(7);
  });

  it('POST 201 crea un rol; 400 con un permiso desconocido; 409 con nombre repetido', async () => {
    const create = (body: object) =>
      request(ctx.app).post(api('/roles')).set('Authorization', asAdmin()).send(body);

    const created = await create({ name: 'Auditor', permissions: ['TASKS_VIEW_ALL'] });
    const unknown = await create({ name: 'X', permissions: ['HACER_TODO'] });
    const repeated = await create({ name: 'Auditor', permissions: [] });

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'Auditor', code: null, usersCount: 0 });
    expect(unknown.status).toBe(400);
    expect(repeated.status).toBe(409);
  });

  it('cambiar los permisos de un rol aplica de inmediato a sus usuarios', async () => {
    const usersAsAgent = () => request(ctx.app).get(api('/users')).set('Authorization', asAgent());
    expect((await usersAsAgent()).status).toBe(403);

    await request(ctx.app)
      .put(api(`/roles/${String(ROLE.COLLABORATOR)}`))
      .set('Authorization', asAdmin())
      .send({ name: 'Colaborador', permissions: ['USERS_MANAGE'] });

    expect((await usersAsAgent()).status).toBe(200);
  });

  it('409: el rol Administrador no se modifica y los roles del sistema no se eliminan', async () => {
    const editAdmin = await request(ctx.app)
      .put(api(`/roles/${String(ROLE.ADMIN)}`))
      .set('Authorization', asAdmin())
      .send({ name: 'Admin', permissions: [] });
    const deleteSystem = await request(ctx.app)
      .delete(api(`/roles/${String(ROLE.SUPERVISOR)}`))
      .set('Authorization', asAdmin());

    expect(editAdmin.status).toBe(409);
    expect(deleteSystem.status).toBe(409);
  });

  it('un rol creado se elimina solo si nadie lo tiene', async () => {
    await userManager();
    const roles = await request(ctx.app).get(api('/roles')).set('Authorization', asAdmin());
    const managerRole = roles.body.find((r: { name: string }) => r.name === 'Gestor de usuarios');

    const inUse = await request(ctx.app)
      .delete(api(`/roles/${String(managerRole.id)}`))
      .set('Authorization', asAdmin());
    const unused = await request(ctx.app)
      .post(api('/roles'))
      .set('Authorization', asAdmin())
      .send({ name: 'Temporal', permissions: [] });
    const removed = await request(ctx.app)
      .delete(api(`/roles/${String(unused.body.id)}`))
      .set('Authorization', asAdmin());

    expect(managerRole.usersCount).toBe(1);
    expect(inUse.status).toBe(409);
    expect(removed.status).toBe(204);
  });
});

describe('Sin escalada de privilegios', () => {
  it('quien administra usuarios no asigna roles con permisos que no tiene', async () => {
    const manager = await userManager();
    const createWith = (roleId: number, username: string) =>
      request(ctx.app)
        .post(api('/users'))
        .set('Authorization', manager)
        .send({ username, fullName: 'Nuevo', roleId, password: 'Segura-2026x' });

    expect((await createWith(ROLE.ADMIN, 'nuevo.admin')).status).toBe(403);
    expect((await createWith(ROLE.SUPERVISOR, 'nuevo.super')).status).toBe(403);
    expect((await createWith(ROLE.COLLABORATOR, 'nuevo.colab')).status).toBe(201);
  });

  it('no gestiona a un usuario con más permisos (ni restablece su contraseña)', async () => {
    const manager = await userManager();

    const resetAdmin = await request(ctx.app)
      .put(api('/users/1/password'))
      .set('Authorization', manager)
      .send({ newPassword: 'Tomada-2026x' });
    const deactivateAdmin = await request(ctx.app)
      .patch(api('/users/1/status'))
      .set('Authorization', manager)
      .send({ isActive: false });
    const resetAgent = await request(ctx.app)
      .put(api('/users/2/password'))
      .set('Authorization', manager)
      .send({ newPassword: 'Restablecida-2026' });

    expect(resetAdmin.status).toBe(403);
    expect(deactivateAdmin.status).toBe(403);
    expect(resetAgent.status).toBe(204);
  });

  it('sin ROLES_MANAGE no puede crear roles (ni darse permisos)', async () => {
    const manager = await userManager();

    const res = await request(ctx.app)
      .post(api('/roles'))
      .set('Authorization', manager)
      .send({ name: 'Todopoderoso', permissions: ['ROLES_MANAGE'] });

    expect(res.status).toBe(403);
  });
});

describe('Áreas', () => {
  it('cualquier usuario las consulta; solo AREAS_MANAGE las crea', async () => {
    const list = await request(ctx.app).get(api('/areas')).set('Authorization', asAgent());
    const byAgent = await request(ctx.app)
      .post(api('/areas'))
      .set('Authorization', asAgent())
      .send({ name: 'Logística' });
    const byAdmin = await request(ctx.app)
      .post(api('/areas'))
      .set('Authorization', asAdmin())
      .send({ name: 'Logística', description: 'Despachos' });

    expect(list.status).toBe(200);
    expect(list.body.map((a: { name: string }) => a.name)).toEqual(['Operaciones', 'Finanzas']);
    expect(byAgent.status).toBe(403);
    expect(byAdmin.status).toBe(201);
    expect(byAdmin.body).toMatchObject({ name: 'Logística', isActive: true });
  });

  it('409 con nombre repetido; una inactiva solo aparece con includeInactive', async () => {
    const repeated = await request(ctx.app)
      .post(api('/areas'))
      .set('Authorization', asAdmin())
      .send({ name: 'Finanzas' });
    await request(ctx.app)
      .patch(api(`/areas/${String(AREA.FINANCE)}`))
      .set('Authorization', asAdmin())
      .send({ name: 'Finanzas', isActive: false });

    const active = await request(ctx.app).get(api('/areas')).set('Authorization', asAdmin());
    const all = await request(ctx.app)
      .get(api('/areas?includeInactive=true'))
      .set('Authorization', asAdmin());

    expect(repeated.status).toBe(409);
    expect(active.body).toHaveLength(1);
    expect(all.body).toHaveLength(2);
  });
});

describe('Supervisor de área', () => {
  it('ve y asigna dentro de su área; los responsables posibles son de su área', async () => {
    const supervisorId = await addUser(ctx.users, {
      username: 'supervisora',
      roleId: ROLE.SUPERVISOR,
      areaId: AREA.OPERATIONS,
    });
    await addUser(ctx.users, {
      username: 'finanzas',
      roleId: ROLE.COLLABORATOR,
      areaId: AREA.FINANCE,
    });
    const asSupervisor = bearerFor(ctx, supervisorId);
    const create = (body: object) =>
      request(ctx.app).post(api('/tasks')).set('Authorization', asAdmin()).send(body);
    await create({ title: 'De Operaciones', areaId: AREA.OPERATIONS });
    await create({ title: 'De Finanzas', areaId: AREA.FINANCE });

    const tasks = await request(ctx.app).get(api('/tasks')).set('Authorization', asSupervisor);
    const assignable = await request(ctx.app)
      .get(api('/users/assignable'))
      .set('Authorization', asSupervisor);
    const assignToAgent = await request(ctx.app)
      .patch(api('/tasks/1'))
      .set('Authorization', asSupervisor)
      .send({ title: 'De Operaciones', assignedTo: 2 });
    const assignOutside = await request(ctx.app)
      .patch(api('/tasks/1'))
      .set('Authorization', asSupervisor)
      .send({ title: 'De Operaciones', assignedTo: 4 });

    expect(tasks.body.data.map((t: { title: string }) => t.title)).toEqual(['De Operaciones']);
    expect(assignable.body.map((u: { username: string }) => u.username)).toEqual([
      'agente',
      'supervisora',
    ]);
    expect(assignToAgent.status).toBe(200);
    expect(assignOutside.status).toBe(403);
  });

  it('GET /tasks?areaId= filtra por área', async () => {
    await request(ctx.app)
      .post(api('/tasks'))
      .set('Authorization', asAdmin())
      .send({ title: 'De Finanzas', areaId: AREA.FINANCE });

    const ops = await request(ctx.app)
      .get(api(`/tasks?areaId=${String(AREA.OPERATIONS)}`))
      .set('Authorization', asAdmin());
    const finance = await request(ctx.app)
      .get(api(`/tasks?areaId=${String(AREA.FINANCE)}`))
      .set('Authorization', asAdmin());

    expect(ops.body.pagination.total).toBe(0);
    expect(finance.body.data[0].area).toEqual({ id: AREA.FINANCE, name: 'Finanzas' });
  });
});

describe('Desempeño por área', () => {
  it('agrupa abiertas, vencidas y cerradas por área dentro del alcance de quien consulta', async () => {
    const create = (body: object) =>
      request(ctx.app).post(api('/tasks')).set('Authorization', asAdmin()).send(body);
    await create({ title: 'Vencida', areaId: AREA.OPERATIONS, dueDate: '2020-01-01' });
    await create({ title: 'Otra', areaId: AREA.OPERATIONS });
    await create({ title: 'Finanzas', areaId: AREA.FINANCE });
    for (const status of ['IN_PROGRESS', 'COMPLETED']) {
      await request(ctx.app)
        .patch(api('/tasks/3/status'))
        .set('Authorization', asAdmin())
        .send({ status });
    }

    const admin = await request(ctx.app)
      .get(api('/tasks/stats/by-area?today=2026-10-01'))
      .set('Authorization', asAdmin());
    const agent = await request(ctx.app)
      .get(api('/tasks/stats/by-area'))
      .set('Authorization', asAgent());

    expect(admin.status).toBe(200);
    expect(admin.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          area: { id: AREA.OPERATIONS, name: 'Operaciones' },
          open: 2,
          overdue: 1,
        }),
        expect.objectContaining({
          area: { id: AREA.FINANCE, name: 'Finanzas' },
          open: 0,
          closed: 1,
        }),
      ]),
    );
    expect(agent.body).toEqual([]);
  });

  it('400 con un periodo fuera de rango', async () => {
    const res = await request(ctx.app)
      .get(api('/tasks/stats/by-area?days=0'))
      .set('Authorization', asAdmin());

    expect(res.status).toBe(400);
  });
});
