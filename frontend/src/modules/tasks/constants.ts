import {
  mdiCancel,
  mdiCheckCircleOutline,
  mdiChevronDoubleUp,
  mdiChevronDown,
  mdiClockOutline,
  mdiEqual,
  mdiHelpCircleOutline,
  mdiProgressClock,
} from '@mdi/js';
import type { Priority } from './types';

export interface Visual {
  label: string;
  icon: string;
  color: string;
}

export interface PriorityVisual extends Visual {
  /** Qué significa en la práctica (se muestra al elegirla). */
  hint: string;
}

/** Cada estado se distingue por ícono + texto, nunca solo por color (accesibilidad). */
const STATUS_VISUALS: Readonly<Record<string, Omit<Visual, 'label'>>> = {
  PENDING: { icon: mdiClockOutline, color: 'warning' },
  IN_PROGRESS: { icon: mdiProgressClock, color: 'primary' },
  COMPLETED: { icon: mdiCheckCircleOutline, color: 'success' },
  CANCELLED: { icon: mdiCancel, color: 'neutral' },
};

const UNKNOWN_STATUS = { icon: mdiHelpCircleOutline, color: 'neutral' };

export function statusVisual(code: string, name: string): Visual {
  return { label: name, ...(STATUS_VISUALS[code] ?? UNKNOWN_STATUS) };
}

/** Semáforo de prioridad: rojo (alta), ámbar (media), verde (baja). */
export const PRIORITY_VISUALS: Readonly<Record<Priority, PriorityVisual>> = {
  HIGH: {
    label: 'Alta',
    icon: mdiChevronDoubleUp,
    color: 'error',
    hint: 'Alta: afecta al cliente o a la operación; atender hoy.',
  },
  MEDIUM: {
    label: 'Media',
    icon: mdiEqual,
    color: 'warning',
    hint: 'Media: importante, sin impacto inmediato; atender en los próximos días.',
  },
  LOW: {
    label: 'Baja',
    icon: mdiChevronDown,
    color: 'success',
    hint: 'Baja: mejora o pendiente menor; atender cuando haya capacidad.',
  },
};

export const PRIORITY_OPTIONS = (Object.keys(PRIORITY_VISUALS) as Priority[]).map((value) => ({
  value,
  ...PRIORITY_VISUALS[value],
}));

export { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from '@/shared/types/pagination';

export const TASK_LIMITS = { title: 150, description: 1000 } as const;
