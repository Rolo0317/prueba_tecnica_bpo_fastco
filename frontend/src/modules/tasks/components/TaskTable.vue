<script setup lang="ts">
import { computed } from 'vue';
import { useDisplay } from 'vuetify';
import { PAGE_SIZE_OPTIONS } from '../constants';
import type { Task, TaskStatus } from '../types';
import { mdiPencilOutline } from '@mdi/js';
import { formatDateTime } from '@/shared/utils/dates';
import { initialsOf } from '@/shared/utils/text';
import TaskDueDate from './TaskDueDate.vue';
import TaskEmptyState from './TaskEmptyState.vue';
import TaskPriorityChip from './TaskPriorityChip.vue';
import TaskStatusChip from './TaskStatusChip.vue';
import TaskStatusMenu from './TaskStatusMenu.vue';

const props = defineProps<{
  tasks: Task[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  filtered: boolean;
  updatingTaskId: number | null;
  transitionsFor: (code: string) => TaskStatus[];
  /** Si el usuario actual puede editar la tarea (administrador o quien la creó). */
  canEdit: (task: Task) => boolean;
}>();

const emit = defineEmits<{
  'update:page': [page: number];
  'update:pageSize': [pageSize: number];
  'change-status': [task: Task, status: string];
  edit: [task: Task];
  create: [];
  'clear-filter': [];
}>();

const ALL_HEADERS = [
  { title: 'Tarea', key: 'title', sortable: false, minWidth: '280px' },
  { title: 'Prioridad', key: 'priority', sortable: false, width: '120px' },
  { title: 'Estado', key: 'status', sortable: false, width: '150px' },
  { title: 'Responsable', key: 'assignedTo', sortable: false, width: '190px' },
  { title: 'Fecha límite', key: 'dueDate', sortable: false, width: '190px' },
  { title: 'Creada', key: 'createdAt', sortable: false, width: '180px' },
  { title: 'Acciones', key: 'actions', sortable: false, align: 'end', width: '210px' },
] as const;

/** En pantallas pequeñas cada fila se apila: se omite la columna secundaria "Creada". */
const { smAndDown } = useDisplay();
const headers = computed(() =>
  smAndDown.value ? ALL_HEADERS.filter((header) => header.key !== 'createdAt') : ALL_HEADERS,
);

const pageSizeOptions = PAGE_SIZE_OPTIONS.map((value) => ({ value, title: String(value) }));

const isFinal = (task: Task) => props.transitionsFor(task.status.code).length === 0;
</script>

<template>
  <v-data-table-server
    class="task-table"
    :headers="headers"
    :items="tasks"
    :items-length="total"
    :page="page"
    :items-per-page="pageSize"
    :items-per-page-options="pageSizeOptions"
    :loading="loading"
    item-value="id"
    mobile-breakpoint="md"
    hover
    @update:page="emit('update:page', $event)"
    @update:items-per-page="emit('update:pageSize', $event)"
  >
    <template #loading>
      <v-skeleton-loader type="table-row@5" />
    </template>

    <template #no-data>
      <TaskEmptyState
        :filtered="filtered"
        @create="emit('create')"
        @clear-filter="emit('clear-filter')"
      />
    </template>

    <template #[`item.title`]="{ item }">
      <div class="task-title">
        <span class="task-title__text">{{ item.title }}</span>
        <span v-if="item.description" class="task-title__description text-medium-emphasis">
          {{ item.description }}
        </span>
      </div>
    </template>

    <template #[`item.priority`]="{ item }">
      <TaskPriorityChip :priority="item.priority" />
    </template>

    <template #[`item.status`]="{ item }">
      <TaskStatusChip :code="item.status.code" :name="item.status.name" />
    </template>

    <template #[`item.assignedTo`]="{ item }">
      <span v-if="item.assignedTo" class="assignee">
        <v-avatar color="secondary" size="26" aria-hidden="true" class="assignee__avatar">
          {{ initialsOf(item.assignedTo.name) }}
        </v-avatar>
        {{ item.assignedTo.name }}
      </span>
      <v-chip v-else size="small" variant="outlined" label>Sin asignar</v-chip>
    </template>

    <template #[`item.dueDate`]="{ item }">
      <TaskDueDate :due-date="item.dueDate" :is-final="isFinal(item)" />
    </template>

    <template #[`item.createdAt`]="{ item }">
      <div class="created">
        <span class="tabular">{{ formatDateTime(item.createdAt) }}</span>
        <span class="text-medium-emphasis">{{ item.createdBy.name }}</span>
      </div>
    </template>

    <template #[`item.actions`]="{ item }">
      <div class="row-actions">
        <v-btn
          v-if="canEdit(item)"
          :icon="mdiPencilOutline"
          variant="text"
          size="small"
          :aria-label="`Editar la tarea ${item.title}`"
          @click="emit('edit', item)"
        />
        <TaskStatusMenu
          :task="item"
          :transitions="transitionsFor(item.status.code)"
          :loading="updatingTaskId === item.id"
          @change="emit('change-status', item, $event)"
        />
      </div>
    </template>
  </v-data-table-server>
</template>

<style scoped>
.assignee {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 0.875rem;
}
.assignee__avatar {
  font-size: 0.7rem;
}
.row-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.task-title {
  display: grid;
  gap: 2px;
  padding-block: 8px;
  max-width: 520px;
}
.task-title__text {
  font-weight: 500;
}
.task-title__description {
  font-size: 0.8125rem;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.created {
  display: grid;
  font-size: 0.8125rem;
}
</style>
