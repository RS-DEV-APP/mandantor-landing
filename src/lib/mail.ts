// @ts-expect-error — provided by Cloudflare Workers runtime
import { EmailMessage } from 'cloudflare:email';

const FROM = 'hello@mandantor.de';
const FROM_NAME = 'Mandantor';

function buildMime(toEmail: string, subject: string, body: string): string {
  const date = new Date().toUTCString();
  const headers = [
    `From: ${FROM_NAME} <${FROM}>`,
    `To: ${toEmail}`,
    `Subject: ${encodeMimeHeader(subject)}`,
    `Date: ${date}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
  ];
  return headers.join('\r\n') + '\r\n\r\n' + body;
}

function encodeMimeHeader(value: string): string {
  // RFC 2047 encoded-word for non-ASCII subject; safe ASCII passes through.
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  const encoded = btoa(unescape(encodeURIComponent(value)));
  return `=?utf-8?B?${encoded}?=`;
}

export async function sendMagicLinkEmail(
  env: Env,
  toEmail: string,
  magicUrl: string,
): Promise<void> {
  if (!env.MAILER) {
    throw new Error('MAILER binding missing — configure send_email binding in Pages settings');
  }

  const subject = 'Mandantor — Anmeldelink';
  const body = [
    'Hallo,',
    '',
    'klicken Sie auf den folgenden Link, um sich bei Mandantor anzumelden:',
    '',
    magicUrl,
    '',
    'Der Link ist 15 Minuten gültig und nur einmal verwendbar.',
    '',
    'Falls Sie diese Anmeldung nicht angefordert haben, ignorieren Sie diese E-Mail.',
    '',
    '—',
    'Mandantor',
    'mandantor.de',
  ].join('\r\n');

  const mime = buildMime(toEmail, subject, body);
  const msg = new EmailMessage(FROM, toEmail, mime);
  await env.MAILER.send(msg);
}
