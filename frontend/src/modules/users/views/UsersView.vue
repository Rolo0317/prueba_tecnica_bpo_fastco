<script setup lang="ts">
import { mdiAccountPlusOutline } from '@mdi/js';
import { computed, ref } from 'vue';
import { toApiError } from '@/core/http';
import { useAuthStore } from '@/modules/auth/stores/authStore';
import ConfirmDialog from '@/shared/components/ConfirmDialog.vue';
import { useNotifier } from '@/shared/composables/useNotifier';
import ResetPasswordDialog from '../components/ResetPasswordDialog.vue';
import UserFormDialog from '../components/UserFormDialog.vue';
import UsersTable from '../components/UsersTable.vue';
import { useUsers } from '../composables/useUsers';
import type { ManagedUser } from '../types';

const auth = useAuthStore();
const notifier = useNotifier();
const {
  users,
  pagination,
  loading,
  error,
  busyUserId,
  reload,
  setPage,
  setPageSize,
  create,
  update,
  setActive,
  remove,
  resetPassword,
} = useUsers();

const formActions = { create, update };
const currentUserId = computed(() => auth.user?.id ?? null);
const selected = ref<ManagedUser | null>(null);
const formOpen = ref(false);
const resetOpen = ref(false);
const confirmOpen = ref(false);
const deleteOpen = ref(false);

function openForm(user: ManagedUser | null): void {
  selected.value = user;
  formOpen.value = true;
}

function openReset(user: ManagedUser): void {
  selected.value = user;
  resetOpen.value = true;
}

function onSaved(user: ManagedUser, created: boolean): void {
  notifier.success(
    created ? `Usuario "${user.username}" creado.` : `Cambios de "${user.username}" guardados.`,
  );
}

function onPasswordReset(user: ManagedUser): void {
  notifier.success(`Contraseña de "${user.username}" restablecida.`);
}

/** Activar es inmediato; desactivar pide confirmación porque bloquea el acceso. */
async function toggleActive(user: ManagedUser): Promise<void> {
  selected.value = user;
  if (user.isActive) {
    confirmOpen.value = true;
    return;
  }
  await applyActive(user, true);
}

async function applyActive(user: ManagedUser, isActive: boolean): Promise<void> {
  try {
    await setActive(user, isActive);
    notifier.success(`"${user.username}" quedó ${isActive ? 'activo' : 'inactivo'}.`);
  } catch (caught) {
    notifier.error(toApiError(caught).message);
  } finally {
    confirmOpen.value = false;
  }
}

function askDelete(user: ManagedUser): void {
  selected.value = user;
  deleteOpen.value = true;
}

async function confirmDelete(): Promise<void> {
  const user = selected.value;
  if (!user) return;
  try {
    const unassigned = await remove(user);
    const detail =
      unassigned > 0 ? ` ${String(unassigned)} tarea(s) abiertas quedaron sin asignar.` : '';
    notifier.success(`Usuario "${user.username}" eliminado.${detail}`);
  } catch (caught) {
    notifier.error(toApiError(caught).message);
  } finally {
    deleteOpen.value = false;
  }
}

function confirmDeactivate(): void {
  if (selected.value) void applyActive(selected.value, false);
}
</script>

<template>
  <section class="users-page" aria-labelledby="users-title">
    <header class="page-header">
      <div>
        <h1 id="users-title" class="page-title">Usuarios</h1>
        <p class="text-medium-emphasis">
          Crea cuentas, asigna roles y controla el acceso del equipo.
        </p>
      </div>
      <v-btn
        color="primary"
        variant="flat"
        size="large"
        :prepend-icon="mdiAccountPlusOutline"
        @click="openForm(null)"
      >
        Nuevo usuario
      </v-btn>
    </header>

    <v-card>
      <v-alert v-if="error" type="error" variant="tonal" class="ma-4" role="alert">
        <div class="alert-body">
          <span>{{ error.message }}</span>
          <v-btn variant="outlined" size="small" @click="reload()">Reintentar</v-btn>
        </div>
      </v-alert>

      <UsersTable
        v-else
        :users="users"
        :total="pagination.total"
        :page="pagination.page"
        :page-size="pagination.pageSize"
        :loading="loading"
        :busy-user-id="busyUserId"
        :current-user-id="currentUserId"
        @update:page="setPage"
        @update:page-size="setPageSize"
        @edit="openForm"
        @reset-password="openReset"
        @toggle-active="toggleActive"
        @delete="askDelete"
      />
    </v-card>

    <UserFormDialog
      v-model="formOpen"
      :user="selected"
      :current-user-id="currentUserId"
      :actions="formActions"
      @saved="onSaved"
    />

    <ResetPasswordDialog
      v-model="resetOpen"
      :user="selected"
      :reset-password="resetPassword"
      @done="onPasswordReset"
    />

    <ConfirmDialog
      v-model="confirmOpen"
      title="Desactivar usuario"
      :message="`${selected?.fullName ?? ''} no podrá iniciar sesión hasta que lo actives de nuevo.`"
      confirm-text="Desactivar"
      :loading="busyUserId !== null"
      @confirm="confirmDeactivate"
    />

    <ConfirmDialog
      v-model="deleteOpen"
      title="Eliminar usuario"
      :message="`${selected?.fullName ?? ''} ya no podrá iniciar sesión ni recibir tareas. Sus tareas abiertas quedarán sin asignar. Su nombre se conserva en el historial por trazabilidad.`"
      confirm-text="Eliminar"
      :loading="busyUserId !== null"
      @confirm="confirmDelete"
    />
  </section>
</template>

<style scoped>
.users-page {
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
.alert-body {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
</style>
