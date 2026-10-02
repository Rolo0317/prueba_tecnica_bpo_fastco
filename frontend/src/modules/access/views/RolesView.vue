<script setup lang="ts">
import { mdiDeleteOutline, mdiLockOutline, mdiPencilOutline, mdiShieldPlusOutline } from '@mdi/js';
import { onMounted, ref } from 'vue';
import { toApiError } from '@/core/http';
import { useAuthStore } from '@/modules/auth/stores/authStore';
import ConfirmDialog from '@/shared/components/ConfirmDialog.vue';
import { useNotifier } from '@/shared/composables/useNotifier';
import RoleFormDialog from '../components/RoleFormDialog.vue';
import { useRoles } from '../composables/useRoles';
import type { Role, RolePayload } from '../types';

const auth = useAuthStore();
const notifier = useNotifier();
const { roles, permissionGroups, permissionName, loading, error, load, create, update, remove } =
  useRoles();

const formOpen = ref(false);
const deleteOpen = ref(false);
const deleting = ref(false);
const selected = ref<Role | null>(null);

onMounted(() => void load());

/** Estas reglas solo deciden qué se muestra; la API las vuelve a validar. */
const isOwnRole = (role: Role) => auth.user?.role.id === role.id;
const canEdit = (role: Role) => !role.isLocked && !isOwnRole(role);
const canDelete = (role: Role) => role.code === null && role.usersCount === 0;
const lockReason = (role: Role) =>
  role.isLocked
    ? 'Rol protegido: siempre tiene todos los permisos.'
    : isOwnRole(role)
      ? 'Es tu rol: otra persona con permisos debe modificarlo.'
      : null;

function openForm(role: Role | null): void {
  selected.value = role;
  formOpen.value = true;
}

const save = (role: Role | null, payload: RolePayload) =>
  role ? update(role.id, payload) : create(payload);

function onSaved(role: Role, created: boolean): void {
  notifier.success(created ? `Rol "${role.name}" creado.` : `Cambios en "${role.name}" guardados.`);
}

function askDelete(role: Role): void {
  selected.value = role;
  deleteOpen.value = true;
}

async function confirmDelete(): Promise<void> {
  const role = selected.value;
  if (!role) return;
  deleting.value = true;
  try {
    await remove(role);
    notifier.success(`Rol "${role.name}" eliminado.`);
  } catch (caught) {
    notifier.error(toApiError(caught).message);
  } finally {
    deleting.value = false;
    deleteOpen.value = false;
  }
}
</script>

<template>
  <section class="admin-page" aria-labelledby="roles-title">
    <header class="page-header">
      <div>
        <h1 id="roles-title" class="page-title">Roles y permisos</h1>
        <p class="text-medium-emphasis">
          Define qué puede hacer cada rol. Los cambios aplican de inmediato a sus usuarios.
        </p>
      </div>
      <v-btn
        color="primary"
        variant="flat"
        size="large"
        :prepend-icon="mdiShieldPlusOutline"
        @click="openForm(null)"
      >
        Nuevo rol
      </v-btn>
    </header>

    <v-alert v-if="error" type="error" variant="tonal" role="alert">
      <div class="alert-body">
        <span>{{ error.message }}</span>
        <v-btn variant="outlined" size="small" @click="load()">Reintentar</v-btn>
      </div>
    </v-alert>

    <div v-else-if="loading && roles.length === 0" class="role-grid" aria-busy="true">
      <v-skeleton-loader v-for="n in 3" :key="n" type="article" />
    </div>

    <ul v-else class="role-grid" aria-label="Roles">
      <li v-for="role in roles" :key="role.id">
        <v-card class="role-card" variant="outlined">
          <div class="role-card__header">
            <div>
              <h2 class="role-card__name">
                {{ role.name }}
                <v-icon
                  v-if="role.isLocked"
                  :icon="mdiLockOutline"
                  size="16"
                  aria-label="Rol protegido"
                />
              </h2>
              <p class="text-medium-emphasis role-card__meta">
                {{ role.usersCount }} {{ role.usersCount === 1 ? 'persona' : 'personas' }}
                <template v-if="role.code !== null">· Rol del sistema</template>
              </p>
            </div>
            <div class="role-card__actions">
              <v-btn
                :icon="mdiPencilOutline"
                variant="text"
                size="small"
                :disabled="!canEdit(role)"
                :aria-label="`Editar el rol ${role.name}`"
                @click="openForm(role)"
              />
              <v-btn
                v-if="role.code === null"
                :icon="mdiDeleteOutline"
                color="error"
                variant="text"
                size="small"
                :disabled="!canDelete(role)"
                :aria-label="
                  canDelete(role)
                    ? `Eliminar el rol ${role.name}`
                    : `No se puede eliminar ${role.name}: tiene personas asignadas`
                "
                @click="askDelete(role)"
              />
            </div>
          </div>
          <p v-if="role.description" class="role-card__description">{{ role.description }}</p>
          <p v-if="lockReason(role)" class="role-card__lock text-medium-emphasis">
            {{ lockReason(role) }}
          </p>
          <div class="role-card__permissions">
            <v-chip
              v-for="code in role.permissions"
              :key="code"
              size="small"
              variant="tonal"
              color="primary"
              label
            >
              {{ permissionName(code) }}
            </v-chip>
            <span v-if="role.permissions.length === 0" class="text-medium-emphasis">
              Sin permisos adicionales.
            </span>
          </div>
        </v-card>
      </li>
    </ul>

    <RoleFormDialog
      v-model="formOpen"
      :role="selected"
      :groups="permissionGroups"
      :grantable="auth.can"
      :save="save"
      @saved="onSaved"
    />

    <ConfirmDialog
      v-model="deleteOpen"
      title="Eliminar rol"
      :message="`El rol ${selected?.name ?? ''} se eliminará. Esta acción no se puede deshacer.`"
      confirm-text="Eliminar"
      :loading="deleting"
      @confirm="confirmDelete"
    />
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
.role-grid {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr));
}
.role-card {
  height: 100%;
  padding: 16px 16px 20px;
  display: grid;
  align-content: start;
  gap: 10px;
}
.role-card__header {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.role-card__name {
  font-size: 1.125rem;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.role-card__meta,
.role-card__lock {
  font-size: 0.8125rem;
}
.role-card__description {
  font-size: 0.875rem;
}
.role-card__actions {
  display: inline-flex;
  gap: 2px;
}
.role-card__permissions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 0.8125rem;
}
.alert-body {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
</style>
