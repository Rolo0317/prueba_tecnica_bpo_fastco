<script setup lang="ts">
import { computed, toRef, watch } from 'vue';
import FormDialog from '@/shared/components/FormDialog.vue';
import PasswordField from '@/shared/components/PasswordField.vue';
import { PASSWORD_HINT } from '@/shared/validation/passwordRules';
import { ROLE_OPTIONS, ROLE_VISUALS, USER_LIMITS } from '../constants';
import { useUserForm, type UserFormActions } from '../composables/useUserForm';
import type { ManagedUser } from '../types';

const props = defineProps<{
  user: ManagedUser | null;
  currentUserId: number | null;
  actions: UserFormActions;
}>();
const emit = defineEmits<{ saved: [user: ManagedUser, created: boolean] }>();
const open = defineModel<boolean>({ required: true });

const { form, isEdit, rules, loading, fieldErrors, generalError, reset, submit } = useUserForm(
  toRef(props, 'user'),
  props.actions,
);

/** Un administrador no puede quitarse a sí mismo el rol (la API también lo impide). */
const isSelf = computed(() => props.user !== null && props.user.id === props.currentUserId);
const roleHint = computed(() =>
  isSelf.value ? 'No puedes cambiar tu propio rol.' : ROLE_VISUALS[form.role].description,
);

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

    <fieldset class="choice-field">
      <legend class="choice-field__legend">Rol</legend>
      <v-btn-toggle
        v-model="form.role"
        mandatory
        divided
        variant="outlined"
        color="primary"
        density="comfortable"
        :disabled="isSelf"
      >
        <v-btn
          v-for="option in ROLE_OPTIONS"
          :key="option.value"
          :value="option.value"
          :prepend-icon="option.icon"
        >
          {{ option.label }}
        </v-btn>
      </v-btn-toggle>
      <p class="role-hint text-medium-emphasis">{{ roleHint }}</p>
    </fieldset>

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

<style scoped>
.role-hint {
  font-size: 0.75rem;
  margin-top: 4px;
}
</style>
