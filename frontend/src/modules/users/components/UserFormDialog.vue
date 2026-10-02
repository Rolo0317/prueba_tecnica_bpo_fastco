<script setup lang="ts">
import { mdiEmailOutline, mdiOfficeBuildingOutline, mdiShieldAccountOutline } from '@mdi/js';
import { computed, toRef, watch } from 'vue';
import type { Area, Role } from '@/modules/access/types';
import FormDialog from '@/shared/components/FormDialog.vue';
import PasswordField from '@/shared/components/PasswordField.vue';
import { PASSWORD_HINT } from '@/shared/validation/passwordRules';
import { USER_LIMITS } from '../constants';
import { useUserForm, type UserFormActions } from '../composables/useUserForm';
import type { ManagedUser } from '../types';

const props = defineProps<{
  user: ManagedUser | null;
  currentUserId: number | null;
  actions: UserFormActions;
  roles: Role[];
  areas: Area[];
  /** Con AREAS_MANAGE se puede escribir un área nueva y se crea al guardar. */
  canCreateArea: boolean;
  /** Roles que quien edita puede asignar (sin escalada de privilegios; la API también lo valida). */
  canGrant: (role: Role) => boolean;
}>();
const emit = defineEmits<{ saved: [user: ManagedUser, created: boolean] }>();
const open = defineModel<boolean>({ required: true });

/** Rol por defecto al crear: Colaborador (el de menos permisos del sistema). */
const defaultRoleId = computed(
  () => props.roles.find((role) => role.code === 'COLLABORATOR')?.id ?? null,
);

const { form, isEdit, rules, loading, fieldErrors, generalError, reset, submit } = useUserForm(
  toRef(props, 'user'),
  props.actions,
  { areas: toRef(props, 'areas'), defaultRoleId },
);

const permissionCount = (count: number) =>
  count === 1 ? '1 permiso' : `${String(count)} permisos`;

/** Nadie se cambia su propio rol (la API también lo impide). */
const isSelf = computed(() => props.user !== null && props.user.id === props.currentUserId);

const roleItems = computed(() =>
  props.roles.map((role) => ({
    value: role.id,
    title: role.name,
    subtitle: props.canGrant(role)
      ? (role.description ?? permissionCount(role.permissions.length))
      : 'Tiene permisos que tú no tienes',
    disabled: !props.canGrant(role),
  })),
);
const roleHint = computed(() => {
  if (isSelf.value) return 'No puedes cambiar tu propio rol.';
  return props.roles.find((role) => role.id === form.roleId)?.description ?? '';
});

const areaItems = computed(() => props.areas.map((area) => ({ value: area.id, title: area.name })));
const isNewArea = computed(() => typeof form.area === 'string' && form.area.trim().length > 0);
const areaHint = computed(() => {
  if (isNewArea.value) return `Se creará el área "${String(form.area).trim()}" al guardar.`;
  return props.canCreateArea
    ? 'Elige una o escribe el nombre de una nueva. Vacío = sin área.'
    : 'Opcional. Un supervisor ve las tareas de su área.';
});

watch(open, (isOpen) => {
  if (isOpen) reset();
});

async function onSubmit(): Promise<void> {
  const saved = await submit();
  if (saved) {
    emit('saved', saved, !isEdit.value);
    open.value = false;
  }
}
</script>

<template>
  <FormDialog
    v-model="open"
    :title="isEdit ? 'Editar usuario' : 'Nuevo usuario'"
    :submit-label="isEdit ? 'Guardar cambios' : 'Crear usuario'"
    :loading="loading"
    :general-error="generalError"
    :max-width="560"
    @submit="onSubmit"
  >
    <v-text-field
      v-model="form.username"
      label="Usuario *"
      :readonly="isEdit"
      :hint="isEdit ? 'El nombre de usuario no se puede cambiar' : 'Con este nombre inicia sesión'"
      persistent-hint
      :rules="isEdit ? [] : rules.username"
      :error-messages="fieldErrors.username"
      :maxlength="USER_LIMITS.username"
      autocomplete="off"
      :autofocus="!isEdit"
    />
    <v-text-field
      v-model="form.fullName"
      label="Nombre completo *"
      :rules="rules.fullName"
      :error-messages="fieldErrors.fullName"
      :maxlength="USER_LIMITS.fullName"
      :autofocus="isEdit"
    />
    <v-text-field
      v-model="form.email"
      label="Correo"
      type="email"
      :prepend-inner-icon="mdiEmailOutline"
      :rules="rules.email"
      :error-messages="fieldErrors.email"
      maxlength="254"
      hint="Opcional. Permite recuperar la contraseña con un enlace desde el login."
      persistent-hint
      autocomplete="off"
    />

    <v-autocomplete
      v-model="form.roleId"
      label="Rol *"
      :items="roleItems"
      item-value="value"
      item-title="title"
      :item-props="(item: { subtitle: string; disabled: boolean }) => item"
      :prepend-inner-icon="mdiShieldAccountOutline"
      :rules="rules.roleId"
      :error-messages="fieldErrors.roleId"
      :hint="roleHint"
      persistent-hint
      :disabled="isSelf"
      no-data-text="No hay roles con ese nombre"
    />

    <v-combobox
      v-if="canCreateArea"
      v-model="form.area"
      label="Área"
      :items="areaItems"
      item-value="value"
      item-title="title"
      :return-object="false"
      :prepend-inner-icon="mdiOfficeBuildingOutline"
      :error-messages="fieldErrors.areaId"
      :hint="areaHint"
      persistent-hint
      clearable
    />
    <v-autocomplete
      v-else
      v-model="form.area"
      label="Área"
      :items="areaItems"
      item-value="value"
      item-title="title"
      :prepend-inner-icon="mdiOfficeBuildingOutline"
      :error-messages="fieldErrors.areaId"
      :hint="areaHint"
      persistent-hint
      clearable
      no-data-text="No hay áreas activas"
    />

    <template v-if="!isEdit">
      <PasswordField
        v-model="form.password"
        label="Contraseña inicial *"
        autocomplete="new-password"
        :hint="PASSWORD_HINT"
        :rules="rules.password"
        :error-messages="fieldErrors.password"
      />
      <PasswordField
        v-model="form.confirmPassword"
        label="Confirmar contraseña *"
        autocomplete="new-password"
        :rules="rules.confirmPassword"
      />
    </template>
  </FormDialog>
</template>
