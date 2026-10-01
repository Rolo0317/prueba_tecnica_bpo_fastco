/**
 * Solo permite redirigir a rutas internas de la app tras el login
 * (evita "open redirect" hacia sitios externos como //malicioso.com).
 */
export function safeRedirect(target: unknown, fallback = '/tasks'): string {
  if (typeof target !== 'string') return fallback;
  const isInternalPath =
    target.startsWith('/') && !target.startsWith('//') && !target.includes('\\');
  return isInternalPath ? target : fallback;
}
