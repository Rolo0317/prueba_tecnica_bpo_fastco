<script setup lang="ts">
import { mdiWeatherNight, mdiWhiteBalanceSunny } from '@mdi/js';
import { computed } from 'vue';
import { useThemeMode } from '@/shared/composables/useThemeMode';

const { isDark, toggle } = useThemeMode();
const label = computed(() => (isDark.value ? 'Activar modo claro' : 'Activar modo oscuro'));
</script>

<template>
  <v-tooltip :text="label" location="bottom">
    <template #activator="{ props: tooltipProps }">
      <v-btn
        v-bind="tooltipProps"
        :icon="isDark ? mdiWhiteBalanceSunny : mdiWeatherNight"
        :aria-label="label"
        :aria-pressed="isDark"
        variant="text"
        @click="toggle"
      />
    </template>
  </v-tooltip>
</template>
