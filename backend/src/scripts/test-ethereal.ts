import { sendEmail } from '../integrations/mailer/mailer.service.js';

async function main() {
  console.log('Sending test email via Ethereal SMTP...');
  const result = await sendEmail({
    fromName: 'PreachInbox Dispatcher',
    fromEmail: 'outbox@preachinbox.test',
    to: 'lead-candidate@enterprise.com',
    subject: 'PreachInbox Scheduling - Ethereal Verification',
    body: 'This email verifies that the Nodemailer + Ethereal SMTP pipeline is working flawlessly!',
  });

  console.log('\nSUCCESS! Email Delivered.');
  console.log('Message ID:', result.messageId);
  console.log('Preview URL:', result.previewUrl);
}

main().catch((err) => {
  console.error('Failed to send test email:', err);
  process.exit(1);
});
