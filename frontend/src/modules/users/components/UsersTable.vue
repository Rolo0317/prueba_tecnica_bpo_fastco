<script setup lang="ts">
import {
  mdiAccountCheckOutline,
  mdiAccountOffOutline,
  mdiDeleteOutline,
  mdiLockAlertOutline,
  mdiLockReset,
  mdiPencilOutline,
} from '@mdi/js';
import { PAGE_SIZE_OPTIONS } from '@/shared/types/pagination';
import { formatDateTime } from '@/shared/utils/dates';
import { initialsOf } from '@/shared/utils/text';
import type { ManagedUser } from '../types';
import UserRoleChip from './UserRoleChip.vue';

defineProps<{
  users: ManagedUser[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  busyUserId: number | null;
  currentUserId: number | null;
  /** Hay búsqueda o filtros activos (cambia el mensaje cuando no hay resultados). */
  filtered?: boolean;
}>();

const emit = defineEmits<{
  'update:page': [page: number];
  'update:pageSize': [pageSize: number];
  edit: [user: ManagedUser];
  'reset-password': [user: ManagedUser];
  'toggle-active': [user: ManagedUser];
  delete: [user: ManagedUser];
}>();

const headers = [
  { title: 'Usuario', key: 'fullName', sortable: false, minWidth: '240px' },
  { title: 'Rol', key: 'role', sortable: false, width: '170px' },
  { title: 'Área', key: 'area', sortable: false, width: '170px' },
  { title: 'Estado', key: 'isActive', sortable: false, width: '120px' },
  { title: 'Contraseña', key: 'passwordChangedAt', sortable: false, width: '210px' },
  { title: 'Acciones', key: 'actions', sortable: false, align: 'end', width: '200px' },
] as const;

const pageSizeOptions = PAGE_SIZE_OPTIONS.map((value) => ({ value, title: String(value) }));
</script>

<template>
  <v-data-table-server
    class="users-table"
    :headers="headers"
    :items="users"
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
      <v-skeleton-loader type="table-row@4" />
    </template>

    <template #no-data>
      <p class="pa-6 text-medium-emphasis">
        {{
          filtered
            ? 'Ningún usuario coincide con la búsqueda o los filtros.'
            : 'Aún no hay usuarios.'
        }}
      </p>
    </template>

    <template #[`item.fullName`]="{ item }">
      <div class="user-cell">
        <v-avatar :color="item.isActive ? 'secondary' : 'neutral'" size="36" aria-hidden="true">
          {{ initialsOf(item.fullName) }}
        </v-avatar>
        <div class="user-cell__text">
          <span class="user-cell__name">
            {{ item.fullName }}
            <span v-if="item.id === currentUserId" class="text-medium-emphasis">(tú)</span>
          </span>
          <span class="text-medium-emphasis">
            @{{ item.username }}
            <template v-if="item.email">· {{ item.email }}</template>
          </span>
          <v-chip
            v-if="item.passwordResetRequestedAt"
            :prepend-icon="mdiLockAlertOutline"
            color="warning"
            size="x-small"
            variant="tonal"
            label
            class="user-cell__reset"
          >
            Pidió restablecer su contraseña · {{ formatDateTime(item.passwordResetRequestedAt) }}
          </v-chip>
        </div>
      </div>
    </template>

    <template #[`item.role`]="{ item }">
      <UserRoleChip :role="item.role" />
    </template>

    <template #[`item.area`]="{ item }">
      <span v-if="item.area">{{ item.area.name }}</span>
      <span v-else class="text-medium-emphasis">Sin área</span>
    </template>

    <template #[`item.isActive`]="{ item }">
      <v-chip
        :color="item.isActive ? 'success' : 'neutral'"
        :prepend-icon="item.isActive ? mdiAccountCheckOutline : mdiAccountOffOutline"
        size="small"
        variant="tonal"
        label
      >
        {{ item.isActive ? 'Activo' : 'Inactivo' }}
      </v-chip>
    </template>

    <template #[`item.passwordChangedAt`]="{ item }">
      <span v-if="item.passwordChangedAt" class="tabular">
        Cambiada {{ formatDateTime(item.passwordChangedAt) }}
      </span>
      <span v-else class="text-medium-emphasis">Inicial (sin cambios)</span>
    </template>

    <template #[`item.actions`]="{ item }">
      <div class="row-actions">
        <v-btn
          :icon="mdiPencilOutline"
          variant="text"
          size="small"
          :aria-label="`Editar a ${item.fullName}`"
          @click="emit('edit', item)"
        />
        <v-btn
          :icon="mdiLockReset"
          variant="text"
          size="small"
          :aria-label="`Restablecer la contraseña de ${item.fullName}`"
          @click="emit('reset-password', item)"
        />
        <v-btn
          :icon="item.isActive ? mdiAccountOffOutline : mdiAccountCheckOutline"
          :color="item.isActive ? 'error' : 'success'"
          variant="text"
          size="small"
          :loading="busyUserId === item.id"
          :disabled="item.id === currentUserId"
          :aria-label="`${item.isActive ? 'Desactivar' : 'Activar'} a ${item.fullName}`"
          @click="emit('toggle-active', item)"
        />
        <v-btn
          :icon="mdiDeleteOutline"
          color="error"
          variant="text"
          size="small"
          :disabled="item.id === currentUserId"
          :aria-label="`Eliminar a ${item.fullName}`"
          @click="emit('delete', item)"
        />
      </div>
    </template>
  </v-data-table-server>
</template>

<style scoped>
.user-cell {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-block: 8px;
}
.user-cell__reset {
  justify-self: start;
  margin-top: 4px;
}
.user-cell__text {
  display: grid;
  font-size: 0.875rem;
}
.user-cell__name {
  font-weight: 500;
}
.row-actions {
  display: inline-flex;
  gap: 4px;
}
</style>
