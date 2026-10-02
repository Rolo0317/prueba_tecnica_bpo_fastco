import type { MailMessage } from '../../core/mailer.js';

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

/** Paleta de la aplicación (misma que el tema claro de Vuetify). */
const COLOR = {
  primary: '#0473b9',
  primaryDark: '#26739e',
  accent: '#f59e15',
  background: '#f3f9f6',
  text: '#1f2933',
  muted: '#52606d',
  border: '#d9e2ec',
} as const;

const FONT = "'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/**
 * Correo con el enlace de restablecimiento: texto plano + HTML.
 * El HTML usa tablas y estilos en línea (lo que respetan Gmail, Outlook y Apple Mail),
 * ancho máximo de 600 px y un botón "a prueba de balas" que funciona sin imágenes.
 */
export function passwordResetEmail(input: {
  to: string;
  fullName: string;
  link: string;
  minutes: number;
}): MailMessage {
  const name = input.fullName.trim().split(/\s+/)[0] ?? input.fullName;
  const minutes = String(input.minutes);
  const subject = 'Restablece tu contraseña · Gestor de Tareas Operativas';
  const text = [
    `Hola, ${name}:`,
    '',
    'Recibimos una solicitud para restablecer la contraseña de tu cuenta en el Gestor de Tareas Operativas.',
    `Usa este enlace en los próximos ${minutes} minutos (sirve una sola vez):`,
    input.link,
    '',
    'Si no la solicitaste, ignora este correo: tu contraseña actual sigue funcionando y nadie más puede usar el enlace.',
    '',
    'Gestor de Tareas Operativas · Este es un mensaje automático, no lo respondas.',
  ].join('\n');

  const safeName = escapeHtml(name);
  const safeLink = escapeHtml(input.link);

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${COLOR.background};-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${COLOR.background};">
    Crea una contraseña nueva. El enlace vence en ${minutes} minutos y sirve una sola vez.
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLOR.background};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">
          <tr>
            <td style="background:${COLOR.primary};border-radius:16px 16px 0 0;padding:28px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="44" valign="middle" style="width:44px;">
                    <div style="width:44px;height:44px;line-height:44px;border-radius:50%;background:#ffffff;text-align:center;font-family:${FONT};font-size:22px;font-weight:800;color:${COLOR.accent};">T</div>
                  </td>
                  <td style="padding-left:14px;font-family:${FONT};">
                    <div style="font-size:18px;font-weight:700;color:#ffffff;line-height:1.2;">Gestor de Tareas Operativas</div>
                    <div style="font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#cfe6f5;padding-top:4px;">Seguridad de la cuenta</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;padding:36px 32px 12px;font-family:${FONT};color:${COLOR.text};">
              <h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;color:${COLOR.primaryDark};">Hola, ${safeName}</h1>
              <p style="margin:0 0 16px;font-size:16px;line-height:1.6;">
                Recibimos una solicitud para <strong>restablecer la contraseña</strong> de tu cuenta.
                Haz clic en el botón para crear una nueva:
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0;">
                <tr>
                  <td align="center" bgcolor="${COLOR.primary}" style="border-radius:10px;">
                    <a href="${safeLink}" target="_blank" rel="noopener"
                       style="display:inline-block;padding:15px 32px;font-family:${FONT};font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">
                      Crear una contraseña nueva
                    </a>
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background:#fff7e8;border-left:4px solid ${COLOR.accent};border-radius:6px;padding:14px 16px;font-size:14px;line-height:1.5;color:${COLOR.text};">
                    &#9201;&nbsp; El enlace vence en <strong>${minutes} minutos</strong> y sirve <strong>una sola vez</strong>.
                    Al usarlo se cierran las sesiones abiertas de tu cuenta.
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 8px;font-size:13px;line-height:1.5;color:${COLOR.muted};">
                ¿El botón no funciona? Copia y pega este enlace en tu navegador:
              </p>
              <p style="margin:0 0 24px;font-size:13px;line-height:1.5;word-break:break-all;">
                <a href="${safeLink}" style="color:${COLOR.primary};">${safeLink}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;padding:0 32px 32px;font-family:${FONT};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${COLOR.border};">
                <tr>
                  <td style="padding-top:20px;font-size:13px;line-height:1.6;color:${COLOR.muted};">
                    <strong style="color:${COLOR.text};">¿No fuiste tú?</strong> Ignora este correo: tu contraseña
                    actual sigue funcionando y nadie más puede usar este enlace.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background:#eaf3f9;border-radius:0 0 16px 16px;padding:18px 32px;font-family:${FONT};font-size:12px;line-height:1.5;color:${COLOR.muted};text-align:center;">
              Gestor de Tareas Operativas &middot; Mensaje automático, por favor no lo respondas.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { to: input.to, subject, text, html };
}
