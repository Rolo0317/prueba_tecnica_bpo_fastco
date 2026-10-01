import { nextTick } from 'vue';
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '@/modules/auth/stores/authStore';

declare module 'vue-router' {
  interface RouteMeta {
    title?: string;
    requiresAuth?: boolean;
    requiresAdmin?: boolean;
    guestOnly?: boolean;
  }
}

const APP_NAME = 'Gestor de Tareas Operativas';

/** Rutas con carga diferida: cada vista se descarga solo cuando se visita. */
export const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/modules/auth/views/LoginView.vue'),
    meta: { title: 'Iniciar sesión', guestOnly: true },
  },
  {
    path: '/',
    component: () => import('@/shared/layouts/AppLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', redirect: { name: 'tasks' } },
      {
        path: 'tasks',
        name: 'tasks',
        component: () => import('@/modules/tasks/views/TasksView.vue'),
        meta: { title: 'Tareas operativas' },
      },
      {
        path: 'users',
        name: 'users',
        component: () => import('@/modules/users/views/UsersView.vue'),
        meta: { title: 'Usuarios', requiresAdmin: true },
      },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

export const router = createRouter({ history: createWebHistory(), routes });

router.beforeEach((to) => {
  const auth = useAuthStore();

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }
  // Solo oculta la pantalla: la API rechaza con 403 a quien no es administrador.
  if (to.meta.requiresAdmin && !auth.isAdmin) {
    return { name: 'tasks' };
  }
  if (to.meta.guestOnly && auth.isAuthenticated) {
    return { name: 'tasks' };
  }
  return true;
});

/**
 * Si falla la descarga de una vista (p. ej. tras un nuevo despliegue cambian los nombres
 * de los archivos), se recarga la página una sola vez hacia la ruta destino.
 */
router.onError((error: unknown, to) => {
  const chunkFailed =
    error instanceof Error &&
    /dynamically imported module|Importing a module script/i.test(error.message);
  if (chunkFailed && sessionStorage.getItem('chunk-reload') !== to.fullPath) {
    sessionStorage.setItem('chunk-reload', to.fullPath);
    window.location.assign(to.fullPath);
  }
});

router.afterEach((to, from) => {
  document.title = to.meta.title ? `${to.meta.title} · ${APP_NAME}` : APP_NAME;

  // Accesibilidad: al cambiar de página, el foco va al contenido principal (lectores de pantalla).
  if (from.name !== undefined && to.name !== from.name) {
    void nextTick(() => document.getElementById('main-content')?.focus());
  }
});
