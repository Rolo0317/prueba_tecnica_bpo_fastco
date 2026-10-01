<script setup lang="ts">
import { mdiAccountOutline } from '@mdi/js';
import BrandIntro from '@/shared/components/BrandIntro.vue';
import BrandMark from '@/shared/components/BrandMark.vue';
import PasswordField from '@/shared/components/PasswordField.vue';
import ThemeToggle from '@/shared/components/ThemeToggle.vue';
import { loginRules, useLoginForm } from '../composables/useLoginForm';

const { credentials, sessionExpired, loading, error, submit } = useLoginForm();
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
          Tu sesión expiró. Inicia sesión de nuevo para continuar.
        </v-alert>
        <v-alert
          v-if="error"
          type="error"
          variant="tonal"
          density="compact"
          class="mb-4"
          role="alert"
        >
          {{ error.message }}
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
          <v-btn type="submit" color="primary" size="large" block :loading="loading">
            Ingresar
          </v-btn>
        </v-form>
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
