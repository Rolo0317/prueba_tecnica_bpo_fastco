import { ref, shallowRef, type Ref, type ShallowRef } from 'vue';
import { toApiError, type ApiError } from '@/core/http';

export interface AsyncState<T, Args extends unknown[]> {
  data: ShallowRef<T | null>;
  error: Ref<ApiError | null>;
  loading: Ref<boolean>;
  /** Ejecuta la operación; devuelve el resultado o undefined si falló (el error queda en `error`). */
  execute: (...args: Args) => Promise<T | undefined>;
}

/**
 * Patrón reutilizable de carga asíncrona: data / loading / error.
 * Si se lanzan varias llamadas seguidas, solo la última actualiza el estado
 * (evita que una respuesta lenta y vieja sobrescriba una más reciente).
 */
export function useAsyncState<T, Args extends unknown[]>(
  operation: (...args: Args) => Promise<T>,
): AsyncState<T, Args> {
  const data = shallowRef<T | null>(null);
  const error = ref<ApiError | null>(null);
  const loading = ref(false);
  let latestCall = 0;

  async function execute(...args: Args): Promise<T | undefined> {
    const call = ++latestCall;
    loading.value = true;
    error.value = null;

    try {
      const result = await operation(...args);
      if (call === latestCall) data.value = result;
      return result;
    } catch (caught) {
      if (call === latestCall) error.value = toApiError(caught);
      return undefined;
    } finally {
      if (call === latestCall) loading.value = false;
    }
  }

  return { data, error, loading, execute };
}
