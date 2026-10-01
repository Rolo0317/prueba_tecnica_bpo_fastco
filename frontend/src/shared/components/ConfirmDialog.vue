<script setup lang="ts">
/** Confirmación antes de acciones sensibles (p. ej. desactivar un usuario). */
withDefaults(
  defineProps<{
    title: string;
    message: string;
    confirmText?: string;
    color?: string;
    loading?: boolean;
  }>(),
  { confirmText: 'Confirmar', color: 'error', loading: false },
);
const open = defineModel<boolean>({ required: true });
const emit = defineEmits<{ confirm: [] }>();
</script>

<template>
  <v-dialog v-model="open" max-width="440" :persistent="loading" aria-labelledby="confirm-title">
    <v-card>
      <v-card-title id="confirm-title" class="confirm-title">{{ title }}</v-card-title>
      <v-card-text>{{ message }}</v-card-text>
      <v-card-actions class="confirm-actions">
        <v-btn variant="text" :disabled="loading" @click="open = false">Cancelar</v-btn>
        <v-btn :color="color" variant="flat" :loading="loading" @click="emit('confirm')">
          {{ confirmText }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.confirm-title {
  font-weight: 600;
  padding: 20px 24px 8px;
}
.confirm-actions {
  justify-content: flex-end;
  padding: 8px 24px 20px;
}
</style>
