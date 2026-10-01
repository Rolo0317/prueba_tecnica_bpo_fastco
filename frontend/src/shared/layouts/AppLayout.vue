<script setup lang="ts">
import {
  mdiAccountGroupOutline,
  mdiChevronDown,
  mdiClipboardTextOutline,
  mdiLockOutline,
  mdiLogout,
} from '@mdi/js';
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import ChangePasswordDialog from '@/modules/auth/components/ChangePasswordDialog.vue';
import { useAuthStore } from '@/modules/auth/stores/authStore';
import { ROLE_VISUALS } from '@/modules/users/constants';
import BrandMark from '@/shared/components/BrandMark.vue';
import ThemeToggle from '@/shared/components/ThemeToggle.vue';
import { initialsOf } from '@/shared/utils/text';

const auth = useAuthStore();
const router = useRouter();
const changePasswordOpen = ref(false);

const navItems = computed(() => [
  { title: 'Tareas', icon: mdiClipboardTextOutline, to: { name: 'tasks' } },
  ...(auth.isAdmin
    ? [{ title: 'Usuarios', icon: mdiAccountGroupOutline, to: { name: 'users' } }]
    : []),
]);

const initials = computed(() => initialsOf(auth.user?.fullName ?? ''));
const roleLabel = computed(() => (auth.user ? ROLE_VISUALS[auth.user.role].label : ''));

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
          :key="item.title"
          :to="item.to"
          :prepend-icon="item.icon"
          variant="text"
          active-color="primary"
        >
          {{ item.title }}
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
@media (max-width: 599px) {
  .app-user__name {
    display: none;
  }
  .app-bar {
    gap: 4px;
  }
}
</style>
