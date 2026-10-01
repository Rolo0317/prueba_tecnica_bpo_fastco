<script setup lang="ts">
import { mdiClipboardTextOutline, mdiFilterRemoveOutline, mdiPlus } from '@mdi/js';

defineProps<{ filtered: boolean }>();
const emit = defineEmits<{ create: []; 'clear-filter': [] }>();
</script>

<template>
  <div class="empty-state" role="status">
    <v-icon
      :icon="filtered ? mdiFilterRemoveOutline : mdiClipboardTextOutline"
      size="48"
      color="secondary"
    />
    <p class="empty-state__title">
      {{ filtered ? 'No hay tareas en este estado' : 'Aún no hay tareas registradas' }}
    </p>
    <p class="text-medium-emphasis">
      {{
        filtered
          ? 'Prueba con otro filtro o revisa todas las tareas.'
          : 'Crea la primera tarea operativa del equipo.'
      }}
    </p>
    <v-btn v-if="filtered" variant="outlined" color="primary" @click="emit('clear-filter')">
      Ver todas
    </v-btn>
    <v-btn v-else color="primary" :prepend-icon="mdiPlus" @click="emit('create')">
      Nueva tarea
    </v-btn>
  </div>
</template>

<style scoped>
.empty-state {
  display: grid;
  justify-items: center;
  gap: 8px;
  padding: 48px 16px;
  text-align: center;
}
.empty-state__title {
  font-size: 1.125rem;
  font-weight: 600;
}
</style>
