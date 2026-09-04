import nodemailer, { Transporter } from 'nodemailer';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';

export interface SendEmailPayload {
  fromName: string;
  fromEmail: string;
  to: string;
  subject: string;
  body: string;
}

export interface SendEmailResult {
  messageId: string;
  previewUrl?: string | false;
}

let transporterInstance: Transporter | null = null;

export async function getTransporter(): Promise<Transporter> {
  if (transporterInstance) {
    return transporterInstance;
  }

  // If user and password are provided in env, use them
  if (env.ETHEREAL_USER && env.ETHEREAL_PASSWORD) {
    transporterInstance = nodemailer.createTransport({
      host: env.ETHEREAL_HOST,
      port: env.ETHEREAL_PORT,
      secure: env.ETHEREAL_PORT === 465,
      auth: {
        user: env.ETHEREAL_USER,
        pass: env.ETHEREAL_PASSWORD,
      },
    });
    logger.info(`Initialized Nodemailer with configured Ethereal credentials (${env.ETHEREAL_USER})`);
    return transporterInstance;
  }

  // Auto-generate test account if none provided in env
  logger.info('No Ethereal credentials found in environment. Generating dynamic test account...');
  const testAccount = await nodemailer.createTestAccount();
  transporterInstance = nodemailer.createTransport({
    host: testAccount.smtp.host,
    port: testAccount.smtp.port,
    secure: testAccount.smtp.secure,
    auth: {
      user: testAccount.user,
      pass: testAccount.pass,
    },
  });

  logger.info('Generated Ethereal test account:', {
    user: testAccount.user,
    pass: testAccount.pass,
    webUrl: testAccount.web,
  });

  return transporterInstance;
}

export async function sendEmail(payload: SendEmailPayload): Promise<SendEmailResult> {
  const transporter = await getTransporter();

  const info = await transporter.sendMail({
    from: `"${payload.fromName}" <${payload.fromEmail}>`,
    to: payload.to,
    subject: payload.subject,
    text: payload.body,
    html: `<p>${payload.body.replace(/\n/g, '<br/>')}</p>`,
  });

  const previewUrl = nodemailer.getTestMessageUrl(info);
  if (previewUrl) {
    logger.info(`Ethereal email preview URL: ${previewUrl}`);
  }

  return {
    messageId: info.messageId,
    previewUrl,
  };
}
