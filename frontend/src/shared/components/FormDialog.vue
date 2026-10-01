<script setup lang="ts">
/**
 * Diálogo de formulario reutilizable: título, cierre accesible, error general,
 * validación al enviar con foco en el primer campo inválido y botones Cancelar/Guardar.
 * Solo emite `submit` cuando las reglas del formulario pasan.
 */
import { mdiClose } from '@mdi/js';
import { nextTick, ref, useId } from 'vue';
import type { VForm } from 'vuetify/components';

withDefaults(
  defineProps<{
    title: string;
    submitLabel?: string;
    loading?: boolean;
    generalError?: string | null;
    maxWidth?: number;
  }>(),
  { submitLabel: 'Guardar', loading: false, generalError: null, maxWidth: 520 },
);
const open = defineModel<boolean>({ required: true });
const emit = defineEmits<{ submit: [] }>();

const titleId = useId();
const formRef = ref<VForm | null>(null);

async function onSubmit(): Promise<void> {
  const validation = await formRef.value?.validate();
  if (validation?.valid) {
    emit('submit');
    return;
  }
  await nextTick();
  formRef.value?.$el.querySelector('.v-input--error input, .v-input--error textarea')?.focus();
}
</script>

<template>
  <v-dialog v-model="open" :max-width="maxWidth" :persistent="loading" :aria-labelledby="titleId">
    <v-card>
      <v-card-title class="form-dialog__title">
        <h2 :id="titleId">{{ title }}</h2>
        <v-btn
          :icon="mdiClose"
          variant="text"
          size="small"
          aria-label="Cerrar"
          :disabled="loading"
          @click="open = false"
        />
      </v-card-title>

      <v-form ref="formRef" validate-on="blur" @submit.prevent="onSubmit">
        <v-card-text class="form-dialog__body">
          <v-alert v-if="generalError" type="error" variant="tonal" density="compact" role="alert">
            {{ generalError }}
          </v-alert>
          <slot />
        </v-card-text>
        <v-card-actions class="form-dialog__actions">
          <v-btn variant="text" :disabled="loading" @click="open = false">Cancelar</v-btn>
          <v-btn type="submit" color="primary" variant="flat" :loading="loading">
            {{ submitLabel }}
          </v-btn>
        </v-card-actions>
      </v-form>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.form-dialog__title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 16px 0 24px;
}
.form-dialog__title h2 {
  font-size: 1.25rem;
  font-weight: 600;
}
.form-dialog__body {
  display: grid;
  gap: 12px;
}
.form-dialog__actions {
  justify-content: flex-end;
  padding: 8px 24px 20px;
}
</style>
