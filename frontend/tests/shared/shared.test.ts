import { describe, expect, it } from 'vitest';
import { ApiError } from '@/core/http';
import { useAsyncState } from '@/shared/composables/useAsyncState';
import { dueState, formatDate } from '@/shared/utils/dates';
import { safeRedirect } from '@/shared/utils/safeRedirect';

describe('useAsyncState', () => {
  it('expone loading mientras corre y guarda el resultado', async () => {
    const state = useAsyncState((value: number) => Promise.resolve(value * 2));

    const pending = state.execute(21);
    expect(state.loading.value).toBe(true);

    await pending;
    expect(state.loading.value).toBe(false);
    expect(state.data.value).toBe(42);
    expect(state.error.value).toBeNull();
  });

  it('guarda el error como ApiError y devuelve undefined', async () => {
    const state = useAsyncState(() =>
      Promise.reject(new ApiError(409, 'CONFLICT', 'No permitido')),
    );

    const result = await state.execute();

    expect(result).toBeUndefined();
    expect(state.error.value?.message).toBe('No permitido');
  });

  it('ignora respuestas viejas que llegan después de una más reciente', async () => {
    const resolvers: ((value: string) => void)[] = [];
    const state = useAsyncState(() => new Promise<string>((resolve) => resolvers.push(resolve)));

    const first = state.execute();
    const second = state.execute();
    resolvers[1]?.('reciente');
    resolvers[0]?.('vieja');
    await Promise.all([first, second]);

    expect(state.data.value).toBe('reciente');
  });
});

describe('dates', () => {
  it('formatea fechas sin correr el día por zona horaria', () => {
    expect(formatDate('2026-10-15')).toMatch(/15/);
  });

  it.each([
    ['2026-09-30', 'overdue'],
    ['2026-10-01', 'today'],
    ['2026-10-02', null],
    [null, null],
  ] as const)('dueState(%s) = %s', (date, expected) => {
    expect(dueState(date, '2026-10-01')).toBe(expected);
  });
});

describe('safeRedirect', () => {
  it.each([
    ['/tasks?status=PENDING', '/tasks?status=PENDING'],
    ['//malicioso.example', '/tasks'],
    ['https://malicioso.example', '/tasks'],
    ['/\\malicioso.example', '/tasks'],
    [undefined, '/tasks'],
  ])('safeRedirect(%s) = %s', (input, expected) => {
    expect(safeRedirect(input)).toBe(expected);
  });
});
