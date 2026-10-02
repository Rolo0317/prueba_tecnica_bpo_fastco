import { describe, expect, it, vi } from 'vitest';
import { useAreas } from '@/modules/access/composables/useAreas';
import { groupPermissions, useRoles } from '@/modules/access/composables/useRoles';
import type { Area, PermissionInfo, Role } from '@/modules/access/types';

const permission = (code: PermissionInfo['code'], group: string): PermissionInfo => ({
  code,
  name: code,
  description: '',
  group,
});

const area = (id: number, name: string): Area => ({
  id,
  name,
  description: null,
  isActive: true,
  createdAt: '2026-10-01T10:00:00.000Z',
  usersCount: 0,
  openTasksCount: 0,
});

const role: Role = {
  id: 4,
  code: null,
  name: 'Auditor',
  description: null,
  isLocked: false,
  permissions: ['TASKS_VIEW_ALL'],
  usersCount: 0,
};

describe('groupPermissions', () => {
  it('agrupa el catálogo conservando el orden de la API', () => {
    const groups = groupPermissions([
      permission('TASKS_VIEW_ALL', 'Tareas'),
      permission('USERS_MANAGE', 'Administración'),
      permission('TASKS_ASSIGN', 'Tareas'),
    ]);

    expect(groups.map((g) => [g.name, g.permissions.map((p) => p.code)])).toEqual([
      ['Tareas', ['TASKS_VIEW_ALL', 'TASKS_ASSIGN']],
      ['Administración', ['USERS_MANAGE']],
    ]);
  });
});

describe('useAreas', () => {
  it('pide solo activas por defecto e incluye inactivas en la administración', async () => {
    const listAreas = vi.fn().mockResolvedValue([area(1, 'Operaciones')]);
    const service = { listAreas, createArea: vi.fn(), updateArea: vi.fn() };

    await useAreas(service).load();
    await useAreas(service, true).load();

    expect(listAreas.mock.calls).toEqual([[false], [true]]);
  });

  it('al crear un área recarga el catálogo para que aparezca en los selectores', async () => {
    const created = area(2, 'Logística');
    const listAreas = vi
      .fn()
      .mockResolvedValueOnce([area(1, 'Operaciones')])
      .mockResolvedValueOnce([area(1, 'Operaciones'), created]);
    const areas = useAreas({
      listAreas,
      createArea: vi.fn().mockResolvedValue(created),
      updateArea: vi.fn(),
    });
    await areas.load();

    await areas.create({ name: 'Logística', description: null });

    expect(areas.areas.value.map((a) => a.name)).toEqual(['Operaciones', 'Logística']);
  });
});

describe('useRoles', () => {
  it('carga roles y catálogo; traduce códigos de permiso a nombres', async () => {
    const roles = useRoles({
      listRoles: vi.fn().mockResolvedValue([role]),
      listPermissions: vi
        .fn()
        .mockResolvedValue([{ ...permission('TASKS_VIEW_ALL', 'Tareas'), name: 'Ver todas' }]),
      createRole: vi.fn(),
      updateRole: vi.fn(),
      deleteRole: vi.fn(),
    });

    await roles.load();

    expect(roles.roles.value).toEqual([role]);
    expect(roles.permissionName('TASKS_VIEW_ALL')).toBe('Ver todas');
    expect(roles.permissionGroups.value[0]?.name).toBe('Tareas');
  });

  it('eliminar un rol propaga el 409 de la API y no recarga', async () => {
    const listRoles = vi.fn().mockResolvedValue([role]);
    const conflict = Object.assign(new Error('El rol tiene usuarios asignados.'), { status: 409 });
    const roles = useRoles({
      listRoles,
      listPermissions: vi.fn().mockResolvedValue([]),
      createRole: vi.fn(),
      updateRole: vi.fn(),
      deleteRole: vi.fn().mockRejectedValue(conflict),
    });
    await roles.load();

    await expect(roles.remove(role)).rejects.toMatchObject({ status: 409 });
    expect(listRoles).toHaveBeenCalledTimes(1);
  });
});
