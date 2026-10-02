import { reactive } from 'vue';
import { useFormSubmit } from '@/shared/composables/useFormSubmit';
import { matchesRule, passwordPolicyRules } from '@/shared/validation/passwordRules';
import { accountService, type AccountService } from '../services/accountService';
import { useAuthStore } from '../stores/authStore';
import type { LoginResponse } from '../types';

const initialState = () => ({ currentPassword: '', newPassword: '', confirmPassword: '' });

/** ViewModel del cambio de la propia contraseña. */
export function useChangePassword(
  service: Pick<AccountService, 'changePassword'> = accountService,
  /** La sesión actual continúa con el token nuevo; las demás quedan cerradas por la API. */
  renewSession: (response: LoginResponse) => void = (response) => {
    useAuthStore().startSession(response);
  },
) {
  const form = reactive(initialState());

  const rules = {
    currentPassword: [(value: string) => value.length > 0 || 'Ingresa tu contraseña actual.'],
    newPassword: [
      ...passwordPolicyRules,
      (value: string) => value !== form.currentPassword || 'Debe ser diferente de la actual.',
    ],
    confirmPassword: matchesRule(() => form.newPassword),
  };

  const { loading, fieldErrors, generalError, clearErrors, submit } = useFormSubmit(async () => {
    const renewed = await service.changePassword({
      currentPassword: form.currentPassword,
      newPassword: form.newPassword,
    });
    renewSession(renewed);
    return true;
  });

  function reset(): void {
    Object.assign(form, initialState());
    clearErrors();
  }

  return { form, rules, loading, fieldErrors, generalError, reset, submit };
}
