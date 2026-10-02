import { computed, onBeforeUnmount, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { toApiError, type ApiError } from '@/core/http';
import { safeRedirect } from '@/shared/utils/safeRedirect';
import { useAuthStore } from '../stores/authStore';
import { useCaptcha } from './useCaptcha';

export const loginRules = {
  username: [(value: string) => value.trim().length > 0 || 'Ingresa tu usuario.'],
  password: [(value: string) => value.length > 0 || 'Ingresa tu contraseña.'],
};

/** "m:ss" para la cuenta regresiva del bloqueo. */
export const formatCountdown = (seconds: number) =>
  `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, '0')}`;

/** Mensaje del error de login con los intentos restantes, si la API los informa. */
export function loginErrorMessage(error: ApiError): string {
  const remaining = error.meta.attemptsRemaining;
  if (error.status !== 401 || remaining === undefined) return error.message;
  if (remaining === 0)
    return `${error.message} Tu acceso se bloqueará en el próximo intento fallido.`;
  return `${error.message} Te ${remaining === 1 ? 'queda 1 intento' : `quedan ${String(remaining)} intentos`}.`;
}

/**
 * ViewModel del login: formulario, captcha, intentos restantes, bloqueo temporal con
 * cuenta regresiva y redirección al destino original.
 */
export function useLoginForm() {
  const auth = useAuthStore();
  const router = useRouter();
  const route = useRoute();
  const captcha = useCaptcha();

  const credentials = reactive({ username: '', password: '' });
  const sessionExpired = route.query.expired === '1';
  const loading = ref(false);
  const error = ref<ApiError | null>(null);
  const captchaMissing = ref(false);
  const lockedSeconds = ref(0);
  let timer: ReturnType<typeof setInterval> | undefined;

  const locked = computed(() => lockedSeconds.value > 0);
  const errorMessage = computed(() => (error.value ? loginErrorMessage(error.value) : null));

  function startLockout(seconds: number): void {
    lockedSeconds.value = seconds;
    clearInterval(timer);
    timer = setInterval(() => {
      lockedSeconds.value = Math.max(0, lockedSeconds.value - 1);
      if (lockedSeconds.value === 0) {
        clearInterval(timer);
        error.value = null;
      }
    }, 1000);
  }

  async function submit(): Promise<void> {
    if (locked.value || loading.value) return;
    if (!captcha.ready.value) {
      captchaMissing.value = true;
      return;
    }
    captchaMissing.value = false;
    loading.value = true;
    error.value = null;
    try {
      await auth.login({
        username: credentials.username.trim(),
        password: credentials.password,
        captcha: captcha.payload.value,
      });
      await router.replace(safeRedirect(route.query.redirect));
    } catch (caught) {
      error.value = toApiError(caught);
      const retryAfter = error.value.meta.retryAfterSeconds;
      if (error.value.status === 429 && retryAfter) startLockout(retryAfter);
      captcha.reset(); // cada verificación sirve para un solo intento
    } finally {
      loading.value = false;
    }
  }

  onBeforeUnmount(() => {
    clearInterval(timer);
  });

  return {
    credentials,
    sessionExpired,
    loading,
    error,
    errorMessage,
    captcha,
    captchaMissing,
    locked,
    lockedSeconds,
    submit,
  };
}
