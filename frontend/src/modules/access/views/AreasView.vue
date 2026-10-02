<script setup lang="ts">
import { mdiOfficeBuildingPlusOutline, mdiPencilOutline } from '@mdi/js';
import { onMounted, ref } from 'vue';
import { useNotifier } from '@/shared/composables/useNotifier';
import AreaFormDialog from '../components/AreaFormDialog.vue';
import { useAreas } from '../composables/useAreas';
import type { Area, AreaPayload } from '../types';

const notifier = useNotifier();
const { areas, loading, error, load, create, update } = useAreas(undefined, true);

const formOpen = ref(false);
const selected = ref<Area | null>(null);

const headers = [
  { title: 'Área', key: 'name', sortable: false, minWidth: '220px' },
  { title: 'Personas', key: 'usersCount', sortable: false, align: 'end', width: '120px' },
  {
    title: 'Tareas abiertas',
    key: 'openTasksCount',
    sortable: false,
    align: 'end',
    width: '150px',
  },
  { title: 'Estado', key: 'isActive', sortable: false, width: '120px' },
  { title: 'Acciones', key: 'actions', sortable: false, align: 'end', width: '100px' },
] as const;

onMounted(() => void load());

function openForm(area: Area | null): void {
  selected.value = area;
  formOpen.value = true;
}

const save = (area: Area | null, payload: AreaPayload) =>
  area ? update(area.id, payload) : create(payload);

function onSaved(area: Area, created: boolean): void {
  notifier.success(
    created ? `Área "${area.name}" creada.` : `Cambios en "${area.name}" guardados.`,
  );
}
</script>

<template>
  <section class="admin-page" aria-labelledby="areas-title">
    <header class="page-header">
      <div>
        <h1 id="areas-title" class="page-title">Áreas</h1>
        <p class="text-medium-emphasis">
          Agrupa personas y tareas por equipo. Un supervisor ve y gestiona las tareas de su área.
        </p>
      </div>
      <v-btn
        color="primary"
        variant="flat"
        size="large"
        :prepend-icon="mdiOfficeBuildingPlusOutline"
        @click="openForm(null)"
      >
        Nueva área
      </v-btn>
    </header>

    <v-card>
      <v-alert v-if="error" type="error" variant="tonal" class="ma-4" role="alert">
        <div class="alert-body">
          <span>{{ error.message }}</span>
          <v-btn variant="outlined" size="small" @click="load()">Reintentar</v-btn>
        </div>
      </v-alert>

      <v-data-table
        v-else
        :headers="headers"
        :items="areas"
        :loading="loading"
        item-value="id"
        mobile-breakpoint="md"
        hide-default-footer
        :items-per-page="-1"
        hover
      >
        <template #loading>
          <v-skeleton-loader type="table-row@4" />
        </template>
        <template #no-data>
          <p class="pa-6 text-medium-emphasis">Aún no hay áreas. Crea la primera.</p>
        </template>
        <template #[`item.name`]="{ item }">
          <div class="area-cell">
            <span class="area-cell__name">{{ item.name }}</span>
            <span v-if="item.description" class="text-medium-emphasis">{{ item.description }}</span>
          </div>
        </template>
        <template #[`item.usersCount`]="{ item }">
          <span class="tabular">{{ item.usersCount }}</span>
        </template>
        <template #[`item.openTasksCount`]="{ item }">
          <span class="tabular">{{ item.openTasksCount }}</span>
        </template>
        <template #[`item.isActive`]="{ item }">
          <v-chip :color="item.isActive ? 'success' : 'neutral'" size="small" variant="tonal" label>
            {{ item.isActive ? 'Activa' : 'Inactiva' }}
          </v-chip>
        </template>
        <template #[`item.actions`]="{ item }">
          <v-btn
            :icon="mdiPencilOutline"
            variant="text"
            size="small"
            :aria-label="`Editar el área ${item.name}`"
            @click="openForm(item)"
          />
        </template>
      </v-data-table>
    </v-card>

    <AreaFormDialog v-model="formOpen" :area="selected" :save="save" @saved="onSaved" />
  </section>
</template>

<style scoped>
.admin-page {
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
.area-cell {
  display: grid;
  padding-block: 8px;
  font-size: 0.875rem;
}
.area-cell__name {
  font-weight: 500;
}
.alert-body {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
</style>
