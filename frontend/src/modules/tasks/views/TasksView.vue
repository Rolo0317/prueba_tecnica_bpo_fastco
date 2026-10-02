<script setup lang="ts">
import { mdiPlus, mdiRefresh } from '@mdi/js';
import { mdiOfficeBuildingOutline } from '@mdi/js';
import { computed, onMounted, ref } from 'vue';
import { toApiError } from '@/core/http';
import { useAreas } from '@/modules/access/composables/useAreas';
import { useAuthStore } from '@/modules/auth/stores/authStore';
import { useNotifier } from '@/shared/composables/useNotifier';
import TaskFollowUpDrawer from '../components/TaskFollowUpDrawer.vue';
import TaskFormDialog from '../components/TaskFormDialog.vue';
import TaskStatsPanel from '../components/TaskStatsPanel.vue';
import TaskStatusFilter from '../components/TaskStatusFilter.vue';
import TaskTable from '../components/TaskTable.vue';
import { useAssignees } from '../composables/useAssignees';
import { useTaskStats } from '../composables/useTaskStats';
import { useTaskStatuses } from '../composables/useTaskStatuses';
import { useTasks } from '../composables/useTasks';
import type { Task } from '../types';

const auth = useAuthStore();
const notifier = useNotifier();
const statusCatalog = useTaskStatuses();
const assigneeCatalog = useAssignees();
const areaCatalog = useAreas();
const {
  tasks,
  pagination,
  filters,
  loading,
  error,
  updatingTaskId,
  reload,
  setStatus,
  setArea,
  clearFilters: clearTaskFilters,
  setPage,
  setPageSize,
  create,
  update,
  changeStatus,
  replaceTask,
} = useTasks();
const taskStats = useTaskStats(undefined, () => filters.value.areaId);

const formOpen = ref(false);
const editing = ref<Task | null>(null);
const formActions = { create, update };

/** Seguimiento: se guarda el id y se lee la versión más reciente de la tarea en la lista. */
const followUpOpen = ref(false);
const followUpSnapshot = ref<Task | null>(null);
const followUpTask = computed(
  () => tasks.value.find((t) => t.id === followUpSnapshot.value?.id) ?? followUpSnapshot.value,
);
const followUpIsFinal = computed(() =>
  followUpTask.value
    ? statusCatalog.transitionsFor(followUpTask.value.status.code).length === 0
    : false,
);

/** Estas reglas solo deciden qué se muestra; la API y la BD las vuelven a validar. */
const formAbilities = computed(() => ({
  assign: auth.can('TASKS_ASSIGN'),
  chooseArea: auth.can('TASKS_VIEW_ALL'),
}));
const canEdit = (task: Task) => auth.can('TASKS_EDIT_ANY') || task.createdBy.id === auth.user?.id;
const subtitle = computed(() => {
  if (auth.can('TASKS_VIEW_ALL'))
    return 'Gestiona, asigna y da seguimiento a las tareas de todas las áreas.';
  const area = auth.user?.area?.name;
  if (auth.can('TASKS_VIEW_AREA') && area)
    return `Las tareas del área ${area}, además de las tuyas.`;
  return 'Tus tareas: las que tienes asignadas y las que creaste.';
});

/** El filtro por área tiene sentido para quien ve más de un área. */
const showAreaFilter = computed(() => auth.can('TASKS_VIEW_ALL'));
const areaFilterItems = computed(() =>
  areaCatalog.areas.value.map((area) => ({ value: area.id, title: area.name })),
);

onMounted(() => {
  void statusCatalog.load();
  void taskStats.load();
  void areaCatalog.load();
  if (formAbilities.value.assign) void assigneeCatalog.load();
});

function onAreaFilter(areaId: number | null): void {
  void setArea(areaId).then(() => taskStats.load());
}

function openForm(task: Task | null): void {
  editing.value = task;
  formOpen.value = true;
}

function openFollowUp(task: Task): void {
  followUpSnapshot.value = task;
  followUpOpen.value = true;
}

/** El contador de avances de la fila se actualiza sin recargar el listado. */
function onNoteAdded(task: Task): void {
  const current = tasks.value.find((t) => t.id === task.id) ?? task;
  replaceTask({ ...current, notesCount: current.notesCount + 1 });
}

