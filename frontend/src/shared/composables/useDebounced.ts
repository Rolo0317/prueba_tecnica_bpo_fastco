import { onScopeDispose, ref, watch, type Ref } from 'vue';

/**
 * Copia de `source` que se actualiza cuando deja de cambiar por `delayMs`.
 * Evita una petición por cada tecla en los buscadores.
 */
export function useDebounced<T>(source: Ref<T>, delayMs = 350): Ref<T> {
  const debounced = ref(source.value) as Ref<T>;
  let timer: ReturnType<typeof setTimeout> | undefined;

  watch(source, (value) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      debounced.value = value;
    }, delayMs);
  });

  onScopeDispose(() => {
    clearTimeout(timer);
  });

  return debounced;
}
