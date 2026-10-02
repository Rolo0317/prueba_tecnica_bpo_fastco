import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { sessionStore } from '@/modules/auth/services/sessionStorage';
import { router } from '@/router';
import { buildAuthUser, COLLABORATOR } from '../helpers';

function startSession(role: 'ADMIN' | 'COLLABORATOR' | null): void {
  window.sessionStorage.clear();
  if (role) {
    sessionStore.save({
      token: 'jwt',
      expiresAt: Date.now() + 60_000,
      user: role === 'ADMIN' ? buildAuthUser() : COLLABORATOR,
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

  it('sin el permiso no se abren usuarios, áreas ni roles', async () => {
    startSession('COLLABORATOR');
    for (const path of ['/users', '/areas', '/roles']) {
      await router.push(path);
      expect(router.currentRoute.value.name).toBe('tasks');
    }
  });

  it('cada pantalla exige su propio permiso', async () => {
    window.sessionStorage.clear();
    sessionStore.save({
      token: 'jwt',
      expiresAt: Date.now() + 60_000,
      user: buildAuthUser({ permissions: ['AREAS_MANAGE'] }),
    });
    setActivePinia(createPinia());

    await router.push('/areas');
    expect(router.currentRoute.value.name).toBe('areas');
    await router.push('/roles');
    expect(router.currentRoute.value.name).toBe('tasks');
  });

  it('un administrador sí puede abrirla', async () => {
    startSession('ADMIN');
    await router.push('/users');

    expect(router.currentRoute.value.name).toBe('users');
  });
});
