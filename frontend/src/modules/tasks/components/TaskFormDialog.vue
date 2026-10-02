<script setup lang="ts">
import { mdiAccountOutline, mdiOfficeBuildingOutline } from '@mdi/js';
import { computed, toRef, watch } from 'vue';
import FormDialog from '@/shared/components/FormDialog.vue';
import { todayIso } from '@/shared/utils/dates';
import { PRIORITY_OPTIONS, PRIORITY_VISUALS, TASK_LIMITS } from '../constants';
import type { Area, NamedRef } from '@/modules/access/types';
import {
  taskFormRules,
  useTaskForm,
  type TaskFormAbilities,
  type TaskFormActions,
} from '../composables/useTaskForm';
import type { Assignee, Task } from '../types';

const props = defineProps<{
  /** null = crear; una tarea = editarla. */
  task: Task | null;
  actions: TaskFormActions;
  /** Según los permisos: elegir responsable (TASKS_ASSIGN) y área (TASKS_VIEW_ALL). */
  abilities: TaskFormAbilities;
  assignees: Assignee[];
  areas: Area[];
  /** Área de quien crea: ahí queda la tarea si no puede elegir otra. */
  userArea: NamedRef | null;
}>();
const emit = defineEmits<{ saved: [task: Task, created: boolean] }>();
const open = defineModel<boolean>({ required: true });

const { form, isEdit, dueDateRules, loading, fieldErrors, generalError, reset, submit } =
  useTaskForm(toRef(props, 'task'), props.actions, toRef(props, 'abilities'));

const assigneeItems = computed(() =>
  props.assignees.map((user) => ({
    value: user.id,
    title: user.fullName,
    subtitle: user.area ? `@${user.username} · ${user.area.name}` : `@${user.username}`,
  })),
);

const selectedPriority = computed(() => PRIORITY_VISUALS[form.priority]);

const areaItems = computed(() => props.areas.map((area) => ({ value: area.id, title: area.name })));

/** Qué se le explica a quien no elige responsable o área. */
const fixedNote = computed(() => {
  if (isEdit.value) return null;
  const area = props.abilities.chooseArea ? null : props.userArea?.name;
  if (!props.abilities.assign) {
    return area
      ? `La tarea quedará asignada a ti, en el área ${area}.`
      : 'La tarea quedará asignada a ti.';
  }
  return area ? `La tarea quedará en tu área: ${area}.` : null;
});

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
      <!-- Semáforo: rojo = alta, ámbar = media, verde = baja (con ícono y texto, no solo color). -->
      <div class="semaphore" role="radiogroup" aria-label="Prioridad">
        <v-btn
          v-for="option in PRIORITY_OPTIONS"
          :key="option.value"
          role="radio"
          :aria-checked="form.priority === option.value"
          :color="option.color"
          :variant="form.priority === option.value ? 'flat' : 'outlined'"
          :prepend-icon="option.icon"
          class="semaphore__option"
          @click="form.priority = option.value"
        >
          <span class="semaphore__light" :class="`bg-${option.color}`" aria-hidden="true" />
          {{ option.label }}
        </v-btn>
      </div>
      <p class="semaphore__hint text-medium-emphasis">{{ selectedPriority.hint }}</p>
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
      v-if="abilities.chooseArea"
      v-model="form.areaId"
      label="Área"
      :items="areaItems"
      item-value="value"
      item-title="title"
      :prepend-inner-icon="mdiOfficeBuildingOutline"
      :error-messages="fieldErrors.areaId"
      placeholder="Sin área"
      hint="Quien supervise el área verá y gestionará la tarea"
      persistent-hint
      variant="outlined"
      density="comfortable"
      clearable
      no-data-text="No hay áreas activas"
    />

    <v-autocomplete
      v-if="abilities.assign"
      v-model="form.assignedTo"
      label="Responsable"
      :items="assigneeItems"
      item-value="value"
      item-title="title"
      :prepend-inner-icon="mdiAccountOutline"
      :error-messages="fieldErrors.assignedTo"
      placeholder="Sin asignar"
      hint="La verán quien la tenga asignada, quien la creó y quien supervise su área"
      persistent-hint
      variant="outlined"
      density="comfortable"
      clearable
      no-data-text="No hay usuarios activos"
    />
    <p v-if="fixedNote" class="assign-note text-medium-emphasis">{{ fixedNote }}</p>
  </FormDialog>
</template>

<style scoped>
.semaphore {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.semaphore__option {
  height: 44px !important;
  font-weight: 600;
  letter-spacing: 0;
}
.semaphore__light {
  width: 12px;
  height: 12px;
  margin-inline-end: 8px;
  border-radius: 50%;
  box-shadow: 0 0 0 2px rgb(var(--v-theme-surface));
}
.semaphore__hint {
  font-size: 0.75rem;
  margin-top: 6px;
}
.assign-note {
  font-size: 0.8125rem;
}
</style>
