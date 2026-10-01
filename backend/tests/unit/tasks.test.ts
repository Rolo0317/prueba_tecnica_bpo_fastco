import { describe, expect, it } from 'vitest';
import { toTask, toTaskStatus, type TaskRow } from '../../src/modules/tasks/task.mapper.js';
import { createTaskSchemas, listTasksSchemas } from '../../src/modules/tasks/task.schemas.js';
import { TaskService } from '../../src/modules/tasks/task.service.js';
import { InMemoryTaskRepository } from '../helpers/fakes.js';

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
      createdAt: '2026-10-01T13:45:00.000Z',
      updatedAt: '2026-10-01T13:45:00.000Z',
    });
  });

  it('convierte las transiciones permitidas de CSV a lista', () => {
    const base = { Code: 'X', Name: 'X', IsFinal: false };

    expect(toTaskStatus({ ...base, AllowedTransitions: 'A,B' }).allowedTransitions).toEqual(['A', 'B']);
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

    expect(body).toEqual({ title: 'Escalar reclamo', description: null, priority: 'MEDIUM', dueDate: null });
  });

  it('rechaza campos desconocidos, títulos vacíos y fechas inválidas', () => {
    expect(createTaskSchemas.body.safeParse({ title: 'Ok', admin: true }).success).toBe(false);
    expect(createTaskSchemas.body.safeParse({ title: '   ' }).success).toBe(false);
    expect(createTaskSchemas.body.safeParse({ title: 'Ok', dueDate: '15/10/2026' }).success).toBe(false);
  });
});

describe('TaskService.list', () => {
  it('calcula la paginación a partir del total', async () => {
    const repository = new InMemoryTaskRepository();
    const service = new TaskService(repository);
    for (let i = 1; i <= 23; i++) {
      await service.create({ title: `Tarea ${i}`, description: null, priority: 'LOW', dueDate: null, createdBy: 1 });
    }

    const result = await service.list({ page: 3, pageSize: 10 });

    expect(result.pagination).toEqual({ page: 3, pageSize: 10, total: 23, totalPages: 3 });
    expect(result.data).toHaveLength(3);
  });

  it('devuelve 0 páginas cuando no hay resultados', async () => {
    const result = await new TaskService(new InMemoryTaskRepository()).list({ page: 1, pageSize: 10 });

    expect(result.pagination.totalPages).toBe(0);
    expect(result.data).toEqual([]);
  });
});
