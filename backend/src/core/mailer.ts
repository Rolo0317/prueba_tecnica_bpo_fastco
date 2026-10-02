import nodemailer, { type Transporter } from 'nodemailer';
import type { Logger } from 'pino';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Envío de correo. Se inyecta para poder reemplazarlo en pruebas. */
export interface MailSender {
  send(message: MailMessage): Promise<void>;
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string | undefined;
  password: string | undefined;
  from: string;
}

export class SmtpMailSender implements MailSender {
  private readonly transport: Transporter;

  constructor(private readonly config: SmtpConfig) {
    this.transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      ...(config.user && { auth: { user: config.user, pass: config.password ?? '' } }),
    });
  }

  async send(message: MailMessage): Promise<void> {
    await this.transport.sendMail({ from: this.config.from, ...message });
  }
}

/** Sin SMTP configurado: no envía nada y deja constancia en el log (sin el contenido). */
export class DisabledMailSender implements MailSender {
  constructor(private readonly logger: Logger) {}

  send(message: MailMessage): Promise<void> {
    this.logger.warn(
      { subject: message.subject },
      'Correo no enviado: SMTP_HOST no está configurado',
    );
    return Promise.resolve();
  }
}
