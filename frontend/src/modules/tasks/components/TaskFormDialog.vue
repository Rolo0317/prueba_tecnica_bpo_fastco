<script setup lang="ts">
import { mdiAccountOutline } from '@mdi/js';
import { computed, toRef, watch } from 'vue';
import FormDialog from '@/shared/components/FormDialog.vue';
import { todayIso } from '@/shared/utils/dates';
import { PRIORITY_OPTIONS, TASK_LIMITS } from '../constants';
import { taskFormRules, useTaskForm, type TaskFormActions } from '../composables/useTaskForm';
import type { Assignee, Task } from '../types';

const props = defineProps<{
  /** null = crear; una tarea = editarla. */
  task: Task | null;
  actions: TaskFormActions;
  /** Solo el administrador elige responsable; la tarea de un agente queda asignada a él. */
  canAssign: boolean;
  assignees: Assignee[];
}>();
const emit = defineEmits<{ saved: [task: Task, created: boolean] }>();
const open = defineModel<boolean>({ required: true });

const { form, isEdit, dueDateRules, loading, fieldErrors, generalError, reset, submit } =
  useTaskForm(toRef(props, 'task'), props.actions, toRef(props, 'canAssign'));

const assigneeItems = computed(() =>
  props.assignees.map((user) => ({
    value: user.id,
    title: user.fullName,
    subtitle: `@${user.username}`,
  })),
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
    :title="isEdit ? 'Editar tarea' : 'Nueva tarea'"
    :submit-label="isEdit ? 'Guardar cambios' : 'Crear tarea'"
    :loading="loading"
    :general-error="generalError"
    :max-width="560"
    @submit="onSubmit"
  >
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

    <fieldset class="choice-field">
      <legend class="choice-field__legend">Prioridad</legend>
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
      :min="isEdit ? undefined : todayIso()"
      hint="Opcional"
      persistent-hint
      :rules="dueDateRules"
      :error-messages="fieldErrors.dueDate"
    />

    <v-autocomplete
      v-if="canAssign"
      v-model="form.assignedTo"
      label="Responsable"
      :items="assigneeItems"
      item-value="value"
      item-title="title"
      :prepend-inner-icon="mdiAccountOutline"
      :error-messages="fieldErrors.assignedTo"
      placeholder="Sin asignar"
      hint="Solo verá la tarea quien la tenga asignada (y los administradores)"
      persistent-hint
      variant="outlined"
      density="comfortable"
      clearable
      no-data-text="No hay usuarios activos"
    />
    <p v-else-if="!isEdit" class="assign-note text-medium-emphasis">
      La tarea quedará asignada a ti.
    </p>
  </FormDialog>
</template>

<style scoped>
.assign-note {
  font-size: 0.8125rem;
}
</style>
