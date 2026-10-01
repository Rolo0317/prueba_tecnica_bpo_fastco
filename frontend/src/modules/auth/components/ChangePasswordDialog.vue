<script setup lang="ts">
import { watch } from 'vue';
import FormDialog from '@/shared/components/FormDialog.vue';
import PasswordField from '@/shared/components/PasswordField.vue';
import { useNotifier } from '@/shared/composables/useNotifier';
import { PASSWORD_HINT } from '@/shared/validation/passwordRules';
import { useChangePassword } from '../composables/useChangePassword';

const open = defineModel<boolean>({ required: true });
const { form, rules, loading, fieldErrors, generalError, reset, submit } = useChangePassword();
const notifier = useNotifier();

watch(open, (isOpen) => {
  if (isOpen) reset();
});

async function onSubmit(): Promise<void> {
  if (await submit()) {
    notifier.success('Tu contraseña se actualizó correctamente.');
    open.value = false;
  }
}
</script>

<template>
  <FormDialog
    v-model="open"
    title="Cambiar mi contraseña"
    :loading="loading"
    :general-error="generalError"
    :max-width="480"
    @submit="onSubmit"
  >
    <PasswordField
      v-model="form.currentPassword"
      label="Contraseña actual *"
      :rules="rules.currentPassword"
      :error-messages="fieldErrors.currentPassword"
      autofocus
    />
    <PasswordField
      v-model="form.newPassword"
      label="Nueva contraseña *"
      autocomplete="new-password"
      :hint="PASSWORD_HINT"
      :rules="rules.newPassword"
      :error-messages="fieldErrors.newPassword"
    />
    <PasswordField
      v-model="form.confirmPassword"
      label="Confirmar nueva contraseña *"
      autocomplete="new-password"
      :rules="rules.confirmPassword"
    />
  </FormDialog>
</template>
