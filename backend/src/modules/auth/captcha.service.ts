import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

/**
 * Captcha "No soy un robot" por prueba de trabajo (mismo enfoque que ALTCHA / Friendly Captcha):
 * el servidor elige un número secreto y publica SHA-256(salt + número); el navegador prueba
 * números hasta encontrarlo (~1 s de cómputo para una persona, costoso a escala para un bot).
 *
 * - Sin terceros: no envía datos a Google ni requiere claves externas (privacidad, ISO 27001).
 * - El desafío va firmado con HMAC: el cliente no puede fabricar uno fácil.
 * - Expira y es de un solo uso (registro en memoria; con varias instancias iría en Redis).
 */
export interface CaptchaChallenge {
  algorithm: 'SHA-256';
  challenge: string;
  salt: string;
  maxNumber: number;
  signature: string;
}

const solutionSchema = z.strictObject({
  algorithm: z.literal('SHA-256'),
  challenge: z.string().regex(/^[a-f0-9]{64}$/),
  salt: z.string().max(100),
  number: z.number().int().nonnegative(),
  signature: z.string().regex(/^[a-f0-9]{64}$/),
});

export type CaptchaSolution = z.infer<typeof solutionSchema>;

export interface CaptchaOptions {
  /** Número máximo a probar: controla la dificultad. */
  maxNumber: number;
  ttlMs: number;
  now?: () => number;
}

export const DEFAULT_CAPTCHA_OPTIONS: CaptchaOptions = { maxNumber: 60_000, ttlMs: 5 * 60_000 };

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

const safeEqual = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export class ProofOfWorkCaptcha {
  private readonly used = new Map<string, number>();
  private readonly now: () => number;

  constructor(
    private readonly secret: string,
    private readonly options: CaptchaOptions = DEFAULT_CAPTCHA_OPTIONS,
  ) {
    this.now = options.now ?? Date.now;
  }

  create(): CaptchaChallenge {
    const expires = Math.floor((this.now() + this.options.ttlMs) / 1000);
    const salt = `${randomBytes(12).toString('hex')}?expires=${String(expires)}`;
    const challenge = sha256(salt + String(randomInt(0, this.options.maxNumber + 1)));
    return {
      algorithm: 'SHA-256',
      challenge,
      salt,
      maxNumber: this.options.maxNumber,
      signature: this.sign(challenge),
    };
  }

  /** Acepta la solución (JSON en base64) una sola vez si es auténtica, vigente y correcta. */
  verify(encoded: string | undefined): boolean {
    const solution = this.decode(encoded);
    if (!solution) return false;

    const expires = Number(/[?&]expires=(\d+)/.exec(solution.salt)?.[1] ?? 0) * 1000;
    const valid =
      safeEqual(solution.signature, this.sign(solution.challenge)) &&
      expires > this.now() &&
      !this.used.has(solution.challenge) &&
      sha256(solution.salt + String(solution.number)) === solution.challenge;

    if (valid) this.markUsed(solution.challenge, expires);
    return valid;
  }

  private sign(challenge: string): string {
    return createHmac('sha256', this.secret).update(challenge).digest('hex');
  }

  private decode(encoded: string | undefined): CaptchaSolution | null {
    if (!encoded) return null;
    try {
      const parsed: unknown = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
      const result = solutionSchema.safeParse(parsed);
      return result.success ? result.data : null;
    } catch {
      return null;
    }
  }

  private markUsed(challenge: string, expires: number): void {
    const now = this.now();
    for (const [key, until] of this.used) {
      if (until <= now) this.used.delete(key);
    }
    this.used.set(challenge, expires);
  }
}

/** Resuelve un desafío (lo usan las pruebas; en la app lo hace el navegador). */
export function solveCaptcha({
  challenge,
  salt,
  maxNumber,
  algorithm,
  signature,
}: CaptchaChallenge) {
  for (let number = 0; number <= maxNumber; number++) {
    if (sha256(salt + String(number)) === challenge) {
      const solution: CaptchaSolution = { algorithm, challenge, salt, number, signature };
      return Buffer.from(JSON.stringify(solution)).toString('base64');
    }
  }
  throw new Error('Desafío sin solución.');
}
