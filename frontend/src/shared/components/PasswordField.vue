<script setup lang="ts">
import { mdiEyeOffOutline, mdiEyeOutline, mdiLockOutline } from '@mdi/js';
import { ref } from 'vue';

/** Campo de contraseña con botón accesible para mostrar u ocultar el texto. */
withDefaults(
  defineProps<{
    label: string;
    autocomplete?: string;
    rules?: ((value: string) => boolean | string)[];
    errorMessages?: string | string[];
    hint?: string;
    autofocus?: boolean;
  }>(),
  { autocomplete: 'current-password', rules: () => [], autofocus: false },
);
const model = defineModel<string>({ required: true });
const visible = ref(false);
</script>

<template>
  <v-text-field
    v-model="model"
    :label="label"
    :type="visible ? 'text' : 'password'"
    :prepend-inner-icon="mdiLockOutline"
    :rules="rules"
    :error-messages="errorMessages"
    :hint="hint"
    :persistent-hint="Boolean(hint)"
    :autocomplete="autocomplete"
    :autofocus="autofocus"
  >
    <template #append-inner>
      <v-btn
        :icon="visible ? mdiEyeOffOutline : mdiEyeOutline"
        :aria-label="visible ? 'Ocultar contraseña' : 'Mostrar contraseña'"
        :aria-pressed="visible"
        variant="text"
        size="small"
        density="comfortable"
        @click="visible = !visible"
      />
    </template>
  </v-text-field>
</template>
