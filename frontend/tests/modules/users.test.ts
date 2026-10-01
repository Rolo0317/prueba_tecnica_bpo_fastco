import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { ApiError } from '@/core/http';
import { useChangePassword } from '@/modules/auth/composables/useChangePassword';
import { createAuthStore } from '@/modules/auth/stores/authStore';
import { useUserForm } from '@/modules/users/composables/useUserForm';
import { useUsers } from '@/modules/users/composables/useUsers';
import type { UserService } from '@/modules/users/services/userService';
import type { ManagedUser } from '@/modules/users/types';
import { initialsOf } from '@/shared/utils/text';
import { passwordPolicyRules } from '@/shared/validation/passwordRules';
import { flushPromises, withSetup } from '../helpers';

const buildUser = (overrides: Partial<ManagedUser> = {}): ManagedUser => ({
  id: 2,
  username: 'agente',
  fullName: 'Agente Uno',
  role: 'AGENT',
  isActive: true,
  createdAt: '2026-10-01T10:00:00.000Z',
  passwordChangedAt: null,
  ...overrides,
});

function fakeService(overrides: Partial<UserService> = {}): UserService {
  return {
    list: vi.fn().mockResolvedValue({
      data: [buildUser()],
      pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
    }),
    create: vi.fn().mockResolvedValue(buildUser({ id: 3, username: 'nuevo' })),
    update: vi.fn().mockResolvedValue(buildUser({ fullName: 'Editado' })),
    setActive: vi.fn().mockResolvedValue(buildUser({ isActive: false })),
    resetPassword: vi.fn().mockResolvedValue(null),
    remove: vi.fn().mockResolvedValue({ unassignedTasks: 2 }),
    listAssignable: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

const failures = (rules: ((value: string) => boolean | string)[], value: string) =>
  rules.map((rule) => rule(value)).filter((result) => result !== true);

describe('política de contraseñas (igual a la del backend)', () => {
  it.each([
    ['Corta1a', 1],
    ['sinmayusculas123', 1],
    ['SINMINUSCULAS123', 1],
    ['SinNumerosAqui', 1],
    ['Valida-2026x', 0],
  ])('"%s" incumple %i regla(s)', (password, errors) => {
    expect(failures(passwordPolicyRules, password)).toHaveLength(errors);
  });
});

describe('authStore.isAdmin', () => {
  it('solo es verdadero para el rol ADMIN', async () => {
    const isAdminFor = async (role: 'ADMIN' | 'AGENT') => {
      setActivePinia(createPinia());
      const user = { id: 1, username: 'u', fullName: 'U', role };
      const login = vi
        .fn()
        .mockResolvedValue({ token: 'jwt', tokenType: 'Bearer', expiresIn: 3600, user });
      const store = createAuthStore({ login })();
      await store.login({ username: 'u', password: 'p' });
      return store.isAdmin;
    };

    expect(await isAdminFor('ADMIN')).toBe(true);
    expect(await isAdminFor('AGENT')).toBe(false);
  });
});

describe('useUsers', () => {
  it('carga la primera página al iniciar', async () => {
    const service = fakeService();
    const { result } = await withSetup(() => useUsers(service));
    await flushPromises();

    expect(service.list).toHaveBeenCalledWith(1, 10);
    expect(result.users.value).toHaveLength(1);
  });

  it('desactivar reemplaza al usuario en la lista y libera el indicador de carga', async () => {
    const service = fakeService();
    const { result } = await withSetup(() => useUsers(service));
    await flushPromises();

    await result.setActive(buildUser(), false);

    expect(service.setActive).toHaveBeenCalledWith(2, false);
    expect(result.users.value[0]?.isActive).toBe(false);
    expect(result.busyUserId.value).toBeNull();
  });

  it('propaga el 409 de "no puedes desactivarte" para mostrarlo', async () => {
    const conflict = new ApiError(409, 'CONFLICT', 'No puedes desactivar tu propio usuario.');
    const service = fakeService({ setActive: vi.fn().mockRejectedValue(conflict) });
    const { result } = await withSetup(() => useUsers(service));

    await expect(result.setActive(buildUser({ id: 1 }), false)).rejects.toMatchObject({
      status: 409,
    });
    expect(result.busyUserId.value).toBeNull();
  });
});

describe('eliminar usuario e iniciales', () => {
  it('useUsers.remove devuelve las tareas liberadas y recarga la lista', async () => {
    const service = fakeService();
    const { result } = await withSetup(() => useUsers(service));
    await flushPromises();

    const unassigned = await result.remove(buildUser());

    expect(unassigned).toBe(2);
    expect(service.remove).toHaveBeenCalledWith(2);
    expect(service.list).toHaveBeenCalledTimes(2);
    expect(result.busyUserId.value).toBeNull();
  });

  it.each([
    ['Ana María Pérez', 'AM'],
    ['  carlos  ', 'C'],
    ['', ''],
  ])('initialsOf(%s) = %s', (name, expected) => {
    expect(initialsOf(name)).toBe(expected);
  });
});

describe('useUserForm', () => {
  it('sin usuario crea; con usuario edita solo nombre y rol', async () => {
    const actions = {
      create: vi.fn().mockResolvedValue(buildUser()),
      update: vi.fn().mockResolvedValue(buildUser()),
    };
    const target = ref<ManagedUser | null>(null);
    const userForm = useUserForm(target, actions);

    Object.assign(userForm.form, {
      username: ' nuevo ',
      fullName: ' Nuevo ',
      role: 'ADMIN',
      password: 'Valida-2026x',
    });
    await userForm.submit();
    expect(actions.create).toHaveBeenCalledWith({
      username: 'nuevo',
      fullName: 'Nuevo',
      role: 'ADMIN',
      password: 'Valida-2026x',
    });

    target.value = buildUser();
    userForm.reset();
    expect(userForm.form.username).toBe('agente');
    await userForm.submit();
    expect(actions.update).toHaveBeenCalledWith(2, { fullName: 'Agente Uno', role: 'AGENT' });
  });

  it('muestra el 409 de usuario duplicado como error general', async () => {
    const conflict = new ApiError(409, 'CONFLICT', 'El nombre de usuario ya existe.');
    const userForm = useUserForm(ref(null), {
      create: vi.fn().mockRejectedValue(conflict),
      update: vi.fn(),
    });

    await userForm.submit();

    expect(userForm.generalError.value).toBe('El nombre de usuario ya existe.');
  });
});

describe('useChangePassword', () => {
  it('valida la confirmación y que la nueva sea distinta de la actual', () => {
    const { form, rules } = useChangePassword({ changePassword: vi.fn() });
    Object.assign(form, {
      currentPassword: 'Actual-2026x',
      newPassword: 'Actual-2026x',
      confirmPassword: 'otra',
    });

    expect(failures(rules.newPassword, form.newPassword)).toContain(
      'Debe ser diferente de la actual.',
    );
    expect(failures(rules.confirmPassword, form.confirmPassword)).toContain(
      'Las contraseñas no coinciden.',
    );
  });

  it('muestra el error del servidor junto al campo de la contraseña actual', async () => {
    const wrong = new ApiError(400, 'VALIDATION_ERROR', 'La contraseña actual no es correcta.', [
      { field: 'currentPassword', message: 'La contraseña actual no es correcta.' },
    ]);
    const { submit, fieldErrors } = useChangePassword({
      changePassword: vi.fn().mockRejectedValue(wrong),
    });

    await submit();

    expect(fieldErrors.value.currentPassword).toBe('La contraseña actual no es correcta.');
  });
});
