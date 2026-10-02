import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/core/http';
import { solveChallenge, useCaptcha } from '@/modules/auth/composables/useCaptcha';
import { formatCountdown, loginErrorMessage } from '@/modules/auth/composables/useLoginForm';
import { sha256Hex } from '@/shared/utils/sha256';

describe('sha256Hex (vectores oficiales FIPS 180-4)', () => {
  it.each([
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    [
      'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    ],
  ])('sha256(%j)', (input, expected) => {
    expect(sha256Hex(input)).toBe(expected);
  });

  it('maneja texto con tildes (UTF-8)', () => {
    expect(sha256Hex('contraseña')).toHaveLength(64);
  });
});

describe('captcha "No soy un robot"', () => {
  const challengeFor = (number: number) => {
    const salt = 'abc?expires=9999999999';
    return {
      enabled: true as const,
      algorithm: 'SHA-256' as const,
      challenge: sha256Hex(salt + String(number)),
      salt,
      maxNumber: 500,
      signature: 'f'.repeat(64),
    };
  };

  it('encuentra el número y arma la solución en base64', async () => {
    const solution = await solveChallenge(challengeFor(321), 100);

    expect(JSON.parse(atob(solution))).toMatchObject({ number: 321, algorithm: 'SHA-256' });
  });

  it('verifica y entrega el token; si el captcha está desactivado, queda listo sin token', async () => {
    const enabled = useCaptcha({ get: vi.fn().mockResolvedValue(challengeFor(7)) });
    await enabled.verify();
    expect(enabled.ready.value).toBe(true);
    expect(enabled.payload.value).toEqual(expect.any(String));

    const disabled = useCaptcha({ get: vi.fn().mockResolvedValue({ enabled: false }) });
    await disabled.verify();
    expect(disabled.ready.value).toBe(true);
    expect(disabled.payload.value).toBeUndefined();
  });

  it('tras usarlo hay que verificar de nuevo (cada token sirve una vez)', async () => {
    const captcha = useCaptcha({ get: vi.fn().mockResolvedValue(challengeFor(3)) });
    await captcha.verify();

    captcha.reset();

    expect(captcha.ready.value).toBe(false);
    expect(captcha.payload.value).toBeUndefined();
  });

  it('muestra el error si no se pudo obtener el desafío', async () => {
    const captcha = useCaptcha({
      get: vi.fn().mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'Sin conexión')),
    });

    await captcha.verify();

    expect(captcha.status.value).toBe('error');
    expect(captcha.errorMessage.value).toBe('Sin conexión');
  });
});

describe('límite de intentos en el login', () => {
  const unauthorized = (attemptsRemaining?: number) =>
    new ApiError(
      401,
      'UNAUTHORIZED',
      'Usuario o contraseña incorrectos.',
      [],
      attemptsRemaining === undefined ? {} : { attemptsRemaining },
    );

  it('informa los intentos restantes', () => {
    expect(loginErrorMessage(unauthorized(3))).toBe(
      'Usuario o contraseña incorrectos. Te quedan 3 intentos.',
    );
    expect(loginErrorMessage(unauthorized(1))).toBe(
      'Usuario o contraseña incorrectos. Te queda 1 intento.',
    );
    expect(loginErrorMessage(unauthorized(0))).toContain('se bloqueará en el próximo intento');
    expect(loginErrorMessage(unauthorized())).toBe('Usuario o contraseña incorrectos.');
  });

  it.each([
    [900, '15:00'],
    [61, '1:01'],
    [9, '0:09'],
  ])('formatCountdown(%i) = %s', (seconds, expected) => {
    expect(formatCountdown(seconds)).toBe(expected);
  });
});
