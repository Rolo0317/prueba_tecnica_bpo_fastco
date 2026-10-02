import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { ApiError } from '@/core/http';
import { useChangePassword } from '@/modules/auth/composables/useChangePassword';
import type { Area } from '@/modules/access/types';
import { resolveAreaId, useUserForm } from '@/modules/users/composables/useUserForm';
import { useUsers } from '@/modules/users/composables/useUsers';
import type { UserService } from '@/modules/users/services/userService';
import type { ManagedUser } from '@/modules/users/types';
import { initialsOf } from '@/shared/utils/text';
import { passwordPolicyRules } from '@/shared/validation/passwordRules';
import { COLLABORATOR, flushPromises, withSetup } from '../helpers';

const buildUser = (overrides: Partial<ManagedUser> = {}): ManagedUser => ({
  id: 2,
  username: 'agente',
  fullName: 'Agente Uno',
  role: { id: 3, name: 'Colaborador' },
  area: { id: 1, name: 'Operaciones' },
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

const AREAS: Area[] = [
  {
    id: 1,
    name: 'Operaciones',
    description: null,
    isActive: true,
    createdAt: '2026-10-01T10:00:00.000Z',
    usersCount: 1,
    openTasksCount: 0,
  },
];

describe('resolveAreaId (área elegida o escrita en el formulario)', () => {
  it('usa el id elegido, reutiliza un área con el mismo nombre o crea una nueva', async () => {
    const createArea = vi.fn().mockResolvedValue({ ...AREAS[0], id: 9, name: 'Logística' });

    expect(await resolveAreaId(1, AREAS, createArea)).toBe(1);
    expect(await resolveAreaId(null, AREAS, createArea)).toBeNull();
    expect(await resolveAreaId('  operaciones ', AREAS, createArea)).toBe(1);
    expect(createArea).not.toHaveBeenCalled();

    expect(await resolveAreaId('Logística', AREAS, createArea)).toBe(9);
    expect(createArea).toHaveBeenCalledWith({ name: 'Logística', description: null });
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
  const formOptions = { areas: ref(AREAS), defaultRoleId: ref<number | null>(3) };

  it('sin usuario crea con rol y área (incluso un área nueva); con usuario edita', async () => {
    const actions = {
      create: vi.fn().mockResolvedValue(buildUser()),
      update: vi.fn().mockResolvedValue(buildUser()),
      createArea: vi.fn().mockResolvedValue({ ...AREAS[0], id: 7, name: 'Logística' }),
    };
    const target = ref<ManagedUser | null>(null);
    const userForm = useUserForm(target, actions, formOptions);
    userForm.reset();
    expect(userForm.form.roleId).toBe(3);

    Object.assign(userForm.form, {
      username: ' nuevo ',
      fullName: ' Nuevo ',
      roleId: 1,
      area: 'Logística',
      password: 'Valida-2026x',
    });
    await userForm.submit();
    expect(actions.create).toHaveBeenCalledWith({
      username: 'nuevo',
      fullName: 'Nuevo',
      roleId: 1,
      areaId: 7,
      password: 'Valida-2026x',
    });

    target.value = buildUser();
    userForm.reset();
    expect(userForm.form).toMatchObject({ username: 'agente', roleId: 3, area: 1 });
    await userForm.submit();
    expect(actions.update).toHaveBeenCalledWith(2, {
      fullName: 'Agente Uno',
      roleId: 3,
      areaId: 1,
    });
  });

  it('muestra el 409 de usuario duplicado como error general', async () => {
    const conflict = new ApiError(409, 'CONFLICT', 'El nombre de usuario ya existe.');
    const userForm = useUserForm(
      ref(null),
      { create: vi.fn().mockRejectedValue(conflict), update: vi.fn(), createArea: vi.fn() },
      formOptions,
    );

    await userForm.submit();

    expect(userForm.generalError.value).toBe('El nombre de usuario ya existe.');
  });
});

describe('useChangePassword', () => {
  it('al cambiar la contraseña continúa con la sesión nueva que devuelve la API', async () => {
    const renewed = {
      token: 'nuevo',
      tokenType: 'Bearer' as const,
      expiresIn: 3600,
      user: COLLABORATOR,
    };
    const renewSession = vi.fn();
    const { form, submit } = useChangePassword(
      { changePassword: vi.fn().mockResolvedValue(renewed) },
      renewSession,
    );
    Object.assign(form, {
      currentPassword: 'Actual-2026x',
      newPassword: 'Nueva-2026xy',
      confirmPassword: 'Nueva-2026xy',
    });

    await submit();

    expect(renewSession).toHaveBeenCalledWith(renewed);
  });

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
