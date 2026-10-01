<script setup lang="ts">
import { computed } from 'vue';
import { PRIORITY_VISUALS } from '../constants';
import type { Priority } from '../types';

const props = defineProps<{ priority: Priority }>();

const visual = computed(() => PRIORITY_VISUALS[props.priority]);
</script>

<template>
  <span class="priority" :class="`text-${visual.color}`">
    <v-icon :icon="visual.icon" size="18" aria-hidden="true" />
    <span>{{ visual.label }}</span>
  </span>
</template>

<style scoped>
.priority {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: 500;
}
</style>