/** Listado e indicadores se actualizan juntos para que nunca muestren datos distintos. */
function clearFilters(): void {
  void clearTaskFilters().then(() => taskStats.load());
}

function refreshAll(): void {
  void reload();
  void taskStats.load();
}

function onSaved(task: Task, created: boolean): void {
  notifier.success(
    created ? `Tarea "${task.title}" creada.` : `Cambios en "${task.title}" guardados.`,
  );
  void taskStats.load();
}

async function onChangeStatus(task: Task, status: string): Promise<void> {
  try {
    const updated = await changeStatus(task, status);
    notifier.success(`"${updated.title}" pasó a ${updated.status.name}.`);
    void taskStats.load();
  } catch (caught) {
    notifier.error(toApiError(caught).message);
    // Puede que otra persona la haya cambiado antes: se recarga para mostrar el estado real.
    refreshAll();
  }
}
</script>

<template>
  <section class="tasks-page" aria-labelledby="tasks-title">
    <header class="page-header">
      <div>
        <h1 id="tasks-title" class="page-title">Tareas operativas</h1>
        <p class="text-medium-emphasis">{{ subtitle }}</p>
      </div>
      <v-btn
        color="primary"
        variant="flat"
        size="large"
        :prepend-icon="mdiPlus"
        @click="openForm(null)"
      >
        Nueva tarea
      </v-btn>
    </header>

    <TaskStatsPanel
      :stats="taskStats.stats.value"
      :loading="taskStats.loading.value"
      :error-message="taskStats.error.value?.message ?? null"
      :active-status="filters.status"
      @select="setStatus"
      @retry="taskStats.load()"
    />

    <v-card rounded="lg" class="tasks-card">
      <div class="toolbar">
        <TaskStatusFilter
          :statuses="statusCatalog.statuses.value"
          :model-value="filters.status"
          @update:model-value="setStatus"
        />
        <v-select
          v-if="showAreaFilter"
          :model-value="filters.areaId"
          :items="areaFilterItems"
          item-value="value"
          item-title="title"
          label="Área"
          placeholder="Todas las áreas"
          persistent-placeholder
          :prepend-inner-icon="mdiOfficeBuildingOutline"
          density="compact"
          variant="outlined"
          hide-details
          clearable
          class="area-filter"
          @update:model-value="onAreaFilter"
        />
        <v-btn
          :icon="mdiRefresh"
          variant="text"
          aria-label="Actualizar listado e indicadores"
          :loading="loading"
          @click="refreshAll()"
        />
      </div>

      <v-alert v-if="error" type="error" variant="tonal" class="ma-4" role="alert">
        <div class="alert-body">
          <span>{{ error.message }}</span>
          <v-btn variant="outlined" size="small" @click="refreshAll()">Reintentar</v-btn>
        </div>
      </v-alert>

      <TaskTable
        v-else
        :tasks="tasks"
        :total="pagination.total"
        :page="filters.page"
        :page-size="filters.pageSize"
        :loading="loading"
        :filtered="filters.status !== null || filters.areaId !== null"
        :updating-task-id="updatingTaskId"
        :transitions-for="statusCatalog.transitionsFor"
        :can-edit="canEdit"
        @update:page="setPage"
        @update:page-size="setPageSize"
        @change-status="onChangeStatus"
        @edit="openForm"
        @open="openFollowUp"
        @create="openForm(null)"
        @clear-filter="clearFilters"
      />
    </v-card>

    <TaskFormDialog
      v-model="formOpen"
      :task="editing"
      :actions="formActions"
      :abilities="formAbilities"
      :assignees="assigneeCatalog.assignees.value"
      :areas="areaCatalog.areas.value"
      :user-area="auth.user?.area ?? null"
      @saved="onSaved"
    />

    <TaskFollowUpDrawer
      v-model="followUpOpen"
      :task="followUpTask"
      :is-final="followUpIsFinal"
      @note-added="onNoteAdded"
    />
  </section>
</template>

<style scoped>
.tasks-page {
  display: grid;
  gap: 20px;
}
.page-header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
}
.page-title {
  font-size: 1.75rem;
  font-weight: 600;
  line-height: 1.2;
  color: rgb(var(--v-theme-secondary));
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid rgb(var(--v-border-color), var(--v-border-opacity));
}
.area-filter {
  flex: 0 1 240px;
  min-width: 180px;
  margin-inline-start: auto;
}
.alert-body {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
</style>
