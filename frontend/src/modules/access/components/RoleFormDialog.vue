<script setup lang="ts">
import { reactive, watch } from 'vue';
import FormDialog from '@/shared/components/FormDialog.vue';
import { useFormSubmit } from '@/shared/composables/useFormSubmit';
import type { PermissionGroup } from '../composables/useRoles';
import type { Permission, Role, RolePayload } from '../types';

const props = defineProps<{
  /** null = crear; un rol = editarlo. */
  role: Role | null;
  groups: PermissionGroup[];
  /** Permisos de quien edita: no puede otorgar los que no tiene (la API también lo impide). */
  grantable: (permission: Permission) => boolean;
  save: (role: Role | null, payload: RolePayload) => Promise<Role>;
}>();
const emit = defineEmits<{ saved: [role: Role, created: boolean] }>();
const open = defineModel<boolean>({ required: true });

const LIMITS = { name: 50, description: 200 } as const;
const form = reactive({ name: '', description: '', permissions: [] as Permission[] });
const rules = {
  name: [
    (value: string) => value.trim().length > 0 || 'El nombre es obligatorio.',
    (value: string) => value.trim().length <= LIMITS.name || 'Máximo 50 caracteres.',
  ],
};

const { loading, fieldErrors, generalError, clearErrors, submit } = useFormSubmit(() =>
  props.save(props.role, {
    name: form.name.trim(),
    description: form.description.trim() || null,
    permissions: form.permissions,
  }),
);

watch(open, (isOpen) => {
  if (!isOpen) return;
  Object.assign(form, {
    name: props.role?.name ?? '',
    description: props.role?.description ?? '',
    permissions: [...(props.role?.permissions ?? [])],
  });
  clearErrors();
});

async function onSubmit(): Promise<void> {
  const saved = await submit();
  if (saved) {
    emit('saved', saved, props.role === null);
    open.value = false;
  }
}
</script>

<template>
  <FormDialog
    v-model="open"
    :title="role ? 'Editar rol' : 'Nuevo rol'"
    :submit-label="role ? 'Guardar cambios' : 'Crear rol'"
    :loading="loading"
    :general-error="generalError"
    :max-width="600"
    @submit="onSubmit"
  >
    <v-text-field
      v-model="form.name"
      label="Nombre del rol *"
      :rules="rules.name"
      :error-messages="fieldErrors.name"
      :maxlength="LIMITS.name"
      autofocus
    />
    <v-text-field
      v-model="form.description"
      label="Descripción"
      hint="Opcional: para quién es este rol"
      persistent-hint
      :error-messages="fieldErrors.description"
      :maxlength="LIMITS.description"
    />

    <fieldset v-for="group in groups" :key="group.name" class="permission-group">
      <legend class="choice-field__legend">{{ group.name }}</legend>
      <v-checkbox
        v-for="permission in group.permissions"
        :key="permission.code"
        v-model="form.permissions"
        :value="permission.code"
        :label="permission.name"
        :messages="
          grantable(permission.code)
            ? permission.description
            : 'No tienes este permiso para otorgarlo.'
        "
        :disabled="!grantable(permission.code)"
        color="primary"
        density="compact"
      />
    </fieldset>
    <p v-if="form.permissions.length === 0" class="permission-note text-medium-emphasis">
      Sin permisos, quien tenga este rol solo gestiona las tareas asignadas a él y las que crea.
    </p>
  </FormDialog>
</template>

<style scoped>
.permission-group {
  border: 0;
  display: grid;
  gap: 4px;
}
.permission-group :deep(.v-messages) {
  opacity: 1;
  color: rgb(var(--v-theme-on-surface), 0.7);
}
.permission-note {
  font-size: 0.8125rem;
}
</style>
