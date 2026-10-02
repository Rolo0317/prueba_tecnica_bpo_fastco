<script setup lang="ts">
import { mdiAccountOutline, mdiLockClock } from '@mdi/js';
import { ref } from 'vue';
import BrandIntro from '@/shared/components/BrandIntro.vue';
import BrandMark from '@/shared/components/BrandMark.vue';
import PasswordField from '@/shared/components/PasswordField.vue';
import ThemeToggle from '@/shared/components/ThemeToggle.vue';
import CaptchaCheckbox from '../components/CaptchaCheckbox.vue';
import ForgotPasswordDialog from '../components/ForgotPasswordDialog.vue';
import { formatCountdown, loginRules, useLoginForm } from '../composables/useLoginForm';

const {
  credentials,
  sessionExpired,
  loading,
  error,
  errorMessage,
  captcha,
  captchaMissing,
  locked,
  lockedSeconds,
  submit,
} = useLoginForm();
const forgotOpen = ref(false);
</script>

<template>
  <div class="login-page">
    <div class="login-theme"><ThemeToggle /></div>

    <section class="login-brand" aria-label="fastco">
      <BrandIntro />
    </section>

    <section class="login-panel">
      <v-card class="login-card" rounded="xl" elevation="2">
        <header class="login-header">
          <BrandMark :size="44" />
          <div>
            <h1 class="login-title">Iniciar sesión</h1>
            <p class="text-medium-emphasis">Gestor de Tareas Operativas</p>
          </div>
        </header>

        <v-alert
          v-if="sessionExpired && !error"
          type="info"
          variant="tonal"
          density="compact"
          class="mb-4"
        >
          Tu sesión expiró o dejó de ser válida (por ejemplo, por un cambio de contraseña o de
          permisos). Inicia sesión de nuevo para continuar.
        </v-alert>
        <v-alert
          v-if="locked"
          type="warning"
          variant="tonal"
          density="compact"
          class="mb-4"
          :icon="mdiLockClock"
          role="alert"
        >
          Demasiados intentos fallidos. Por seguridad, el acceso está bloqueado. Podrás intentar de
          nuevo en
          <strong class="tabular">{{ formatCountdown(lockedSeconds) }}</strong>
          .
        </v-alert>
        <v-alert
          v-else-if="error"
          type="error"
          variant="tonal"
          density="compact"
          class="mb-4"
          role="alert"
        >
          {{ errorMessage }}
        </v-alert>

        <v-form class="login-form" validate-on="submit" @submit.prevent="submit">
          <v-text-field
            v-model="credentials.username"
            label="Usuario"
            :prepend-inner-icon="mdiAccountOutline"
            :rules="loginRules.username"
            autocomplete="username"
            autofocus
          />
          <PasswordField
            v-model="credentials.password"
            label="Contraseña"
            :rules="loginRules.password"
          />
          <div class="login-forgot">
            <v-btn variant="text" density="comfortable" color="primary" @click="forgotOpen = true">
              ¿Olvidaste tu contraseña?
            </v-btn>
          </div>
          <CaptchaCheckbox
            :status="captcha.status.value"
            :error-message="captcha.errorMessage.value"
            :invalid="captchaMissing && !captcha.ready.value"
            @verify="captcha.verify()"
          />
          <v-btn
            type="submit"
            color="primary"
            size="large"
            block
            class="mt-2"
            :loading="loading"
            :disabled="locked"
          >
            {{ locked ? `Bloqueado (${formatCountdown(lockedSeconds)})` : 'Ingresar' }}
          </v-btn>
        </v-form>
        <ForgotPasswordDialog v-model="forgotOpen" :initial-username="credentials.username" />
      </v-card>
    </section>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100dvh;
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(360px, 1fr);
  position: relative;
  background: radial-gradient(
    ellipse at 35% 45%,
    rgb(var(--v-theme-surface)) 0 40%,
    rgb(var(--v-theme-background)) 100%
  );
}
.login-theme {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 1;
}
.login-brand {
  display: grid;
  place-items: center;
  padding: 24px;
  overflow: hidden;
}
.login-panel {
  display: grid;
  place-items: center;
  padding: 24px 16px;
}
.login-card {
  width: 100%;
  max-width: 420px;
  padding: 32px;
}
.login-header {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 24px;
}
.login-title {
  font-size: 1.5rem;
  font-weight: 600;
  line-height: 1.2;
}
.login-form {
  display: grid;
  gap: 8px;
}
.login-forgot {
  display: flex;
  justify-content: flex-end;
  margin-top: -12px;
}

@media (max-width: 959px) {
  .login-page {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
  }
  .login-brand {
    padding: 8px 0 0;
  }
  .login-panel {
    align-items: start;
  }
  .login-card {
    padding: 24px;
  }
}
</style>
