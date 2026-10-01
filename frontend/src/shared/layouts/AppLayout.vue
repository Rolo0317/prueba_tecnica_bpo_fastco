<script setup lang="ts">
import { mdiLogout } from '@mdi/js';
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/modules/auth/stores/authStore';
import BrandMark from '@/shared/components/BrandMark.vue';

const auth = useAuthStore();
const router = useRouter();

const initials = computed(() =>
  (auth.user?.fullName ?? '')
    .split(' ')
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join(''),
);

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

      <div class="app-user">
        <v-avatar color="secondary" size="34" aria-hidden="true">{{ initials }}</v-avatar>
        <span class="app-user__name">{{ auth.user?.fullName }}</span>
        <v-btn variant="text" :prepend-icon="mdiLogout" @click="logout">Salir</v-btn>
      </div>
    </div>
  </v-app-bar>

  <v-main>
    <div id="main-content" class="page-container" tabindex="-1">
      <router-view />
    </div>
  </v-main>
</template>

<style scoped>
.app-bar {
  width: 100%;
  max-width: 1440px;
  margin-inline: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-inline: 16px;
}
.app-brand,
.app-user {
  display: flex;
  align-items: center;
  gap: 10px;
}
.app-brand__name {
  font-weight: 600;
  color: rgb(var(--v-theme-secondary));
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

@media (max-width: 599px) {
  .app-brand__name,
  .app-user__name {
    display: none;
  }
}
</style>
