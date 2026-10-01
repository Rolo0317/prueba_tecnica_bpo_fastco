import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { authService, type AuthService } from '../services/authService';
import { sessionStore } from '../services/sessionStorage';
import type { Credentials, LoginResponse, Session } from '../types';

export function createAuthStore(service: AuthService = authService) {
  return defineStore('auth', () => {
    const session = ref<Session | null>(sessionStore.load());

    const isAuthenticated = computed(
      () => session.value !== null && session.value.expiresAt > Date.now(),
    );
    const user = computed(() => session.value?.user ?? null);
    /** Solo controla qué se muestra: los permisos reales los valida la API (403). */
    const isAdmin = computed(() => user.value?.role === 'ADMIN');
    const token = computed(() => (isAuthenticated.value ? (session.value?.token ?? null) : null));

    /** Guarda una sesión emitida por la API (login o renovación tras cambiar la contraseña). */
    function startSession(response: LoginResponse): void {
      session.value = {
        token: response.token,
        expiresAt: Date.now() + response.expiresIn * 1000,
        user: response.user,
      };
      sessionStore.save(session.value);
    }

    async function login(credentials: Credentials): Promise<void> {
      startSession(await service.login(credentials));
    }

    function logout(): void {
      session.value = null;
      sessionStore.clear();
    }

    return { session, isAuthenticated, user, isAdmin, token, login, logout, startSession };
  });
}

export const useAuthStore = createAuthStore();
