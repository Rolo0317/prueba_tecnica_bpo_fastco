import { reactive } from 'vue';
import { useFormSubmit } from '@/shared/composables/useFormSubmit';
import { matchesRule, passwordPolicyRules } from '@/shared/validation/passwordRules';
import { accountService, type AccountService } from '../services/accountService';

const initialState = () => ({ currentPassword: '', newPassword: '', confirmPassword: '' });

/** ViewModel del cambio de la propia contraseña. */
export function useChangePassword(service: AccountService = accountService) {
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
    await service.changePassword({
      currentPassword: form.currentPassword,
      newPassword: form.newPassword,
    });
    return true;
  });

  function reset(): void {
    Object.assign(form, initialState());
    clearErrors();
  }

  return { form, rules, loading, fieldErrors, generalError, reset, submit };
}
