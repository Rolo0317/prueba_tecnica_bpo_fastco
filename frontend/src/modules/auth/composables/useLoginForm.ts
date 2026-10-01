import { reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAsyncState } from '@/shared/composables/useAsyncState';
import { safeRedirect } from '@/shared/utils/safeRedirect';
import { useAuthStore } from '../stores/authStore';
import type { Credentials } from '../types';

export const loginRules = {
  username: [(value: string) => value.trim().length > 0 || 'Ingresa tu usuario.'],
  password: [(value: string) => value.length > 0 || 'Ingresa tu contraseña.'],
};

/** ViewModel del formulario de login: estado del formulario, envío, errores y redirección. */
export function useLoginForm() {
  const auth = useAuthStore();
  const router = useRouter();
  const route = useRoute();

  const credentials = reactive<Credentials>({ username: '', password: '' });
  const showPassword = ref(false);
  const sessionExpired = route.query.expired === '1';

  const { loading, error, execute } = useAsyncState(async (input: Credentials) => {
    await auth.login({ username: input.username.trim(), password: input.password });
    return true;
  });

  async function submit(): Promise<void> {
    const ok = await execute({ ...credentials });
    if (ok) {
      await router.replace(safeRedirect(route.query.redirect));
    }
  }

  return { credentials, showPassword, sessionExpired, loading, error, submit };
}
