import { computed } from 'vue';
import { useAsyncState } from './useAsyncState';

/**
 * Envío de formularios con el contrato de error de la API: errores de validación
 * del servidor asociados a cada campo (`details`) y un error general cuando no hay detalle.
 */
export function useFormSubmit<T, Args extends unknown[]>(operation: (...args: Args) => Promise<T>) {
  const { loading, error, execute } = useAsyncState(operation);

  const fieldErrors = computed<Record<string, string | undefined>>(() =>
    Object.fromEntries(
      (error.value?.details ?? []).map((detail) => [detail.field, detail.message]),
    ),
  );
  const generalError = computed(() =>
    error.value && error.value.details.length === 0 ? error.value.message : null,
  );

  function clearErrors(): void {
    error.value = null;
  }

  return { loading, error, fieldErrors, generalError, clearErrors, submit: execute };
}
