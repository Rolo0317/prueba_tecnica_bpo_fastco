<script setup lang="ts">
import {
  mdiAccountGroupOutline,
  mdiChevronDown,
  mdiClipboardTextOutline,
  mdiLockOutline,
  mdiLogout,
  mdiOfficeBuildingOutline,
  mdiShieldKeyOutline,
} from '@mdi/js';
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import ChangePasswordDialog from '@/modules/auth/components/ChangePasswordDialog.vue';
import { useAuthStore } from '@/modules/auth/stores/authStore';
import BrandMark from '@/shared/components/BrandMark.vue';
import ThemeToggle from '@/shared/components/ThemeToggle.vue';
import { initialsOf } from '@/shared/utils/text';

const auth = useAuthStore();
const router = useRouter();
const changePasswordOpen = ref(false);

/** Cada sección aparece solo si el rol del usuario tiene el permiso (la API también lo exige). */
const NAV_ITEMS = [
  { title: 'Tareas', icon: mdiClipboardTextOutline, name: 'tasks', permission: null },
  { title: 'Usuarios', icon: mdiAccountGroupOutline, name: 'users', permission: 'USERS_MANAGE' },
  { title: 'Áreas', icon: mdiOfficeBuildingOutline, name: 'areas', permission: 'AREAS_MANAGE' },
  { title: 'Roles', icon: mdiShieldKeyOutline, name: 'roles', permission: 'ROLES_MANAGE' },
] as const;

const navItems = computed(() =>
  NAV_ITEMS.filter((item) => item.permission === null || auth.can(item.permission)),
);

const initials = computed(() => initialsOf(auth.user?.fullName ?? ''));
const roleLabel = computed(() => {
  const user = auth.user;
  if (!user) return '';
  return user.area ? `${user.role.name} · ${user.area.name}` : user.role.name;
});

onMounted(() => void auth.refreshUser());

async function logout(): Promise<void> {
  auth.logout();
  await router.replace({ name: 'login' });
}
</script>

<template>
  <a class="skip-link" href="#main-content">Saltar al contenido principal</a>

  <v-app-bar flat border="b" density="comfortable" color="surface">
    <div class="app-bar">
      <div class="app-brand">
        <BrandMark :size="34" />
        <span class="app-brand__name">Gestor de Tareas Operativas</span>
      </div>

      <nav class="app-nav" aria-label="Secciones">
        <v-btn
          v-for="item in navItems"
          :key="item.name"
          :to="{ name: item.name }"
          :prepend-icon="item.icon"
          :aria-label="item.title"
          variant="text"
          active-color="primary"
          class="app-nav__item"
        >
          <span class="app-nav__label">{{ item.title }}</span>
        </v-btn>
      </nav>

      <ThemeToggle />

      <v-menu location="bottom end">
        <template #activator="{ props: menuProps }">
          <v-btn
            v-bind="menuProps"
            variant="text"
            class="app-user"
            :append-icon="mdiChevronDown"
            :aria-label="`Menú de ${auth.user?.fullName ?? 'usuario'}`"
          >
            <v-avatar color="secondary" size="32" aria-hidden="true">{{ initials }}</v-avatar>
            <span class="app-user__name">{{ auth.user?.fullName }}</span>
          </v-btn>
        </template>
        <v-list density="compact" min-width="240">
          <v-list-item :title="auth.user?.fullName" :subtitle="roleLabel" />
          <v-divider />
          <v-list-item
            :prepend-icon="mdiLockOutline"
            title="Cambiar mi contraseña"
            @click="changePasswordOpen = true"
          />
          <v-list-item :prepend-icon="mdiLogout" title="Salir" @click="logout" />
        </v-list>
      </v-menu>
    </div>
  </v-app-bar>

  <v-main>
    <div id="main-content" class="page-container" tabindex="-1">
      <router-view />
    </div>
  </v-main>

  <ChangePasswordDialog v-model="changePasswordOpen" />
</template>

<style scoped>
.app-bar {
  width: 100%;
  max-width: 1440px;
  margin-inline: auto;
  display: flex;
  align-items: center;
  gap: 16px;
  padding-inline: 16px;
}
.app-brand {
  display: flex;
  align-items: center;
  gap: 10px;
}
.app-brand__name {
  font-weight: 600;
  color: rgb(var(--v-theme-secondary));
}
.app-nav {
  display: flex;
  gap: 4px;
  flex: 1;
}
.app-user__name {
  margin-left: 8px;
}
.page-container {
  max-width: 1440px;
  margin-inline: auto;
  padding: 24px 16px 48px;
  outline: none;
}
.skip-link {
  position: absolute;
  left: 8px;
  top: -48px;
  z-index: 3000;
  padding: 8px 16px;
  border-radius: 8px;
  background: rgb(var(--v-theme-primary));
  color: #fff;
}
.skip-link:focus {
  top: 8px;
}

@media (max-width: 959px) {
  .app-brand__name {
    display: none;
  }
}
@media (max-width: 1099px) {
  .app-user__name {
    display: none;
  }
}
@media (max-width: 719px) {
  /* En pantallas pequeñas la navegación queda solo con íconos (con aria-label). */
  .app-nav__label {
    display: none;
  }
  .app-nav {
    gap: 0;
    min-width: 0;
  }
  .app-nav__item {
    min-width: 0;
    padding-inline: 10px;
  }
  .app-nav__item :deep(.v-btn__prepend) {
    margin-inline: 0;
  }
}
@media (max-width: 599px) {
  .app-user {
    min-width: 0;
    padding-inline: 4px;
  }
  .app-user :deep(.v-btn__append) {
    display: none;
  }
  .app-bar {
    gap: 4px;
  }
}
</style>
