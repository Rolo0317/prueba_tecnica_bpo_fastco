import { mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import type { Permission } from '@/modules/access/types';
import type { AuthUser } from '@/modules/auth/types';
import type { Task, TaskStats, TaskStatus } from '@/modules/tasks/types';

export const ALL_PERMISSIONS: Permission[] = [
  'TASKS_VIEW_ALL',
  'TASKS_VIEW_AREA',
  'TASKS_EDIT_ANY',
  'TASKS_ASSIGN',
  'USERS_MANAGE',
  'AREAS_MANAGE',
  'ROLES_MANAGE',
];

/** Administrador por defecto; con `permissions: []` y otro rol, un colaborador. */
export function buildAuthUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 1,
    username: 'admin',
    fullName: 'Administrador Demo',
    role: { id: 1, name: 'Administrador' },
    area: null,
    permissions: ALL_PERMISSIONS,
    ...overrides,
  };
}

export const COLLABORATOR: AuthUser = buildAuthUser({
  id: 2,
  username: 'agente',
  fullName: 'Agente Uno',
  role: { id: 3, name: 'Colaborador' },
  area: { id: 1, name: 'Operaciones' },
  permissions: [],
});

/** Se usa el mismo plugin de la app (tema, íconos SVG, idioma) para probar la configuración real. */
export { vuetify } from '@/plugins/vuetify';

export function createTestRouter(): Router {
  const Empty = defineComponent({ render: () => null });
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/tasks', name: 'tasks', component: Empty },
      { path: '/login', name: 'login', component: Empty },
    ],
  });
}

/** Ejecuta un composable dentro de un componente real (con router) para poder probarlo. */
export async function withSetup<T>(composable: () => T, router: Router = createTestRouter()) {
  let result!: T;
  if (router.currentRoute.value.matched.length === 0) await router.push('/tasks');
  mount(
    defineComponent({
      setup() {
        result = composable();
        return () => h('div');
      },
    }),
    { global: { plugins: [router] } },
  );
  return { result, router };
}

export const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

export function buildTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 1,
    title: 'Devolver llamada a cliente',
    description: null,
    status: { code: 'PENDING', name: 'Pendiente' },
    priority: 'MEDIUM',
    dueDate: null,
    createdBy: { id: 1, name: 'Agente' },
    assignedTo: null,
    area: null,
    notesCount: 0,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    ...overrides,
  };
}

export const STATUSES: TaskStatus[] = [
  {
    code: 'PENDING',
    name: 'Pendiente',
    isFinal: false,
    allowedTransitions: ['IN_PROGRESS', 'CANCELLED'],
  },
  {
    code: 'IN_PROGRESS',
    name: 'En progreso',
    isFinal: false,
    allowedTransitions: ['PENDING', 'COMPLETED', 'CANCELLED'],
  },
  { code: 'COMPLETED', name: 'Completada', isFinal: true, allowedTransitions: [] },
  { code: 'CANCELLED', name: 'Cancelada', isFinal: true, allowedTransitions: [] },
];

export const STATS: TaskStats = {
  total: 10,
  overdue: 2,
  dueToday: 1,
  highPriorityOpen: 3,
  byStatus: [
    { code: 'PENDING', name: 'Pendiente', isFinal: false, count: 5, percentage: 50 },
    { code: 'IN_PROGRESS', name: 'En progreso', isFinal: false, count: 2, percentage: 20 },
    { code: 'COMPLETED', name: 'Completada', isFinal: true, count: 3, percentage: 30 },
    { code: 'CANCELLED', name: 'Cancelada', isFinal: true, count: 0, percentage: 0 },
  ],
};
