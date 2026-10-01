import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import TaskTimeline from '@/modules/tasks/components/TaskTimeline.vue';
import { useTaskTimeline } from '@/modules/tasks/composables/useTaskTimeline';
import type { TimelineEvent } from '@/modules/tasks/types';
import { ApiError } from '@/core/http';
import { dueRelative } from '@/shared/utils/dates';
import { vuetify } from '../helpers';

const admin = { id: 1, name: 'Ana López' };
const agent = { id: 2, name: 'Carlos Ruiz' };

const EVENTS: TimelineEvent[] = [
  {
    kind: 'CREATED',
    id: 'CREATED-1',
    occurredAt: '2026-10-01T14:00:00.000Z',
    actor: admin,
    status: { code: 'PENDING', name: 'Pendiente' },
  },
  {
    kind: 'ASSIGNMENT',
    id: 'ASSIGNMENT-1',
    occurredAt: '2026-10-01T14:00:00.000Z',
    actor: admin,
    fromUser: null,
    toUser: 'Carlos Ruiz',
  },
  {
    kind: 'STATUS',
    id: 'STATUS-2',
    occurredAt: '2026-10-01T15:00:00.000Z',
    actor: agent,
    from: { code: 'PENDING', name: 'Pendiente' },
    to: { code: 'IN_PROGRESS', name: 'En progreso' },
  },
  {
    kind: 'NOTE',
    id: 'NOTE-1',
    occurredAt: '2026-10-01T15:10:00.000Z',
    actor: agent,
    body: 'Llamé al cliente, no contestó.',
  },
];

describe('useTaskTimeline', () => {
  it('carga la línea de tiempo con lo más reciente primero', async () => {
    const service = { timeline: vi.fn().mockResolvedValue(EVENTS), addNote: vi.fn() };
    const { events, load } = useTaskTimeline(service);

    await load(5);

    expect(service.timeline).toHaveBeenCalledWith(5);
    expect(events.value.map((e) => e.id)).toEqual([
      'NOTE-1',
      'STATUS-2',
      'ASSIGNMENT-1',
      'CREATED-1',
    ]);
  });

  it('un avance nuevo aparece arriba sin recargar la línea de tiempo', async () => {
    const note = {
      id: 9,
      body: 'Cliente confirmó pago',
      author: agent,
      createdAt: '2026-10-01T16:00:00.000Z',
    };
    const service = {
      timeline: vi.fn().mockResolvedValue(EVENTS),
      addNote: vi.fn().mockResolvedValue(note),
    };
    const timeline = useTaskTimeline(service);
    await timeline.load(5);

    await timeline.addNote('Cliente confirmó pago');

    expect(service.addNote).toHaveBeenCalledWith(5, 'Cliente confirmó pago');
    expect(service.timeline).toHaveBeenCalledTimes(1);
    expect(timeline.events.value[0]).toMatchObject({
      kind: 'NOTE',
      id: 'NOTE-9',
      body: 'Cliente confirmó pago',
    });
  });

  it('expone el error al registrar un avance (p. ej. la tarea fue reasignada)', async () => {
    const service = {
      timeline: vi.fn().mockResolvedValue([]),
      addNote: vi.fn().mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'La tarea no existe.')),
    };
    const timeline = useTaskTimeline(service);
    await timeline.load(5);

    const result = await timeline.addNote('Intento');

    expect(result).toBeUndefined();
    expect(timeline.noteError.value?.message).toBe('La tarea no existe.');
    expect(timeline.events.value).toEqual([]);
  });
});

describe('TaskTimeline', () => {
  it('describe cada evento en lenguaje natural', () => {
    const wrapper = mount(TaskTimeline, {
      props: { events: EVENTS },
      global: { plugins: [vuetify] },
    });
    const text = wrapper.text();

    expect(text).toContain('Ana López creó la tarea');
    expect(text).toContain('Ana López asignó la tarea a Carlos Ruiz');
    expect(text).toContain('Carlos Ruiz cambió el estado de Pendiente a En progreso');
    expect(text).toContain('Llamé al cliente, no contestó.');
    expect(wrapper.findAll('time')).toHaveLength(4);
  });

  it('describe reasignaciones y liberaciones', () => {
    const events: TimelineEvent[] = [
      { ...EVENTS[1], id: 'A-2', fromUser: 'Carlos Ruiz', toUser: 'Diana Mora' } as TimelineEvent,
      { ...EVENTS[1], id: 'A-3', fromUser: 'Diana Mora', toUser: null } as TimelineEvent,
    ];
    const text = mount(TaskTimeline, { props: { events }, global: { plugins: [vuetify] } }).text();

    expect(text).toContain('reasignó la tarea de Carlos Ruiz a Diana Mora');
    expect(text).toContain('dejó la tarea sin asignar (antes: Diana Mora)');
  });

  it('si alguien se asigna la tarea a sí mismo lo dice de forma natural', () => {
    const events: TimelineEvent[] = [
      {
        ...EVENTS[1],
        id: 'A-4',
        actor: agent,
        fromUser: null,
        toUser: 'Carlos Ruiz',
      } as TimelineEvent,
    ];
    const text = mount(TaskTimeline, { props: { events }, global: { plugins: [vuetify] } }).text();

    expect(text).toContain('Carlos Ruiz se asignó la tarea');
  });
});

describe('dueRelative', () => {
  it.each([
    [null, 'Sin fecha límite'],
    ['2026-10-01', 'Vence hoy'],
    ['2026-10-02', 'Vence mañana'],
    ['2026-10-05', 'Vence en 4 días'],
    ['2026-09-30', 'Venció ayer'],
    ['2026-09-28', 'Vencida hace 3 días'],
  ] as const)('dueRelative(%s) = %s', (due, expected) => {
    expect(dueRelative(due, '2026-10-01')).toBe(expected);
  });
});
