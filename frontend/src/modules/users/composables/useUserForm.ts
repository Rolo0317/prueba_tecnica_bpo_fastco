import { computed, reactive, type Ref } from 'vue';
import { useFormSubmit } from '@/shared/composables/useFormSubmit';
import { matchesRule, passwordPolicyRules } from '@/shared/validation/passwordRules';
import { USER_LIMITS } from '../constants';
import type { ManagedUser, NewUserPayload, Role, UpdateUserPayload } from '../types';

interface UserFormState {
  username: string;
  fullName: string;
  role: Role;
  password: string;
  confirmPassword: string;
}

const initialState = (user: ManagedUser | null): UserFormState => ({
  username: user?.username ?? '',
  fullName: user?.fullName ?? '',
  role: user?.role ?? 'AGENT',
  password: '',
  confirmPassword: '',
});

export interface UserFormActions {
  create: (payload: NewUserPayload) => Promise<ManagedUser>;
  update: (id: number, payload: UpdateUserPayload) => Promise<ManagedUser>;
}

/** ViewModel del formulario de usuario. Sin usuario → creación; con usuario → edición. */
export function useUserForm(user: Ref<ManagedUser | null>, actions: UserFormActions) {
  const form = reactive<UserFormState>(initialState(null));
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
    password: passwordPolicyRules,
    confirmPassword: matchesRule(() => form.password),
  };

  const { loading, fieldErrors, generalError, clearErrors, submit } = useFormSubmit(() => {
    const data = { fullName: form.fullName.trim(), role: form.role };
    return user.value
      ? actions.update(user.value.id, data)
      : actions.create({ ...data, username: form.username.trim(), password: form.password });
  });

  function reset(): void {
    Object.assign(form, initialState(user.value));
    clearErrors();
  }

  return { form, isEdit, rules, loading, fieldErrors, generalError, reset, submit };
}
