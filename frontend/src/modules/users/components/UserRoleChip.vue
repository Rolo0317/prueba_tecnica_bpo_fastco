<script setup lang="ts">
import { mdiShieldAccountOutline } from '@mdi/js';
import type { NamedRef } from '@/modules/access/types';

defineProps<{ role: NamedRef }>();
</script>

<template>
  <v-chip
    :prepend-icon="mdiShieldAccountOutline"
    color="secondary"
    size="small"
    variant="tonal"
    label
  >
    {{ role.name }}
  </v-chip>
</template>
