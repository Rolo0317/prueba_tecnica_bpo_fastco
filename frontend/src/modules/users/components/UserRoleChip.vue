<script setup lang="ts">
import { computed } from 'vue';
import { ROLE_VISUALS } from '../constants';
import type { Role } from '../types';

const props = defineProps<{ role: Role }>();
const visual = computed(() => ROLE_VISUALS[props.role]);
</script>

<template>
  <v-chip :color="visual.color" :prepend-icon="visual.icon" size="small" variant="tonal" label>
    {{ visual.label }}
  </v-chip>
</template>
