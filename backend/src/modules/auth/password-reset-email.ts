import type { MailMessage } from '../../core/mailer.js';

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

/** Correo con el enlace de restablecimiento (texto plano + HTML sencillo). */
export function passwordResetEmail(input: {
  to: string;
  fullName: string;
  link: string;
  minutes: number;
}): MailMessage {
  const name = input.fullName.split(' ')[0] ?? input.fullName;
  const subject = 'Restablece tu contraseña · Gestor de Tareas Operativas';
  const text = [
    `Hola, ${name}:`,
    '',
    'Recibimos una solicitud para restablecer la contraseña de tu cuenta.',
    `Usa este enlace en los próximos ${String(input.minutes)} minutos (sirve una sola vez):`,
    input.link,
    '',
    'Si no la solicitaste, ignora este correo: tu contraseña actual sigue funcionando.',
  ].join('\n');
  const html = `<!doctype html>
<html lang="es"><body style="font-family:Arial,sans-serif;color:#1f2933;line-height:1.5">
  <p>Hola, ${escapeHtml(name)}:</p>
  <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta en el
     <strong>Gestor de Tareas Operativas</strong>.</p>
  <p><a href="${escapeHtml(input.link)}"
        style="display:inline-block;background:#0473b9;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">
     Crear una contraseña nueva</a></p>
  <p style="font-size:13px;color:#52606d">El enlace vence en ${String(input.minutes)} minutos y sirve una sola vez.
     Si no lo solicitaste, ignora este correo: tu contraseña actual sigue funcionando.</p>
</body></html>`;
  return { to: input.to, subject, text, html };
}
