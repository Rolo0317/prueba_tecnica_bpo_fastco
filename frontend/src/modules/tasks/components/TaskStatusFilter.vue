<script setup lang="ts">
import { mdiFormatListBulleted } from '@mdi/js';
import { computed } from 'vue';
import { statusVisual } from '../constants';
import type { TaskStatus } from '../types';

const props = defineProps<{ statuses: TaskStatus[]; modelValue: string | null }>();
const emit = defineEmits<{ 'update:modelValue': [status: string | null] }>();

const ALL = 'ALL';

const selected = computed({
  get: () => props.modelValue ?? ALL,
  set: (value: string | undefined) => {
    emit('update:modelValue', !value || value === ALL ? null : value);
  },
});

const options = computed(() => [
  { value: ALL, label: 'Todas', icon: mdiFormatListBulleted },
  ...props.statuses.map((status) => ({
    value: status.code,
    ...statusVisual(status.code, status.name),
  })),
]);
</script>

<template>
  <v-chip-group
    v-model="selected"
    mandatory
    selected-class="text-primary"
    aria-label="Filtrar tareas por estado"
    class="status-filter"
  >
    <v-chip
      v-for="option in options"
      :key="option.value"
      :value="option.value"
      :aria-pressed="selected === option.value"
      :prepend-icon="option.icon"
      variant="outlined"
      filter
    >
      {{ option.label }}
    </v-chip>
  </v-chip-group>
</template>
