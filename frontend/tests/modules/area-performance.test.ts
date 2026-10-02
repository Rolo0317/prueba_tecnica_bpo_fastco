import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import AreaPerformancePanel from '@/modules/tasks/components/AreaPerformancePanel.vue';
import { useAreaPerformance } from '@/modules/tasks/composables/useAreaPerformance';
import type { AreaPerformance } from '@/modules/tasks/types';
import { formatHours, todayIso } from '@/shared/utils/dates';
import { vuetify } from '../helpers';

const ROWS: AreaPerformance[] = [
  {
    area: { id: 1, name: 'Back Office' },
    open: 12,
    overdue: 3,
    closed: 40,
    avgResolutionHours: 30.5,
  },
  { area: null, open: 6, overdue: 0, closed: 0, avgResolutionHours: null },
];

const mountPanel = (selectable = true, activeAreaId: number | null = null) =>
  mount(AreaPerformancePanel, {
    props: { rows: ROWS, days: 30, loading: false, errorMessage: null, selectable, activeAreaId },
    global: { plugins: [vuetify] },
  });

describe('formatHours', () => {
  it.each([
    [null, '—'],
    [0.4, 'menos de 1 h'],
    [5.2, '5 h'],
    [48, '2 d'],
    [30.5, '1 d 7 h'],
  ])('formatHours(%s) = %s', (hours, expected) => {
    expect(formatHours(hours)).toBe(expected);
  });
});

describe('useAreaPerformance', () => {
  it('pide los últimos 30 días con la fecha local del usuario', async () => {
    const statsByArea = vi.fn().mockResolvedValue(ROWS);
    const performance = useAreaPerformance({ statsByArea });

    await performance.load();

    expect(statsByArea).toHaveBeenCalledWith(todayIso(), 30);
    expect(performance.rows.value).toHaveLength(2);
  });
});

describe('AreaPerformancePanel', () => {
  it('muestra cada área con sus indicadores y "Sin área" para las tareas sin área', () => {
    const text = mountPanel().text();

    expect(text).toContain('Back Office');
    expect(text).toContain('1 d 7 h');
    expect(text).toContain('Sin área');
  });

  it('al hacer clic en un área emite el filtro; de nuevo, lo quita', async () => {
    const wrapper = mountPanel(true, null);
    await wrapper.findAll('tbody tr')[0]?.trigger('click');
    expect(wrapper.emitted('select')?.[0]).toEqual([1]);

    const active = mountPanel(true, 1);
    await active.findAll('tbody tr')[0]?.trigger('click');
    expect(active.emitted('select')?.[0]).toEqual([null]);
  });

  it('no emite filtro si quien lo ve no puede filtrar por área', async () => {
    const wrapper = mountPanel(false);
    await wrapper.findAll('tbody tr')[0]?.trigger('click');

    expect(wrapper.emitted('select')).toBeUndefined();
  });
});
