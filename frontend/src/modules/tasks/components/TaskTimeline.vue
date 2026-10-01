<script setup lang="ts">
import { mdiAccountSwitchOutline, mdiCommentTextOutline, mdiPlusCircleOutline } from '@mdi/js';
import { formatDateTime } from '@/shared/utils/dates';
import { statusVisual } from '../constants';
import type { TimelineEvent } from '../types';

defineProps<{ events: TimelineEvent[] }>();

interface EventView {
  icon: string;
  color: string;
  summary: string;
}

/** Texto e ícono de cada tipo de evento (la vista no conoce reglas de negocio). */
function describe(event: TimelineEvent): EventView {
  switch (event.kind) {
    case 'CREATED':
      return { icon: mdiPlusCircleOutline, color: 'primary', summary: 'creó la tarea' };
    case 'STATUS': {
      const visual = statusVisual(event.to.code, event.to.name);
      return {
        icon: visual.icon,
        color: visual.color,
        summary: `cambió el estado de ${event.from.name} a ${event.to.name}`,
      };
    }
    case 'ASSIGNMENT':
      return {
        icon: mdiAccountSwitchOutline,
        color: 'secondary',
        summary: assignmentSummary(event),
      };
    case 'NOTE':
      return { icon: mdiCommentTextOutline, color: 'info', summary: 'registró un avance' };
  }
}

function assignmentSummary(event: Extract<TimelineEvent, { kind: 'ASSIGNMENT' }>): string {
  if (!event.toUser) return `dejó la tarea sin asignar (antes: ${event.fromUser ?? '—'})`;
  if (!event.fromUser) {
    return event.toUser === event.actor.name
      ? 'se asignó la tarea'
      : `asignó la tarea a ${event.toUser}`;
  }
  return `reasignó la tarea de ${event.fromUser} a ${event.toUser}`;
}
</script>

<template>
  <ol class="timeline" aria-label="Historial de la tarea">
    <li v-for="event in events" :key="event.id" class="timeline__item">
      <span class="timeline__dot" :class="`bg-${describe(event).color}`" aria-hidden="true">
        <v-icon :icon="describe(event).icon" size="16" />
      </span>
      <div class="timeline__content">
        <p class="timeline__summary">
          <strong>{{ event.actor.name }}</strong>
          {{ describe(event).summary }}
        </p>
        <p v-if="event.kind === 'NOTE'" class="timeline__note">{{ event.body }}</p>
        <time class="timeline__time tabular" :datetime="event.occurredAt">
          {{ formatDateTime(event.occurredAt) }}
        </time>
      </div>
    </li>
  </ol>
</template>

<style scoped>
.timeline {
  list-style: none;
  margin: 0;
  padding: 0;
}
.timeline__item {
  position: relative;
  display: grid;
  grid-template-columns: 32px 1fr;
  gap: 12px;
  padding-bottom: 18px;
}
/* Línea vertical que une los eventos. */
.timeline__item:not(:last-child)::before {
  content: '';
  position: absolute;
  left: 15px;
  top: 32px;
  bottom: 0;
  width: 2px;
  background: rgb(var(--v-border-color), var(--v-border-opacity));
}
.timeline__dot {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
}
.timeline__summary {
  font-size: 0.875rem;
  line-height: 1.4;
}
.timeline__note {
  margin-top: 6px;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgb(var(--v-theme-on-surface), 0.05);
  font-size: 0.875rem;
  white-space: pre-line;
  overflow-wrap: anywhere;
}
.timeline__time {
  display: block;
  margin-top: 4px;
  font-size: 0.75rem;
  color: rgb(var(--v-theme-on-surface), 0.65);
}
</style>
