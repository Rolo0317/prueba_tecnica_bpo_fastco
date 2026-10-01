import { describe, expect, it } from 'vitest';
import { ForbiddenError } from '../../src/core/errors.js';
import { toTask, toTaskStatus, type TaskRow } from '../../src/modules/tasks/task.mapper.js';
import { createTaskSchemas, listTasksSchemas } from '../../src/modules/tasks/task.schemas.js';
import { TaskService } from '../../src/modules/tasks/task.service.js';
import { InMemoryTaskRepository } from '../helpers/fakes.js';

const admin = { id: 1, username: 'admin', fullName: 'Admin', role: 'ADMIN' as const };

describe('task.mapper', () => {
  const row: TaskRow = {
    TaskId: 5,
    Title: 'Devolver llamada',
    Description: null,
    StatusCode: 'PENDING',
    StatusName: 'Pendiente',
    Priority: 1,
    DueDate: new Date('2026-10-15T00:00:00.000Z'),
    CreatedById: 2,
    CreatedByName: 'Agente Uno',
    AssignedToId: 3,
    AssignedToName: 'Agente Dos',
    CreatedAt: new Date('2026-10-01T13:45:00.000Z'),
    UpdatedAt: new Date('2026-10-01T13:45:00.000Z'),
  };

  it('convierte la fila del SP en el DTO de la API', () => {
    expect(toTask(row)).toEqual({
      id: 5,
      title: 'Devolver llamada',
      description: null,
      status: { code: 'PENDING', name: 'Pendiente' },
      priority: 'HIGH',
      dueDate: '2026-10-15',
      createdBy: { id: 2, name: 'Agente Uno' },
      assignedTo: { id: 3, name: 'Agente Dos' },
      createdAt: '2026-10-01T13:45:00.000Z',
      updatedAt: '2026-10-01T13:45:00.000Z',
    });
  });

  it('convierte las transiciones permitidas de CSV a lista', () => {
    const base = { Code: 'X', Name: 'X', IsFinal: false };

    expect(toTaskStatus({ ...base, AllowedTransitions: 'A,B' }).allowedTransitions).toEqual([
      'A',
      'B',
    ]);
    expect(toTaskStatus({ ...base, AllowedTransitions: '' }).allowedTransitions).toEqual([]);
  });
});

describe('task.schemas', () => {
  it('aplica valores por defecto y normaliza el estado del listado', () => {
    const query = listTasksSchemas.query.parse({ status: ' pending ', page: '2' });

    expect(query).toEqual({ status: 'PENDING', page: 2, pageSize: 10 });
  });

  it('trata un filtro de estado vacío como "todas"', () => {
    expect(listTasksSchemas.query.parse({ status: '' }).status).toBeUndefined();
  });

  it('rechaza un tamaño de página fuera de rango', () => {
    expect(listTasksSchemas.query.safeParse({ pageSize: '500' }).success).toBe(false);
  });

  it('limpia la entrada al crear: recorta textos y usa null para opcionales vacíos', () => {
    const body = createTaskSchemas.body.parse({ title: '  Escalar reclamo  ', description: '   ' });

    expect(body).toEqual({
      title: 'Escalar reclamo',
      description: null,
      priority: 'MEDIUM',
      dueDate: null,
    });
  });

  it('rechaza campos desconocidos, títulos vacíos y fechas inválidas', () => {
    expect(createTaskSchemas.body.safeParse({ title: 'Ok', admin: true }).success).toBe(false);
    expect(createTaskSchemas.body.safeParse({ title: '   ' }).success).toBe(false);
    expect(createTaskSchemas.body.safeParse({ title: 'Ok', dueDate: '15/10/2026' }).success).toBe(
      false,
    );
  });
});

describe('TaskService', () => {
  const agent = { id: 2, username: 'agente', fullName: 'Agente', role: 'AGENT' as const };
  const otherAgent = { id: 3, username: 'otro', fullName: 'Otro', role: 'AGENT' as const };
  const data = (title: string) => ({
    title,
    description: null,
    priority: 'LOW' as const,
    dueDate: null,
  });

  const setup = () => {
    const repository = new InMemoryTaskRepository();
    return { repository, service: new TaskService(repository) };
  };

  it('calcula la paginación a partir del total', async () => {
    const { service } = setup();
    for (let i = 1; i <= 23; i++) await service.create(data(`Tarea ${i}`), admin);

    const result = await service.list({ page: 3, pageSize: 10 }, admin);

    expect(result.pagination).toEqual({ page: 3, pageSize: 10, total: 23, totalPages: 3 });
    expect(result.data).toHaveLength(3);
  });

  it('devuelve 0 páginas cuando no hay resultados', async () => {
    const result = await setup().service.list({ page: 1, pageSize: 10 }, admin);

    expect(result.pagination.totalPages).toBe(0);
    expect(result.data).toEqual([]);
  });

  it('un agente solo ve lo asignado a él y lo que creó; el administrador ve todo', async () => {
    const { service } = setup();
    await service.create({ ...data('Para el agente'), assignedTo: agent.id }, admin);
    await service.create({ ...data('Para otro'), assignedTo: otherAgent.id }, admin);
    await service.create(data('Creada por el agente'), agent);

    const seenByAgent = await service.list({ page: 1, pageSize: 10 }, agent);
    const seenByAdmin = await service.list({ page: 1, pageSize: 10 }, admin);

    expect(seenByAgent.data.map((t) => t.title).sort()).toEqual([
      'Creada por el agente',
      'Para el agente',
    ]);
    expect(seenByAdmin.pagination.total).toBe(3);
  });

  it('la tarea que crea un agente queda asignada a él; no puede asignarla a otra persona', async () => {
    const { service } = setup();

    const own = await service.create(data('Propia'), agent);

    expect(own.assignedTo?.id).toBe(agent.id);
    await expect(
      service.create({ ...data('Ajena'), assignedTo: otherAgent.id }, agent),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('un agente edita lo que creó pero no reasigna; el administrador sí reasigna', async () => {
    const { service } = setup();
    const task = await service.create(data('Original'), agent);

    const edited = await service.update(task.id, data('Editada'), agent);
    expect(edited.title).toBe('Editada');

    await expect(
      service.update(task.id, { ...data('X'), assignedTo: otherAgent.id }, agent),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const reassigned = await service.update(
      task.id,
      { ...data('X'), assignedTo: otherAgent.id },
      admin,
    );
    expect(reassigned.assignedTo?.id).toBe(otherAgent.id);
  });

  it('las estadísticas de un agente cuentan solo sus tareas visibles', async () => {
    const { service } = setup();
    await service.create({ ...data('Suya'), assignedTo: agent.id }, admin);
    await service.create({ ...data('De otro'), assignedTo: otherAgent.id }, admin);

    expect((await service.stats(null, agent)).total).toBe(1);
    expect((await service.stats(null, admin)).total).toBe(2);
  });
});
