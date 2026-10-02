import { describe, expect, it } from 'vitest';
import { passwordResetEmail } from '../../src/modules/auth/password-reset-email.js';

const LINK = 'http://localhost:8080/reset-password?token=abc_DEF-123';

describe('passwordResetEmail', () => {
  const mail = passwordResetEmail({
    to: 'laura@fastco.test',
    fullName: 'Laura Cristina Gómez',
    link: LINK,
    minutes: 30,
  });

  it('saluda por el primer nombre e incluye el enlace y el vencimiento en texto y HTML', () => {
    expect(mail.to).toBe('laura@fastco.test');
    expect(mail.subject).toContain('Restablece tu contraseña');
    expect(mail.text).toContain('Hola, Laura:');
    expect(mail.text).toContain(LINK);
    expect(mail.text).toContain('30 minutos');
    expect(mail.html).toContain('Hola, Laura');
    expect(mail.html).toContain(`href="${LINK}"`);
    expect(mail.html).toContain('Crear una contraseña nueva');
  });

  it('escapa el nombre: no se puede inyectar HTML en el correo', () => {
    const evil = passwordResetEmail({
      to: 'x@fastco.test',
      fullName: '<script>alert(1)</script> Pérez',
      link: LINK,
      minutes: 30,
    });

    expect(evil.html).not.toContain('<script>');
    expect(evil.html).toContain('&lt;script&gt;');
  });
});
