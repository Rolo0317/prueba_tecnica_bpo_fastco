<script setup lang="ts">
import { mdiPlus, mdiRefresh } from '@mdi/js';
import { onMounted, ref } from 'vue';
import { useNotifier } from '@/shared/composables/useNotifier';
import TaskCreateDialog from '../components/TaskCreateDialog.vue';
import TaskStatusFilter from '../components/TaskStatusFilter.vue';
import TaskTable from '../components/TaskTable.vue';
import { useTaskStatuses } from '../composables/useTaskStatuses';
import { useTasks } from '../composables/useTasks';
import type { Task } from '../types';
import { toApiError } from '@/core/http';

const notifier = useNotifier();
const statusCatalog = useTaskStatuses();
const {
  tasks,
  pagination,
  filters,
  loading,
  error,
  updatingTaskId,
  reload,
  setStatus,
  setPage,
  setPageSize,
  create,
  changeStatus,
} = useTasks();

const createOpen = ref(false);

onMounted(() => {
  void statusCatalog.load();
});

function onCreated(task: Task): void {
  notifier.success(`Tarea "${task.title}" creada.`);
}

async function onChangeStatus(task: Task, status: string): Promise<void> {
  try {
    const updated = await changeStatus(task, status);
    notifier.success(`"${updated.title}" pasó a ${updated.status.name}.`);
  } catch (caught) {
    notifier.error(toApiError(caught).message);
    // Puede que otro agente la haya cambiado antes: se recarga para mostrar el estado real.
    void reload();
  }
}
</script>

<template>
  <section class="tasks-page" aria-labelledby="tasks-title">
    <header class="page-header">
      <div>
        <h1 id="tasks-title" class="page-title">Tareas operativas</h1>
        <p class="text-medium-emphasis">
          Gestiona y da seguimiento a las tareas del equipo de back office.
        </p>
      </div>
      <v-btn
        color="primary"
        variant="flat"
        size="large"
        :prepend-icon="mdiPlus"
        @click="createOpen = true"
      >
        Nueva tarea
      </v-btn>
    </header>

    <v-card rounded="lg" class="tasks-card">
      <div class="toolbar">
        <TaskStatusFilter
          :statuses="statusCatalog.statuses.value"
          :model-value="filters.status"
          @update:model-value="setStatus"
        />
        <v-btn
          :icon="mdiRefresh"
          variant="text"
          aria-label="Actualizar listado"
          :loading="loading"
          @click="reload()"
        />
      </div>

      <v-alert v-if="error" type="error" variant="tonal" class="ma-4" role="alert">
        <div class="alert-body">
          <span>{{ error.message }}</span>
          <v-btn variant="outlined" size="small" @click="reload()">Reintentar</v-btn>
        </div>
      </v-alert>

      <TaskTable
        v-else
        :tasks="tasks"
        :total="pagination.total"
        :page="filters.page"
        :page-size="filters.pageSize"
        :loading="loading"
        :filtered="filters.status !== null"
        :updating-task-id="updatingTaskId"
        :transitions-for="statusCatalog.transitionsFor"
        @update:page="setPage"
        @update:page-size="setPageSize"
        @change-status="onChangeStatus"
        @create="createOpen = true"
        @clear-filter="setStatus(null)"
      />
    </v-card>

    <TaskCreateDialog v-model="createOpen" :submit-task="create" @created="onCreated" />
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
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid rgb(var(--v-border-color), var(--v-border-opacity));
}
.alert-body {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
</style>
