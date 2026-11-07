// Emails the shop when a customer sends an enquiry. It stays switched off until SMTP settings
// are added, and a mail problem must never stop an enquiry from being saved.

const nodemailer = require('nodemailer');

const oneLine = (value) => String(value ?? '').replace(/[\r\n]+/g, ' ').trim();

function createNotifier(env = process.env, mailer = nodemailer) {
  const { SMTP_HOST, SMTP_USER, SMTP_PASS, ALERT_EMAIL } = env;
  const enabled = Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS && ALERT_EMAIL);

  const notify = async (enquiry) => {
    if (!enabled) return;
    const port = Number(env.SMTP_PORT) || 465;
    const transport = mailer.createTransport({
      host: SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
    await transport.sendMail({
      from: env.ALERT_FROM || SMTP_USER,
      to: ALERT_EMAIL,
      subject: `New enquiry from ${oneLine(enquiry.name).slice(0, 80)}`,
      text: [
        `Name: ${oneLine(enquiry.name)}`,
        `Phone: ${oneLine(enquiry.phone)}`,
        `Service: ${oneLine(enquiry.service) || 'Not given'}`,
        '',
        String(enquiry.message ?? '') || 'No message.',
      ].join('\n'),
    });
  };
  notify.enabled = enabled;
  return notify;
}

module.exports = { createNotifier };
