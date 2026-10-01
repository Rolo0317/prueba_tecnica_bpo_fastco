import type { Session } from '../types';

const STORAGE_KEY = 'task-manager.session';

/**
 * Persistencia de la sesión en sessionStorage: sobrevive a recargas, pero se borra
 * al cerrar la pestaña (menor exposición que localStorage). El acceso puede fallar
 * en modo privado o con almacenamiento bloqueado, así que todo va en try/catch.
 */
export const sessionStore = {
  load(now: number = Date.now()): Session | null {
    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const session = JSON.parse(raw) as Session;
      return session.expiresAt > now ? session : null;
    } catch {
      return null;
    }
  },

  save(session: Session): void {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch {
      // Sin almacenamiento la sesión sigue viva en memoria hasta recargar.
    }
  },

  clear(): void {
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nada que limpiar.
    }
  },
};
