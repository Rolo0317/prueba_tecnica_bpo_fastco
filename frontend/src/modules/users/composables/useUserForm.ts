import { computed, reactive, type Ref } from 'vue';
import type { Area, NewAreaPayload } from '@/modules/access/types';
import { useFormSubmit } from '@/shared/composables/useFormSubmit';
import { matchesRule, passwordPolicyRules } from '@/shared/validation/passwordRules';
import { USER_LIMITS } from '../constants';
import type { ManagedUser, NewUserPayload, UpdateUserPayload } from '../types';

/** Área elegida: id de una existente, texto para crear una nueva, o null = sin área. */
export type AreaChoice = number | string | null;

interface UserFormState {
  username: string;
  fullName: string;
  roleId: number | null;
  area: AreaChoice;
  password: string;
  confirmPassword: string;
}

const initialState = (user: ManagedUser | null, defaultRoleId: number | null): UserFormState => ({
  username: user?.username ?? '',
  fullName: user?.fullName ?? '',
  roleId: user?.role.id ?? defaultRoleId,
  area: user?.area?.id ?? null,
  password: '',
  confirmPassword: '',
});

export interface UserFormActions {
  create: (payload: NewUserPayload) => Promise<ManagedUser>;
  update: (id: number, payload: UpdateUserPayload) => Promise<ManagedUser>;
  /** Crea un área nueva desde el mismo formulario (requiere permiso AREAS_MANAGE). */
  createArea: (payload: NewAreaPayload) => Promise<Area>;
}

/**
 * Convierte la elección de área en un id: si es texto, reutiliza un área con ese nombre
 * o crea una nueva. Así el administrador asigna el área sin salir del formulario.
 */
export async function resolveAreaId(
  choice: AreaChoice,
  areas: readonly Area[],
  createArea: UserFormActions['createArea'],
): Promise<number | null> {
  if (typeof choice === 'number' || choice === null) return choice;
  const name = choice.trim();
  if (!name) return null;
  const existing = areas.find((area) => area.name.toLowerCase() === name.toLowerCase());
  return existing ? existing.id : (await createArea({ name, description: null })).id;
}

/** ViewModel del formulario de usuario. Sin usuario → creación; con usuario → edición. */
export function useUserForm(
  user: Ref<ManagedUser | null>,
  actions: UserFormActions,
  options: { areas: Ref<readonly Area[]>; defaultRoleId: Ref<number | null> },
) {
  const form = reactive<UserFormState>(initialState(null, null));
  const isEdit = computed(() => user.value !== null);

  const rules = {
    username: [
      (value: string) => value.trim().length >= 3 || 'Mínimo 3 caracteres.',
      (value: string) => value.trim().length <= USER_LIMITS.username || 'Máximo 50 caracteres.',
      (value: string) =>
        /^[a-zA-Z0-9._-]+$/.test(value.trim()) ||
        'Solo letras sin tilde, números, punto, guion y guion bajo.',
    ],
    fullName: [
      (value: string) => value.trim().length > 0 || 'El nombre es obligatorio.',
      (value: string) => value.trim().length <= USER_LIMITS.fullName || 'Máximo 100 caracteres.',
    ],
    roleId: [(value: number | null) => value !== null || 'Selecciona un rol.'],
    password: passwordPolicyRules,
    confirmPassword: matchesRule(() => form.password),
  };

  const { loading, fieldErrors, generalError, clearErrors, submit } = useFormSubmit(async () => {
    const data = {
      fullName: form.fullName.trim(),
      roleId: form.roleId ?? 0,
      areaId: await resolveAreaId(form.area, options.areas.value, actions.createArea),
    };
    return user.value
      ? actions.update(user.value.id, data)
      : actions.create({ ...data, username: form.username.trim(), password: form.password });
  });

  function reset(): void {
    Object.assign(form, initialState(user.value, options.defaultRoleId.value));
    clearErrors();
  }

  return { form, isEdit, rules, loading, fieldErrors, generalError, reset, submit };
}
