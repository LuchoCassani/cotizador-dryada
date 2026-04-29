import nodemailer from 'nodemailer';

interface EnviarCotizacionParams {
  destinatario: string;
  numeroCotizacion: string;
  pdfBase64: string;
}

function crearTransporter() {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    // En desarrollo sin credenciales, usar Ethereal (preview de email)
    return nodemailer.createTransport({ host: 'localhost', port: 25, ignoreTLS: true });
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT ?? '587'),
    secure: false, // STARTTLS
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

export class EmailService {
  private readonly transporter = crearTransporter();

  async enviarCotizacion({ destinatario, numeroCotizacion, pdfBase64 }: EnviarCotizacionParams): Promise<void> {
    const pdfBuffer = Buffer.from(pdfBase64, 'base64');

    await this.transporter.sendMail({
      from: process.env.EMAIL_FROM ?? 'Cotizador Dryada <cotizador@dryada.com>',
      to: destinatario,
      subject: `Cotización Dryada #${numeroCotizacion}`,
      text: `Adjunto encontrás la cotización #${numeroCotizacion} generada por el equipo de Dryada.`,
      attachments: [
        {
          filename: `cotizacion-dryada-${numeroCotizacion}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });
  }
}
