import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { authService, type AuthService } from '../services/authService';
import { sessionStore } from '../services/sessionStorage';
import type { Credentials, Session } from '../types';

export function createAuthStore(service: AuthService = authService) {
  return defineStore('auth', () => {
    const session = ref<Session | null>(sessionStore.load());

    const isAuthenticated = computed(
      () => session.value !== null && session.value.expiresAt > Date.now(),
    );
    const user = computed(() => session.value?.user ?? null);
    const token = computed(() => (isAuthenticated.value ? (session.value?.token ?? null) : null));

    async function login(credentials: Credentials): Promise<void> {
      const response = await service.login(credentials);
      session.value = {
        token: response.token,
        expiresAt: Date.now() + response.expiresIn * 1000,
        user: response.user,
      };
      sessionStore.save(session.value);
    }

    function logout(): void {
      session.value = null;
      sessionStore.clear();
    }

    return { session, isAuthenticated, user, token, login, logout };
  });
}

export const useAuthStore = createAuthStore();
