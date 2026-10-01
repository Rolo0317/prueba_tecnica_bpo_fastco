<script setup lang="ts">
import { mdiClose } from '@mdi/js';
import { nextTick, ref, watch } from 'vue';
import type { VForm } from 'vuetify/components';
import { todayIso } from '@/shared/utils/dates';
import { PRIORITY_OPTIONS, TASK_LIMITS } from '../constants';
import { taskFormRules, useTaskForm } from '../composables/useTaskForm';
import type { CreateTaskPayload, Task } from '../types';

const props = defineProps<{ submitTask: (payload: CreateTaskPayload) => Promise<Task> }>();
const emit = defineEmits<{ created: [task: Task] }>();
const open = defineModel<boolean>({ required: true });

const { form, loading, fieldErrors, generalError, reset, submit } = useTaskForm(props.submitTask);
const formRef = ref<VForm | null>(null);

watch(open, (isOpen) => {
  if (isOpen) reset();
});

async function onSubmit(): Promise<void> {
  const validation = await formRef.value?.validate();
  if (!validation?.valid) {
    // Accesibilidad: llevar el foco al primer campo con error.
    await nextTick();
    document
      .querySelector<HTMLElement>(
        '.task-form .v-input--error input, .task-form .v-input--error textarea',
      )
      ?.focus();
    return;
  }
  const task = await submit();
  if (task) {
    emit('created', task);
    open.value = false;
  }
}
</script>

<template>
  <v-dialog
    v-model="open"
    max-width="560"
    :persistent="loading"
    aria-labelledby="create-task-title"
  >
    <v-card rounded="lg">
      <v-card-title class="dialog-title">
        <h2 id="create-task-title">Nueva tarea</h2>
        <v-btn
          :icon="mdiClose"
          variant="text"
          size="small"
          aria-label="Cerrar"
          :disabled="loading"
          @click="open = false"
        />
      </v-card-title>

      <v-form ref="formRef" class="task-form" validate-on="blur" @submit.prevent="onSubmit">
        <v-card-text class="form-body">
          <v-alert v-if="generalError" type="error" variant="tonal" density="compact" role="alert">
            {{ generalError }}
          </v-alert>

          <v-text-field
            v-model="form.title"
            label="Título *"
            :rules="taskFormRules.title"
            :error-messages="fieldErrors.title"
            :counter="TASK_LIMITS.title"
            :maxlength="TASK_LIMITS.title"
            autofocus
            required
          />

          <v-textarea
            v-model="form.description"
            label="Descripción"
            hint="Opcional: contexto para quien atienda la tarea"
            persistent-hint
            :rules="taskFormRules.description"
            :error-messages="fieldErrors.description"
            :counter="TASK_LIMITS.description"
            :maxlength="TASK_LIMITS.description"
            rows="3"
            auto-grow
          />

          <fieldset class="priority-field">
            <legend class="priority-field__legend">Prioridad</legend>
            <v-btn-toggle
              v-model="form.priority"
              mandatory
              divided
              variant="outlined"
              color="primary"
              density="comfortable"
            >
              <v-btn
                v-for="option in PRIORITY_OPTIONS"
                :key="option.value"
                :value="option.value"
                :prepend-icon="option.icon"
              >
                {{ option.label }}
              </v-btn>
            </v-btn-toggle>
          </fieldset>

          <v-text-field
            v-model="form.dueDate"
            label="Fecha límite"
            type="date"
            :min="todayIso()"
            hint="Opcional"
            persistent-hint
            :rules="taskFormRules.dueDate"
            :error-messages="fieldErrors.dueDate"
          />
        </v-card-text>

        <v-card-actions class="dialog-actions">
          <v-btn variant="text" :disabled="loading" @click="open = false">Cancelar</v-btn>
          <v-btn type="submit" color="primary" variant="flat" :loading="loading">Crear tarea</v-btn>
        </v-card-actions>
      </v-form>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.dialog-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 16px 0 24px;
}
.dialog-title h2 {
  font-size: 1.25rem;
  font-weight: 600;
}
.form-body {
  display: grid;
  gap: 12px;
}
.priority-field {
  border: 0;
  padding: 0;
  margin: 0;
}
.priority-field__legend {
  font-size: 0.875rem;
  margin-bottom: 6px;
  color: rgb(var(--v-theme-on-surface), 0.75);
}
.dialog-actions {
  justify-content: flex-end;
  padding: 8px 24px 20px;
}
</style>
