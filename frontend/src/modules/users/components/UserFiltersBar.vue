<script setup lang="ts">
import { mdiFilterRemoveOutline, mdiLockAlertOutline, mdiMagnify } from '@mdi/js';
import { computed } from 'vue';
import type { Area, Role } from '@/modules/access/types';
import type { UserStatusFilter } from '../types';

const props = defineProps<{ roles: Role[]; areas: Area[]; hasFilters: boolean }>();
const emit = defineEmits<{ clear: [] }>();

const search = defineModel<string>('search', { required: true });
const roleId = defineModel<number | null>('roleId', { required: true });
const areaId = defineModel<number | null>('areaId', { required: true });
const status = defineModel<UserStatusFilter | null>('status', { required: true });
const pendingReset = defineModel<boolean>('pendingReset', { required: true });

const roleItems = computed(() => props.roles.map((role) => ({ value: role.id, title: role.name })));
const areaItems = computed(() => props.areas.map((area) => ({ value: area.id, title: area.name })));
const statusItems = [
  { value: 'ACTIVE', title: 'Activos' },
  { value: 'INACTIVE', title: 'Inactivos' },
];
</script>

<template>
  <div class="user-filters" role="search" aria-label="Buscar y filtrar usuarios">
    <v-text-field
      v-model="search"
      :prepend-inner-icon="mdiMagnify"
      label="Buscar por nombre, usuario o correo"
      density="compact"
      variant="outlined"
      hide-details
      clearable
      class="user-filters__search"
      @click:clear="search = ''"
    />
    <v-select
      v-model="roleId"
      :items="roleItems"
      label="Rol"
      placeholder="Todos"
      persistent-placeholder
      density="compact"
      variant="outlined"
      hide-details
      clearable
    />
    <v-select
      v-model="areaId"
      :items="areaItems"
      label="Área"
      placeholder="Todas"
      persistent-placeholder
      density="compact"
      variant="outlined"
      hide-details
      clearable
    />
    <v-select
      v-model="status"
      :items="statusItems"
      label="Estado"
      placeholder="Todos"
      persistent-placeholder
      density="compact"
      variant="outlined"
      hide-details
      clearable
    />
    <v-chip
      :prepend-icon="mdiLockAlertOutline"
      :color="pendingReset ? 'warning' : undefined"
      :variant="pendingReset ? 'flat' : 'outlined'"
      :aria-pressed="pendingReset"
      filter
      @click="pendingReset = !pendingReset"
    >
      Solicitudes de contraseña
    </v-chip>
    <v-btn
      v-if="hasFilters"
      :prepend-icon="mdiFilterRemoveOutline"
      variant="text"
      size="small"
      @click="emit('clear')"
    >
      Limpiar filtros
    </v-btn>
  </div>
</template>

<style scoped>
.user-filters {
  display: grid;
  grid-template-columns: minmax(240px, 2fr) repeat(3, minmax(140px, 1fr)) auto auto;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid rgb(var(--v-border-color), var(--v-border-opacity));
}
@media (max-width: 1099px) {
  .user-filters {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .user-filters__search {
    grid-column: 1 / -1;
  }
}
@media (max-width: 599px) {
  .user-filters {
    grid-template-columns: 1fr;
  }
}
</style>
