/** Misma política que el backend (user.schemas.ts): feedback inmediato, el backend sigue validando. */
export const PASSWORD_MIN_LENGTH = 10;

export const passwordPolicyRules = [
  (value: string) =>
    value.length >= PASSWORD_MIN_LENGTH || `Mínimo ${PASSWORD_MIN_LENGTH} caracteres.`,
  (value: string) => /[a-z]/.test(value) || 'Incluye al menos una letra minúscula.',
  (value: string) => /[A-Z]/.test(value) || 'Incluye al menos una letra mayúscula.',
  (value: string) => /\d/.test(value) || 'Incluye al menos un número.',
];

export const PASSWORD_HINT = `Mínimo ${PASSWORD_MIN_LENGTH} caracteres, con mayúscula, minúscula y número.`;

export const matchesRule = (getOther: () => string, message = 'Las contraseñas no coinciden.') => [
  (value: string) => value === getOther() || message,
];
