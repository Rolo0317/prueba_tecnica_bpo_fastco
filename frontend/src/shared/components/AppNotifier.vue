<script setup lang="ts">
import { useNotifier } from '@/shared/composables/useNotifier';

const { queue } = useNotifier();
</script>

<template>
  <v-snackbar-queue v-model="queue" location="bottom end" closable close-text="Cerrar" />
</template>
