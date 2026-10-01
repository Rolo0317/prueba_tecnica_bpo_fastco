<script setup lang="ts">
import { computed } from 'vue';
import { dueState, formatDate } from '@/shared/utils/dates';

const props = defineProps<{ dueDate: string | null; isFinal: boolean }>();

/** Solo se alerta el vencimiento de tareas abiertas. */
const state = computed(() => (props.isFinal ? null : dueState(props.dueDate)));
</script>

<template>
  <span v-if="!dueDate" class="text-medium-emphasis">Sin fecha</span>
  <span v-else class="due-date">
    <span class="tabular">{{ formatDate(dueDate) }}</span>
    <v-chip v-if="state === 'overdue'" color="error" size="x-small" variant="flat" label>
      Vencida
    </v-chip>
    <v-chip v-else-if="state === 'today'" color="warning" size="x-small" variant="flat" label>
      Vence hoy
    </v-chip>
  </span>
</template>

<style scoped>
.due-date {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}
</style>
