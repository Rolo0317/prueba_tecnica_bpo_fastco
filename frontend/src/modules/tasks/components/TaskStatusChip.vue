<script setup lang="ts">
import { computed } from 'vue';
import { statusVisual } from '../constants';

const props = defineProps<{ code: string; name: string }>();

const visual = computed(() => statusVisual(props.code, props.name));
</script>

<template>
  <v-chip :color="visual.color" :prepend-icon="visual.icon" size="small" variant="tonal" label>
    {{ visual.label }}
  </v-chip>
</template>
