<script setup lang="ts">
import { mdiAccountOutline, mdiEmailCheckOutline } from '@mdi/js';
import { ref, watch } from 'vue';
import FormDialog from '@/shared/components/FormDialog.vue';
import { useFormSubmit } from '@/shared/composables/useFormSubmit';
import { useCaptcha } from '../composables/useCaptcha';
import { authService, type AuthService } from '../services/authService';
import CaptchaCheckbox from './CaptchaCheckbox.vue';

const props = withDefaults(
  defineProps<{
    initialUsername?: string;
    service?: Pick<AuthService, 'requestPasswordReset'>;
  }>(),
  { initialUsername: '', service: () => authService },
);
const open = defineModel<boolean>({ required: true });

const username = ref('');
const sentMessage = ref<string | null>(null);
const captchaMissing = ref(false);
const captcha = useCaptcha();

const { loading, fieldErrors, generalError, clearErrors, submit } = useFormSubmit(() =>
  props.service.requestPasswordReset(username.value.trim(), captcha.payload.value),
);

watch(open, (isOpen) => {
  if (!isOpen) return;
  username.value = props.initialUsername;
  sentMessage.value = null;
  captchaMissing.value = false;
  captcha.reset();
  clearErrors();
});

async function onSubmit(): Promise<void> {
  if (sentMessage.value) {
    open.value = false;
    return;
  }
  if (!captcha.ready.value) {
    captchaMissing.value = true;
    return;
  }
  const result = await submit();
  captcha.reset();
  if (result) sentMessage.value = result.message;
}
</script>

<template>
  <FormDialog
    v-model="open"
    title="¿Olvidaste tu contraseña?"
    :submit-label="sentMessage ? 'Entendido' : 'Solicitar restablecimiento'"
    :loading="loading"
    :general-error="generalError"
    @submit="onSubmit"
  >
    <v-alert
      v-if="sentMessage"
      type="success"
      variant="tonal"
      :icon="mdiEmailCheckOutline"
      role="status"
    >
      {{ sentMessage }}
    </v-alert>

    <template v-else>
      <p class="text-medium-emphasis forgot-help">
        Escribe tu usuario o tu correo. Te enviaremos un enlace para crear una contraseña nueva
        (vence en 30 minutos). Si tu cuenta no tiene correo registrado, el equipo de administración
        recibirá la solicitud.
      </p>
      <v-text-field
        v-model="username"
        label="Usuario o correo"
        :prepend-inner-icon="mdiAccountOutline"
        :rules="[(value: string) => value.trim().length > 0 || 'Ingresa tu usuario o correo.']"
        :error-messages="fieldErrors.username"
        autocomplete="username"
        autofocus
      />
      <CaptchaCheckbox
        :status="captcha.status.value"
        :error-message="captcha.errorMessage.value ?? fieldErrors.captcha ?? null"
        :invalid="captchaMissing && !captcha.ready.value"
        @verify="captcha.verify()"
      />
    </template>
  </FormDialog>
</template>

<style scoped>
.forgot-help {
  font-size: 0.875rem;
}
</style>
