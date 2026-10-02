import { computed, ref } from 'vue';
import { http, toApiError, type ApiClient } from '@/core/http';
import { sha256Hex } from '@/shared/utils/sha256';

export interface CaptchaChallenge {
  enabled: true;
  algorithm: 'SHA-256';
  challenge: string;
  salt: string;
  maxNumber: number;
  signature: string;
}

type CaptchaResponse = CaptchaChallenge | { enabled: false };

/** Busca el número por lotes, cediendo el hilo entre lotes para no congelar la interfaz. */
export async function solveChallenge(challenge: CaptchaChallenge, batch = 2_000): Promise<string> {
  for (let start = 0; start <= challenge.maxNumber; start += batch) {
    const end = Math.min(start + batch, challenge.maxNumber + 1);
    for (let number = start; number < end; number++) {
      if (sha256Hex(challenge.salt + String(number)) === challenge.challenge) {
        const { algorithm, salt, signature } = challenge;
        const solution = { algorithm, challenge: challenge.challenge, salt, number, signature };
        return btoa(JSON.stringify(solution));
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error('No se pudo resolver la verificación.');
}

export type CaptchaStatus = 'idle' | 'verifying' | 'verified' | 'error';

/**
 * ViewModel del captcha "No soy un robot": pide el desafío, lo resuelve en el navegador
 * y entrega el token que se envía con el formulario. Cada token sirve una sola vez.
 */
export function useCaptcha(client: Pick<ApiClient, 'get'> = http) {
  const status = ref<CaptchaStatus>('idle');
  const enabled = ref(true);
  const token = ref<string | null>(null);
  const errorMessage = ref<string | null>(null);

  async function verify(): Promise<void> {
    if (status.value === 'verifying' || status.value === 'verified') return;
    status.value = 'verifying';
    errorMessage.value = null;
    try {
      const response = await client.get<CaptchaResponse>('/auth/captcha');
      if (!response.enabled) {
        enabled.value = false;
        status.value = 'verified';
        return;
      }
      token.value = await solveChallenge(response);
      status.value = 'verified';
    } catch (caught) {
      status.value = 'error';
      errorMessage.value = toApiError(caught).message;
    }
  }

  /** Tras cada envío el token ya se usó: hay que verificar de nuevo. */
  function reset(): void {
    token.value = null;
    status.value = enabled.value ? 'idle' : 'verified';
  }

  /** Valor para el cuerpo de la petición (undefined si el captcha está desactivado). */
  const payload = computed(() => token.value ?? undefined);
  const ready = computed(() => status.value === 'verified');

  return { status, enabled, ready, payload, errorMessage, verify, reset };
}
