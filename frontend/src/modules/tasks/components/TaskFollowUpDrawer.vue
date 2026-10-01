<script setup lang="ts">
import { mdiAccountOutline, mdiCalendarOutline, mdiClose, mdiSendOutline } from '@mdi/js';
import { computed, ref, watch } from 'vue';
import { useDisplay } from 'vuetify';
import { useNotifier } from '@/shared/composables/useNotifier';
import { dueRelative, dueState } from '@/shared/utils/dates';
import { useTaskTimeline } from '../composables/useTaskTimeline';
import type { Task, TaskNote } from '../types';
import TaskPriorityChip from './TaskPriorityChip.vue';
import TaskStatusChip from './TaskStatusChip.vue';
import TaskTimeline from './TaskTimeline.vue';

const NOTE_LIMIT = 1000;

const props = defineProps<{ task: Task | null; isFinal: boolean }>();
const emit = defineEmits<{ 'note-added': [task: Task, note: TaskNote] }>();
const open = defineModel<boolean>({ required: true });

const { smAndDown } = useDisplay();
const notifier = useNotifier();
const { events, loading, error, saving, noteError, load, addNote } = useTaskTimeline();
const draft = ref('');

const dueLabel = computed(() => dueRelative(props.task?.dueDate ?? null));
const dueColor = computed(() => {
  if (props.isFinal) return undefined;
  const state = dueState(props.task?.dueDate ?? null);
  return state === 'overdue' ? 'error' : state === 'today' ? 'warning' : undefined;
});
const canSend = computed(() => draft.value.trim().length > 0 && !saving.value);

watch(
  () => (open.value ? props.task?.id : undefined),
  (taskId) => {
    if (taskId === undefined) return;
    draft.value = '';
    void load(taskId);
  },
  { immediate: true },
);

async function submitNote(): Promise<void> {
  const task = props.task;
  if (!task || !canSend.value) return;
  const note = await addNote(draft.value.trim());
  if (note) {
    draft.value = '';
    notifier.success('Avance registrado.');
    emit('note-added', task, note);
  }
}
</script>

<template>
  <v-navigation-drawer
    v-model="open"
    location="end"
    temporary
    :width="smAndDown ? undefined : 480"
    :class="{ 'followup--mobile': smAndDown }"
    aria-labelledby="followup-title"
  >
    <section v-if="task" class="followup">
      <header class="followup__header">
        <div>
          <p class="followup__eyebrow">Seguimiento</p>
          <h2 id="followup-title" class="followup__title">{{ task.title }}</h2>
        </div>
        <v-btn
          :icon="mdiClose"
          variant="text"
          size="small"
          aria-label="Cerrar seguimiento"
          @click="open = false"
        />
      </header>

      <div class="followup__meta">
        <TaskStatusChip :code="task.status.code" :name="task.status.name" />
        <TaskPriorityChip :priority="task.priority" />
      </div>

      <dl class="followup__facts">
        <div>
          <dt>
            <v-icon :icon="mdiAccountOutline" size="16" aria-hidden="true" />
            Responsable
          </dt>
          <dd>{{ task.assignedTo?.name ?? 'Sin asignar' }}</dd>
        </div>
        <div>
          <dt>
            <v-icon :icon="mdiCalendarOutline" size="16" aria-hidden="true" />
            Fecha límite
          </dt>
          <dd :class="dueColor && `text-${dueColor}`">{{ dueLabel }}</dd>
        </div>
      </dl>

      <p v-if="task.description" class="followup__description">{{ task.description }}</p>

      <form class="followup__form" @submit.prevent="submitNote">
        <v-textarea
          v-model="draft"
          label="Nuevo avance"
          placeholder="¿Qué se hizo? Ej.: Llamé al cliente, confirma pago mañana."
          :counter="NOTE_LIMIT"
          :maxlength="NOTE_LIMIT"
          :error-messages="noteError?.message"
          rows="2"
          auto-grow
          hide-details="auto"
        />
        <v-btn
          type="submit"
          color="primary"
          :prepend-icon="mdiSendOutline"
          :loading="saving"
          :disabled="!canSend"
        >
          Agregar avance
        </v-btn>
      </form>

      <v-divider class="my-4" />

      <v-alert v-if="error" type="error" variant="tonal" density="compact" role="alert">
        <div class="followup__error">
          <span>{{ error.message }}</span>
          <v-btn size="small" variant="text" @click="load(task.id)">Reintentar</v-btn>
        </div>
      </v-alert>
      <v-skeleton-loader v-else-if="loading" type="list-item-avatar-two-line@3" />
      <TaskTimeline v-else :events="events" />
    </section>
  </v-navigation-drawer>
</template>

<style scoped>
.followup {
  display: grid;
  gap: 14px;
  padding: 20px;
}
.followup__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}
.followup__eyebrow {
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgb(var(--v-theme-secondary));
}
.followup__title {
  font-size: 1.2rem;
  font-weight: 600;
  line-height: 1.3;
  overflow-wrap: anywhere;
}
.followup__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}
.followup__facts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin: 0;
}
.followup__facts dt {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.75rem;
  color: rgb(var(--v-theme-on-surface), 0.7);
}
.followup__facts dd {
  margin: 2px 0 0;
  font-weight: 500;
}
.followup__description {
  font-size: 0.875rem;
  white-space: pre-line;
  overflow-wrap: anywhere;
}
.followup__form {
  display: grid;
  gap: 8px;
  justify-items: end;
}
.followup__form :deep(.v-input) {
  width: 100%;
}
.followup__error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.followup--mobile {
  width: 100% !important;
}
</style>
