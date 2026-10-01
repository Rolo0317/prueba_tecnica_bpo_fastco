import { mdiHeadset, mdiShieldAccountOutline } from '@mdi/js';
import type { Visual } from '@/modules/tasks/constants';
import type { Role } from './types';

export const ROLE_VISUALS: Readonly<Record<Role, Visual & { description: string }>> = {
  ADMIN: {
    label: 'Administrador',
    icon: mdiShieldAccountOutline,
    color: 'secondary',
    description: 'Gestiona tareas y usuarios',
  },
  AGENT: {
    label: 'Agente',
    icon: mdiHeadset,
    color: 'primary',
    description: 'Gestiona tareas',
  },
};

export const ROLE_OPTIONS = (Object.keys(ROLE_VISUALS) as Role[]).map((value) => ({
  value,
  ...ROLE_VISUALS[value],
}));

export const USER_LIMITS = { username: 50, fullName: 100 } as const;
