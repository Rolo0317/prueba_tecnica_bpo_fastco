<script setup lang="ts">
import { mdiCheckBold, mdiShieldCheckOutline } from '@mdi/js';
import type { CaptchaStatus } from '../composables/useCaptcha';

defineProps<{ status: CaptchaStatus; errorMessage: string | null; invalid?: boolean }>();
const emit = defineEmits<{ verify: [] }>();
</script>

<template>
  <div class="captcha" :class="{ 'captcha--invalid': invalid || status === 'error' }">
    <button
      type="button"
      role="checkbox"
      class="captcha__box"
      :aria-checked="status === 'verified'"
      :aria-busy="status === 'verifying'"
      aria-label="No soy un robot"
      :disabled="status === 'verifying' || status === 'verified'"
      @click="emit('verify')"
    >
      <v-progress-circular
        v-if="status === 'verifying'"
        indeterminate
        size="20"
        width="2"
        color="primary"
      />
      <v-icon v-else-if="status === 'verified'" :icon="mdiCheckBold" color="success" size="22" />
    </button>
    <div class="captcha__text">
      <span class="captcha__label">
        {{ status === 'verifying' ? 'Verificando…' : 'No soy un robot' }}
      </span>
      <span v-if="status === 'error'" class="captcha__error" role="alert">
        {{ errorMessage ?? 'No se pudo verificar. Intenta de nuevo.' }}
      </span>
      <span v-else-if="invalid" class="captcha__error" role="alert">
        Confirma que no eres un robot.
      </span>
    </div>
    <span class="captcha__brand" aria-hidden="true">
      <v-icon :icon="mdiShieldCheckOutline" size="22" />
      <small>
        Verificación
        <br />
        sin terceros
      </small>
    </span>
  </div>
</template>

<style scoped>
.captcha {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid rgb(var(--v-border-color), 0.25);
  border-radius: 8px;
  background: rgb(var(--v-theme-surface));
}
.captcha--invalid {
  border-color: rgb(var(--v-theme-error));
}
.captcha__box {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  flex: none;
  border: 2px solid rgb(var(--v-theme-on-surface), 0.45);
  border-radius: 4px;
  background: rgb(var(--v-theme-surface));
  cursor: pointer;
}
.captcha__box:disabled {
  cursor: default;
}
.captcha__box:focus-visible {
  outline: 3px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}
.captcha__text {
  display: grid;
  flex: 1;
}
.captcha__label {
  font-size: 0.95rem;
}
.captcha__error {
  font-size: 0.75rem;
  color: rgb(var(--v-theme-error));
}
.captcha__brand {
  display: grid;
  justify-items: center;
  font-size: 0.6rem;
  line-height: 1.1;
  text-align: center;
  color: rgb(var(--v-theme-on-surface), 0.6);
}
</style>
