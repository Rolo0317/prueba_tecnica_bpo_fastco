<script setup lang="ts">
import { mdiChevronDown, mdiLockOutline } from '@mdi/js';
import { statusVisual } from '../constants';
import type { Task, TaskStatus } from '../types';

const props = defineProps<{ task: Task; transitions: TaskStatus[]; loading: boolean }>();
const emit = defineEmits<{ change: [status: string] }>();

const label = `Cambiar estado de la tarea "${props.task.title}"`;
</script>

<template>
  <v-tooltip v-if="transitions.length === 0" text="Estado final: no admite cambios" location="top">
    <template #activator="{ props: tooltipProps }">
      <span
        v-bind="tooltipProps"
        tabindex="0"
        class="final-state"
        aria-label="Estado final, sin cambios disponibles"
      >
        <v-icon :icon="mdiLockOutline" size="18" aria-hidden="true" />
      </span>
    </template>
  </v-tooltip>

  <v-menu v-else location="bottom end">
    <template #activator="{ props: menuProps }">
      <v-btn
        v-bind="menuProps"
        :loading="loading"
        :aria-label="label"
        :append-icon="mdiChevronDown"
        size="small"
        variant="tonal"
        color="primary"
      >
        Cambiar estado
      </v-btn>
    </template>
    <v-list density="compact" :aria-label="label">
      <v-list-subheader>Mover a</v-list-subheader>
      <v-list-item
        v-for="status in transitions"
        :key="status.code"
        :title="status.name"
        :prepend-icon="statusVisual(status.code, status.name).icon"
        :base-color="statusVisual(status.code, status.name).color"
        @click="emit('change', status.code)"
      />
    </v-list>
  </v-menu>
</template>

<style scoped>
.final-state {
  display: inline-flex;
  padding: 6px;
  border-radius: 8px;
  color: rgb(var(--v-theme-on-surface), 0.6);
}
.final-state:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
}
</style>
