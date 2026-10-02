import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { Permission } from '@/modules/access/types';
import { accountService, type AccountService } from '../services/accountService';
import { authService, type AuthService } from '../services/authService';
import { sessionStore } from '../services/sessionStorage';
import type { AuthUser, Credentials, LoginResponse, Session } from '../types';

export function createAuthStore(
  service: AuthService = authService,
  account: Pick<AccountService, 'me'> = accountService,
) {
  return defineStore('auth', () => {
    const session = ref<Session | null>(sessionStore.load());

    const isAuthenticated = computed(
      () => session.value !== null && session.value.expiresAt > Date.now(),
    );
    const user = computed(() => session.value?.user ?? null);
    /** Solo controla qué se muestra: la API valida cada permiso (403). */
    const can = (permission: Permission): boolean =>
      user.value?.permissions.includes(permission) ?? false;
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

    function setUser(updated: AuthUser): void {
      if (!session.value) return;
      session.value = { ...session.value, user: updated };
      sessionStore.save(session.value);
    }

    /**
     * Trae rol, área y permisos vigentes: si un administrador los cambió, la interfaz
     * se ajusta sin cerrar sesión (la API ya los aplica desde la siguiente petición).
     */
    async function refreshUser(): Promise<void> {
      if (!isAuthenticated.value) return;
      try {
        setUser(await account.me());
      } catch {
        // Sin conexión se conserva lo guardado; un 401 ya cierra la sesión en el cliente HTTP.
      }
    }

    function logout(): void {
      session.value = null;
      sessionStore.clear();
    }

    return {
      session,
      isAuthenticated,
      user,
      can,
      token,
      login,
      logout,
      startSession,
      refreshUser,
    };
  });
}

export const useAuthStore = createAuthStore();
