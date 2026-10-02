<script setup lang="ts">
import { mdiCheckCircleOutline } from '@mdi/js';
import { onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import BrandMark from '@/shared/components/BrandMark.vue';
import PasswordField from '@/shared/components/PasswordField.vue';
import ThemeToggle from '@/shared/components/ThemeToggle.vue';
import { useFormSubmit } from '@/shared/composables/useFormSubmit';
import { matchesRule, PASSWORD_HINT, passwordPolicyRules } from '@/shared/validation/passwordRules';
import { authService } from '../services/authService';

const route = useRoute();
const router = useRouter();

/** El token se lee una vez y se quita de la URL (no queda en el historial ni se comparte). */
const token = ref(typeof route.query.token === 'string' ? route.query.token : '');
const form = reactive({ newPassword: '', confirmPassword: '' });
const done = ref(false);
const rules = { confirm: matchesRule(() => form.newPassword) };

const { loading, fieldErrors, generalError, submit } = useFormSubmit(async () => {
  await authService.resetPassword(token.value, form.newPassword);
  return true;
});

onMounted(() => {
  if (route.query.token) void router.replace({ query: {} });
});

async function onSubmit(): Promise<void> {
  if (await submit()) done.value = true;
}
</script>

<template>
  <div class="reset-page">
    <div class="reset-theme"><ThemeToggle /></div>
    <v-card class="reset-card" rounded="xl" elevation="2">
      <header class="reset-header">
        <BrandMark :size="40" />
        <div>
          <h1 class="reset-title">Crear una contraseña nueva</h1>
          <p class="text-medium-emphasis">Gestor de Tareas Operativas</p>
        </div>
      </header>

      <template v-if="done">
        <v-alert type="success" variant="tonal" :icon="mdiCheckCircleOutline" role="status">
          Listo: tu contraseña quedó actualizada y las sesiones abiertas se cerraron por seguridad.
          Ya puedes ingresar con la contraseña nueva.
        </v-alert>
        <v-btn color="primary" size="large" block class="mt-4" :to="{ name: 'login' }">
          Ir a iniciar sesión
        </v-btn>
      </template>

      <v-alert v-else-if="!token" type="error" variant="tonal" role="alert">
        El enlace no es válido. Solicita uno nuevo desde "¿Olvidaste tu contraseña?" en el inicio de
        sesión.
        <div class="mt-3">
          <v-btn variant="outlined" size="small" :to="{ name: 'login' }">Volver al inicio</v-btn>
        </div>
      </v-alert>

      <v-form v-else class="reset-form" validate-on="submit" @submit.prevent="onSubmit">
        <v-alert v-if="generalError" type="error" variant="tonal" density="compact" role="alert">
          {{ generalError }}
          <div class="mt-2">
            <v-btn variant="text" size="small" :to="{ name: 'login' }">Solicitar otro enlace</v-btn>
          </div>
        </v-alert>
        <PasswordField
          v-model="form.newPassword"
          label="Contraseña nueva"
          autocomplete="new-password"
          :hint="PASSWORD_HINT"
          :rules="passwordPolicyRules"
          :error-messages="fieldErrors.newPassword"
        />
        <PasswordField
          v-model="form.confirmPassword"
          label="Confirmar contraseña"
          autocomplete="new-password"
          :rules="rules.confirm"
        />
        <v-btn type="submit" color="primary" size="large" block :loading="loading">
          Guardar contraseña
        </v-btn>
      </v-form>
    </v-card>
  </div>
</template>

<style scoped>
.reset-page {
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: 24px 16px;
  position: relative;
  background: rgb(var(--v-theme-background));
}
.reset-theme {
  position: absolute;
  top: 12px;
  right: 12px;
}
.reset-card {
  width: 100%;
  max-width: 440px;
  padding: 32px;
}
.reset-header {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 24px;
}
.reset-title {
  font-size: 1.35rem;
  font-weight: 600;
  line-height: 1.2;
}
.reset-form {
  display: grid;
  gap: 8px;
}
</style>
