import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { sessionStore } from '@/modules/auth/services/sessionStorage';
import { router } from '@/router';

function startSession(role: 'ADMIN' | 'AGENT' | null): void {
  window.sessionStorage.clear();
  if (role) {
    sessionStore.save({
      token: 'jwt',
      expiresAt: Date.now() + 60_000,
      user: { id: 1, username: 'u', fullName: 'U', role },
    });
  }
  // El store lee la sesión al crearse: una pinia nueva por escenario.
  setActivePinia(createPinia());
}

describe('guards del router', () => {
  beforeEach(async () => {
    startSession(null);
    await router.replace('/login');
  });

  it('sin sesión redirige al login conservando el destino', async () => {
    await router.push('/users');

    expect(router.currentRoute.value.name).toBe('login');
    expect(router.currentRoute.value.query.redirect).toBe('/users');
  });

  it('un agente no puede abrir la administración de usuarios', async () => {
    startSession('AGENT');
    await router.push('/users');

    expect(router.currentRoute.value.name).toBe('tasks');
  });

  it('un administrador sí puede abrirla', async () => {
    startSession('ADMIN');
    await router.push('/users');

    expect(router.currentRoute.value.name).toBe('users');
  });
});
