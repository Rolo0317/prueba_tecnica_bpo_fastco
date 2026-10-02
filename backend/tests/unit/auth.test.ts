import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { UnauthorizedError } from '../../src/core/errors.js';
import { AuthService } from '../../src/modules/auth/auth.service.js';
import { durationToSeconds, JwtTokenService } from '../../src/modules/auth/token.service.js';
import {
  addUser,
  AREA,
  FakePasswordHasher,
  InMemoryUserRepository,
  ROLE,
  TEST_AUTH_CONFIG,
} from '../helpers/fakes.js';

const user = { id: 7, username: 'agente', fullName: 'Agente Uno' };

describe('durationToSeconds', () => {
  it.each([
    ['30s', 30],
    ['15m', 900],
    ['1h', 3600],
    ['7d', 604800],
  ])('convierte %s en %i segundos', (input, expected) => {
    expect(durationToSeconds(input)).toBe(expected);
  });
});

describe('JwtTokenService', () => {
  const service = new JwtTokenService(TEST_AUTH_CONFIG);

  it('emite un token verificable que identifica al usuario (sin rol ni permisos)', () => {
    const { token, expiresIn } = service.issue(user, 1_700_000_000_000);

    expect(expiresIn).toBe(3600);
    expect(service.verify(token)).toEqual({ userId: 7, passwordVersion: 1_700_000_000_000 });
    expect(jwt.decode(token)).not.toHaveProperty('role');
  });

  it('rechaza un token firmado con otro secreto', () => {
    const forged = jwt.sign(
      { username: 'x', name: 'x' },
      'otro-secreto-de-al-menos-32-caracteres!!',
      {
        subject: '1',
        issuer: 'task-manager-api',
        audience: 'task-manager-web',
      },
    );

    expect(() => service.verify(forged)).toThrow(UnauthorizedError);
  });

  it('rechaza un token con algoritmo "none" (ataque de downgrade)', () => {
    const unsigned = jwt.sign({ username: 'x', name: 'x', sub: '1' }, '', { algorithm: 'none' });

    expect(() => service.verify(unsigned)).toThrow(UnauthorizedError);
  });

  it('rechaza un token expirado', () => {
    const expired = new JwtTokenService({ ...TEST_AUTH_CONFIG, jwtExpiresIn: '0s' }).issue(
      user,
      0,
    ).token;

    expect(() => service.verify(expired)).toThrow(UnauthorizedError);
  });
});

describe('AuthService.login', () => {
  const setup = async () => {
    const users = new InMemoryUserRepository();
    await addUser(users, {
      username: 'agente',
      fullName: 'Agente Uno',
      password: 'correcta',
      roleId: ROLE.SUPERVISOR,
      areaId: AREA.OPERATIONS,
    });
    return new AuthService(users, new FakePasswordHasher(), new JwtTokenService(TEST_AUTH_CONFIG));
  };

  it('devuelve token y usuario con su rol, área y permisos vigentes', async () => {
    const result = await (await setup()).login('agente', 'correcta');

    expect(result.tokenType).toBe('Bearer');
    expect(result.user).toEqual({
      id: 1,
      username: 'agente',
      fullName: 'Agente Uno',
      role: { id: ROLE.SUPERVISOR, name: 'Supervisor' },
      area: { id: AREA.OPERATIONS, name: 'Operaciones' },
      permissions: ['TASKS_VIEW_AREA', 'TASKS_EDIT_ANY', 'TASKS_ASSIGN'],
    });
    expect(result.token).toEqual(expect.any(String));
  });

  it('responde con el mismo error para contraseña incorrecta y usuario inexistente', async () => {
    const service = await setup();

    const wrongPassword = service.login('agente', 'incorrecta');
    const unknownUser = service.login('fantasma', 'correcta');

    await expect(wrongPassword).rejects.toThrow('Usuario o contraseña incorrectos.');
    await expect(unknownUser).rejects.toThrow('Usuario o contraseña incorrectos.');
  });
});
