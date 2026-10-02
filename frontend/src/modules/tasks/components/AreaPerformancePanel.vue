<script setup lang="ts">
import { mdiChartBoxOutline, mdiRefresh } from '@mdi/js';
import { computed } from 'vue';
import { formatHours } from '@/shared/utils/dates';
import type { AreaPerformance } from '../types';

const props = defineProps<{
  rows: AreaPerformance[];
  days: number;
  loading: boolean;
  errorMessage: string | null;
  /** Si se puede filtrar la tabla por área al hacer clic (quien ve todas las áreas). */
  selectable: boolean;
  activeAreaId: number | null;
}>();
const emit = defineEmits<{ select: [areaId: number | null]; retry: [] }>();

/** La barra compara la carga abierta de cada área contra la más cargada. */
const maxOpen = computed(() => Math.max(1, ...props.rows.map((row) => row.open)));
const items = computed(() =>
  props.rows.map((row) => ({
    ...row,
    key: row.area?.id ?? 'none',
    name: row.area?.name ?? 'Sin área',
    load: Math.round((row.open / maxOpen.value) * 100),
    active: row.area !== null && row.area.id === props.activeAreaId,
  })),
);

function select(areaId: number | null): void {
  if (props.selectable && areaId !== null) {
    emit('select', areaId === props.activeAreaId ? null : areaId);
  }
}
</script>

<template>
  <v-card class="performance" rounded="lg">
    <div class="performance__header">
      <div>
        <h2 class="performance__title">
          <v-icon :icon="mdiChartBoxOutline" size="20" aria-hidden="true" />
          Desempeño por área
        </h2>
        <p class="text-medium-emphasis performance__subtitle">
          Carga abierta, vencidas y tiempo promedio de cierre (últimos {{ days }} días)
        </p>
      </div>
      <v-btn
        :icon="mdiRefresh"
        variant="text"
        size="small"
        :loading="loading"
        aria-label="Actualizar desempeño por área"
        @click="emit('retry')"
      />
    </div>

    <v-alert v-if="errorMessage" type="error" variant="tonal" class="ma-4" role="alert">
      {{ errorMessage }}
    </v-alert>
    <v-skeleton-loader v-else-if="loading && rows.length === 0" type="table-row@4" />
    <p v-else-if="rows.length === 0" class="pa-4 text-medium-emphasis">
      Aún no hay tareas para medir.
    </p>

    <div v-else class="performance__scroll">
      <table class="performance__table">
        <thead>
          <tr>
            <th scope="col">Área</th>
            <th scope="col" class="num">Abiertas</th>
            <th scope="col" class="num">Vencidas</th>
            <th scope="col" class="num">Cerradas</th>
            <th scope="col" class="num">Tiempo prom. de cierre</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="item in items"
            :key="item.key"
            :class="{ 'is-active': item.active, 'is-selectable': selectable && item.area }"
            :tabindex="selectable && item.area ? 0 : undefined"
            :aria-pressed="selectable && item.area ? item.active : undefined"
            @click="select(item.area?.id ?? null)"
            @keydown.enter.prevent="select(item.area?.id ?? null)"
            @keydown.space.prevent="select(item.area?.id ?? null)"
          >
            <th scope="row">
              <span class="area-name">{{ item.name }}</span>
              <span class="load-bar" aria-hidden="true">
                <span class="load-bar__fill" :style="{ width: `${item.load}%` }" />
              </span>
            </th>
            <td class="num tabular">{{ item.open }}</td>
            <td class="num tabular" :class="{ 'text-error font-weight-bold': item.overdue > 0 }">
              {{ item.overdue }}
            </td>
            <td class="num tabular">{{ item.closed }}</td>
            <td class="num tabular">{{ formatHours(item.avgResolutionHours) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </v-card>
</template>

<style scoped>
.performance__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding: 16px 16px 8px;
}
.performance__title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 1.05rem;
  font-weight: 600;
}
.performance__subtitle {
  font-size: 0.8125rem;
}
.performance__scroll {
  overflow-x: auto;
  padding: 0 8px 12px;
}
.performance__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}
.performance__table th,
.performance__table td {
  padding: 8px;
  text-align: start;
  border-bottom: 1px solid rgb(var(--v-border-color), var(--v-border-opacity));
  white-space: nowrap;
}
.performance__table thead th {
  font-weight: 600;
  color: rgb(var(--v-theme-on-surface), 0.75);
}
.performance__table tbody th {
  font-weight: 500;
  min-width: 200px;
}
.num {
  text-align: end !important;
}
.area-name {
  display: block;
}
.load-bar {
  display: block;
  height: 4px;
  margin-top: 4px;
  border-radius: 2px;
  background: rgb(var(--v-theme-on-surface), 0.08);
}
.load-bar__fill {
  display: block;
  height: 100%;
  border-radius: 2px;
  background: rgb(var(--v-theme-primary));
}
.is-selectable {
  cursor: pointer;
}
.is-selectable:hover,
.is-selectable:focus-visible {
  background: rgb(var(--v-theme-primary), 0.06);
  outline: none;
}
.is-active {
  background: rgb(var(--v-theme-primary), 0.12);
}
</style>
