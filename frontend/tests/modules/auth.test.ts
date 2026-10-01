import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionStore } from '@/modules/auth/services/sessionStorage';
import { createAuthStore } from '@/modules/auth/stores/authStore';

const user = { id: 1, username: 'admin', fullName: 'Administrador Demo', role: 'ADMIN' as const };

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
