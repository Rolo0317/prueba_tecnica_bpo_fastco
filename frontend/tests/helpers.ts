import { mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import type { Task, TaskStatus } from '@/modules/tasks/types';

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
