<script setup lang="ts">
import {
  mdiAlertCircleOutline,
  mdiCalendarClockOutline,
  mdiChevronDoubleUp,
  mdiClipboardListOutline,
  mdiRefresh,
} from '@mdi/js';
import { computed } from 'vue';
import LiquidGauge from '@/shared/components/LiquidGauge.vue';
import { statusVisual } from '../constants';
import type { TaskStats } from '../types';

const props = defineProps<{
  stats: TaskStats | null;
  loading: boolean;
  errorMessage: string | null;
  activeStatus: string | null;
}>();
const emit = defineEmits<{ select: [status: string | null]; retry: [] }>();

const gauges = computed(() =>
  (props.stats?.byStatus ?? []).map((status) => ({
    ...status,
    visual: statusVisual(status.code, status.name),
    active: props.activeStatus === status.code,
  })),
);

const kpis = computed(() => {
  const stats = props.stats;
  return [
    {
      label: 'Total de tareas',
      value: stats?.total,
      icon: mdiClipboardListOutline,
      color: 'primary',
    },
    {
      label: 'Vencidas sin cerrar',
      value: stats?.overdue,
      icon: mdiAlertCircleOutline,
      color: 'error',
    },
    {
      label: 'Vencen hoy',
      value: stats?.dueToday,
      icon: mdiCalendarClockOutline,
      color: 'warning',
    },
    {
      label: 'Prioridad alta abiertas',
      value: stats?.highPriorityOpen,
      icon: mdiChevronDoubleUp,
      color: 'error',
    },
  ];
});

const SKELETON_COUNT = 4;

/** Clic en un indicador = filtrar la tabla por ese estado (otro clic quita el filtro). */
function toggle(code: string): void {
  emit('select', props.activeStatus === code ? null : code);
}
</script>

<template>
  <section class="stats-panel" aria-labelledby="stats-title">
    <h2 id="stats-title" class="sr-only">Indicadores de tareas</h2>

    <v-alert v-if="errorMessage && !stats" type="warning" variant="tonal" density="compact">
      <div class="stats-panel__error">
        <span>No se pudieron cargar los indicadores. {{ errorMessage }}</span>
        <v-btn :prepend-icon="mdiRefresh" size="small" variant="text" @click="emit('retry')">
          Reintentar
        </v-btn>
      </div>
    </v-alert>

    <template v-else>
      <v-card class="stats-panel__gauges">
        <template v-if="stats">
          <button
            v-for="gauge in gauges"
            :key="gauge.code"
            type="button"
            class="gauge-button"
            :class="{ 'gauge-button--active': gauge.active }"
            :aria-pressed="gauge.active"
            :aria-label="`${gauge.name}: ${gauge.count} tareas, ${gauge.percentage} % del total. ${gauge.active ? 'Quitar filtro' : 'Filtrar por este estado'}`"
            @click="toggle(gauge.code)"
          >
            <LiquidGauge :percentage="gauge.percentage" :color="gauge.visual.color" :size="104">
              <span class="gauge-button__count tabular">{{ gauge.count }}</span>
              <span class="gauge-button__percentage tabular">{{ gauge.percentage }} %</span>
            </LiquidGauge>
            <span class="gauge-button__label">
              <v-icon :icon="gauge.visual.icon" size="16" :color="gauge.visual.color" />
              {{ gauge.name }}
            </span>
          </button>
        </template>
        <template v-else>
          <div
            v-for="index in SKELETON_COUNT"
            :key="index"
            class="gauge-skeleton"
            aria-hidden="true"
          >
            <v-skeleton-loader
              type="avatar"
              width="104"
              height="104"
              class="gauge-skeleton__circle"
            />
            <v-skeleton-loader type="text" width="90" />
          </div>
        </template>
      </v-card>

      <dl class="stats-panel__kpis" :aria-busy="loading">
        <v-card v-for="kpi in kpis" :key="kpi.label" class="kpi">
          <dt class="kpi__label">
            <v-icon :icon="kpi.icon" :color="kpi.color" size="22" aria-hidden="true" />
            {{ kpi.label }}
          </dt>
          <dd class="kpi__value tabular">
            <v-progress-circular v-if="kpi.value === undefined" indeterminate size="20" width="2" />
            <template v-else>{{ kpi.value }}</template>
          </dd>
        </v-card>
      </dl>
    </template>
  </section>
</template>

<style scoped>
.stats-panel {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  gap: 16px;
}
.stats-panel > .v-alert {
  grid-column: 1 / -1;
}
.stats-panel__error {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.stats-panel__gauges {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(128px, 1fr));
  gap: 8px;
  padding: 16px;
}
.gauge-button {
  display: grid;
  justify-items: center;
  gap: 8px;
  padding: 10px 6px;
  border-radius: 14px;
  border: 1px solid transparent;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
  transition:
    background-color 0.2s,
    border-color 0.2s,
    transform 0.2s;
}
.gauge-button:hover {
  background: rgb(var(--v-theme-on-surface), 0.04);
  transform: translateY(-2px);
}
.gauge-button--active {
  border-color: rgb(var(--v-theme-primary));
  background: rgb(var(--v-theme-primary), 0.06);
}
.gauge-button__count {
  font-size: 1.6rem;
  font-weight: 600;
}
.gauge-button__percentage {
  font-size: 0.8rem;
  font-weight: 500;
}
.gauge-button__label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.875rem;
  font-weight: 500;
}
.gauge-skeleton {
  display: grid;
  justify-items: center;
  gap: 8px;
  padding: 10px 6px;
}
.gauge-skeleton__circle :deep(.v-skeleton-loader__avatar) {
  width: 104px;
  height: 104px;
  max-width: none;
  max-height: none;
}
.stats-panel__kpis {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin: 0;
}
.kpi {
  display: grid;
  align-content: start;
  gap: 4px;
  padding: 14px 16px;
}
.kpi__label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8125rem;
  color: rgb(var(--v-theme-on-surface), 0.72);
}
.kpi__value {
  margin: 0;
  font-size: 1.75rem;
  font-weight: 600;
  line-height: 1.1;
}

@media (max-width: 1099px) {
  .stats-panel {
    grid-template-columns: 1fr;
  }
  .stats-panel__kpis {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
@media (max-width: 599px) {
  .stats-panel__gauges {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .stats-panel__kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
