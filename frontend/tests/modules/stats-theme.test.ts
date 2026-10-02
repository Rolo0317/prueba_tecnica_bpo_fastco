import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TaskStatsPanel from '@/modules/tasks/components/TaskStatsPanel.vue';
import { useTaskStats } from '@/modules/tasks/composables/useTaskStats';
import { initialThemeMode, saveThemeMode } from '@/plugins/theme';
import LiquidGauge from '@/shared/components/LiquidGauge.vue';
import { todayIso } from '@/shared/utils/dates';
import { STATS, vuetify } from '../helpers';

const mountPanel = (activeStatus: string | null = null) =>
  mount(TaskStatsPanel, {
    props: { stats: STATS, loading: false, errorMessage: null, activeStatus },
    global: { plugins: [vuetify] },
  });

describe('useTaskStats', () => {
  it('pide las estadísticas con la fecha local del usuario', async () => {
    const stats = vi.fn().mockResolvedValue(STATS);
    const { load, stats: data } = useTaskStats({ stats });

    await load();

    expect(stats).toHaveBeenCalledWith(todayIso(), null);
    expect(data.value?.total).toBe(10);
  });
});

describe('TaskStatsPanel', () => {
  it('muestra un indicador por estado y los KPI con texto accesible', () => {
    const wrapper = mountPanel();
    const gauges = wrapper.findAll('.gauge-button');

    expect(gauges).toHaveLength(4);
    expect(gauges[0]?.attributes('aria-label')).toBe(
      'Pendiente: 5 tareas, 50 % del total. Filtrar por este estado',
    );
    expect(wrapper.find('dl').text()).toContain('Vencidas sin cerrar');
    expect(wrapper.find('dl').text()).toContain('2');
  });

  it('clic en un indicador filtra por ese estado; otro clic quita el filtro', async () => {
    await mountPanel().findAll('.gauge-button')[1]?.trigger('click');
    const active = mountPanel('IN_PROGRESS');
    await active.findAll('.gauge-button')[1]?.trigger('click');

    expect(active.findAll('.gauge-button')[1]?.attributes('aria-pressed')).toBe('true');
    expect(active.emitted('select')).toEqual([[null]]);
  });

  it('ante un error muestra la opción de reintentar', async () => {
    const wrapper = mount(TaskStatsPanel, {
      props: { stats: null, loading: false, errorMessage: 'Sin conexión', activeStatus: null },
      global: { plugins: [vuetify] },
    });

    expect(wrapper.text()).toContain('No se pudieron cargar los indicadores');
    await wrapper.find('button').trigger('click');
    expect(wrapper.emitted('retry')).toHaveLength(1);
  });
});

describe('LiquidGauge', () => {
  it('usa el color del tema y muestra el contenido del slot', () => {
    const wrapper = mount(LiquidGauge, {
      props: { percentage: 40, color: 'success' },
      slots: { default: '<span>40 %</span>' },
    });

    expect(wrapper.attributes('style')).toContain('--gauge-color: var(--v-theme-success)');
    expect(wrapper.text()).toBe('40 %');
  });
});

describe('preferencia de tema', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it('recuerda el modo elegido por la persona', () => {
    saveThemeMode('dark');
    expect(initialThemeMode()).toBe('dark');

    saveThemeMode('light');
    expect(initialThemeMode()).toBe('light');
  });

  it('sin preferencia guardada usa la del sistema operativo', () => {
    const matchMedia = vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
    } as MediaQueryList);

    expect(initialThemeMode()).toBe('dark');
    matchMedia.mockRestore();
  });
});
