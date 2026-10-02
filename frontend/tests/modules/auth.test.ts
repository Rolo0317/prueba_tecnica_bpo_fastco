import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionStore } from '@/modules/auth/services/sessionStorage';
import { createAuthStore } from '@/modules/auth/stores/authStore';
import { buildAuthUser, COLLABORATOR } from '../helpers';

const user = buildAuthUser();

describe('authStore', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    setActivePinia(createPinia());
  });

  it('inicia sesión, guarda el token y lo persiste en sessionStorage', async () => {
    const login = vi
      .fn()
      .mockResolvedValue({ token: 'jwt', tokenType: 'Bearer', expiresIn: 3600, user });
    const store = createAuthStore({ login })();

    await store.login({ username: 'admin', password: 'x' });

    expect(store.isAuthenticated).toBe(true);
    expect(store.token).toBe('jwt');
    expect(sessionStore.load()?.user).toEqual(user);
  });

  it('logout borra la sesión en memoria y en el almacenamiento', async () => {
    const login = vi
      .fn()
      .mockResolvedValue({ token: 'jwt', tokenType: 'Bearer', expiresIn: 3600, user });
    const store = createAuthStore({ login })();
    await store.login({ username: 'admin', password: 'x' });

    store.logout();

    expect(store.isAuthenticated).toBe(false);
    expect(sessionStore.load()).toBeNull();
  });

  it('descarta una sesión guardada que ya expiró', () => {
    sessionStore.save({ token: 'viejo', expiresAt: Date.now() - 1000, user });

    const store = createAuthStore({ login: vi.fn() })();

    expect(store.isAuthenticated).toBe(false);
    expect(store.token).toBeNull();
  });

  it('propaga el error de credenciales sin crear sesión', async () => {
    const store = createAuthStore({ login: vi.fn().mockRejectedValue(new Error('401')) })();

    await expect(store.login({ username: 'admin', password: 'mala' })).rejects.toThrow();
    expect(store.isAuthenticated).toBe(false);
  });
});

describe('authStore: permisos', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    setActivePinia(createPinia());
  });

  const loginAs = async (sessionUser = user, me = vi.fn()) => {
    const login = vi
      .fn()
      .mockResolvedValue({ token: 'jwt', tokenType: 'Bearer', expiresIn: 3600, user: sessionUser });
    const store = createAuthStore({ login }, { me })();
    await store.login({ username: 'u', password: 'p' });
    return store;
  };

  it('can() responde según los permisos del rol', async () => {
    const admin = await loginAs();
    expect(admin.can('ROLES_MANAGE')).toBe(true);

    setActivePinia(createPinia());
    const collaborator = await loginAs(COLLABORATOR);
    expect(collaborator.can('TASKS_ASSIGN')).toBe(false);
  });

  it('refreshUser() aplica los permisos vigentes y los guarda en la sesión', async () => {
    const promoted = { ...COLLABORATOR, permissions: ['USERS_MANAGE' as const] };
    const store = await loginAs(COLLABORATOR, vi.fn().mockResolvedValue(promoted));

    await store.refreshUser();

    expect(store.can('USERS_MANAGE')).toBe(true);
    expect(sessionStore.load()?.user.permissions).toEqual(['USERS_MANAGE']);
  });

  it('si /account/me falla, conserva la sesión guardada', async () => {
    const store = await loginAs(COLLABORATOR, vi.fn().mockRejectedValue(new Error('offline')));

    await store.refreshUser();

    expect(store.user).toEqual(COLLABORATOR);
  });
});
