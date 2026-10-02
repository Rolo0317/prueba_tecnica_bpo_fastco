<script setup lang="ts">
import { reactive, watch } from 'vue';
import FormDialog from '@/shared/components/FormDialog.vue';
import { useFormSubmit } from '@/shared/composables/useFormSubmit';
import type { Area, AreaPayload } from '../types';

const props = defineProps<{
  /** null = crear; un área = editarla. */
  area: Area | null;
  save: (area: Area | null, payload: AreaPayload) => Promise<Area>;
}>();
const emit = defineEmits<{ saved: [area: Area, created: boolean] }>();
const open = defineModel<boolean>({ required: true });

const LIMITS = { name: 80, description: 200 } as const;
const form = reactive({ name: '', description: '', isActive: true });
const rules = {
  name: [
    (value: string) => value.trim().length > 0 || 'El nombre es obligatorio.',
    (value: string) => value.trim().length <= LIMITS.name || 'Máximo 80 caracteres.',
  ],
};

const { loading, fieldErrors, generalError, clearErrors, submit } = useFormSubmit(() =>
  props.save(props.area, {
    name: form.name.trim(),
    description: form.description.trim() || null,
    isActive: form.isActive,
  }),
);

watch(open, (isOpen) => {
  if (!isOpen) return;
  Object.assign(form, {
    name: props.area?.name ?? '',
    description: props.area?.description ?? '',
    isActive: props.area?.isActive ?? true,
  });
  clearErrors();
});

async function onSubmit(): Promise<void> {
  const saved = await submit();
  if (saved) {
    emit('saved', saved, props.area === null);
    open.value = false;
  }
}
</script>

<template>
  <FormDialog
    v-model="open"
    :title="area ? 'Editar área' : 'Nueva área'"
    :submit-label="area ? 'Guardar cambios' : 'Crear área'"
    :loading="loading"
    :general-error="generalError"
    @submit="onSubmit"
  >
    <v-text-field
      v-model="form.name"
      label="Nombre *"
      :rules="rules.name"
      :error-messages="fieldErrors.name"
      :maxlength="LIMITS.name"
      autofocus
    />
    <v-textarea
      v-model="form.description"
      label="Descripción"
      hint="Opcional: qué atiende esta área"
      persistent-hint
      :error-messages="fieldErrors.description"
      :counter="LIMITS.description"
      :maxlength="LIMITS.description"
      rows="2"
      auto-grow
    />
    <v-switch
      v-if="area"
      v-model="form.isActive"
      color="primary"
      inset
      :label="form.isActive ? 'Activa' : 'Inactiva'"
      hint="Un área inactiva no aparece para nuevas tareas ni usuarios; lo existente se conserva"
      persistent-hint
    />
  </FormDialog>
</template>
