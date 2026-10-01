<script setup lang="ts">
import { reactive, watch } from 'vue';
import FormDialog from '@/shared/components/FormDialog.vue';
import PasswordField from '@/shared/components/PasswordField.vue';
import { useFormSubmit } from '@/shared/composables/useFormSubmit';
import { matchesRule, PASSWORD_HINT, passwordPolicyRules } from '@/shared/validation/passwordRules';
import type { ManagedUser } from '../types';

const props = defineProps<{
  user: ManagedUser | null;
  resetPassword: (id: number, newPassword: string) => Promise<true>;
}>();
const emit = defineEmits<{ done: [user: ManagedUser] }>();
const open = defineModel<boolean>({ required: true });

const form = reactive({ newPassword: '', confirmPassword: '' });
const confirmRules = matchesRule(() => form.newPassword);

const { loading, fieldErrors, generalError, clearErrors, submit } = useFormSubmit(async () =>
  props.user ? props.resetPassword(props.user.id, form.newPassword) : false,
);

watch(open, (isOpen) => {
  if (!isOpen) return;
  Object.assign(form, { newPassword: '', confirmPassword: '' });
  clearErrors();
});

async function onSubmit(): Promise<void> {
  if ((await submit()) && props.user) {
    emit('done', props.user);
    open.value = false;
  }
}
</script>

<template>
  <FormDialog
    v-model="open"
    title="Restablecer contraseña"
    submit-label="Restablecer"
    :loading="loading"
    :general-error="generalError"
    :max-width="480"
    @submit="onSubmit"
  >
    <p class="text-body-2">
      Asigna una contraseña nueva a
      <strong>{{ user?.fullName }}</strong>
      ({{ user?.username }}). Compártela por un canal seguro y pídele que la cambie al ingresar.
    </p>
    <PasswordField
      v-model="form.newPassword"
      label="Nueva contraseña *"
      autocomplete="new-password"
      :hint="PASSWORD_HINT"
      :rules="passwordPolicyRules"
      :error-messages="fieldErrors.newPassword"
      autofocus
    />
    <PasswordField
      v-model="form.confirmPassword"
      label="Confirmar contraseña *"
      autocomplete="new-password"
      :rules="confirmRules"
    />
  </FormDialog>
</template>
