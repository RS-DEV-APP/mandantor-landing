// E-Mail-Versand mit drei Backends, in Reihenfolge der Verfügbarkeit:
// 1. Resend (env.RESEND_API_KEY) — production (DSGVO via EU-Region)
// 2. Cloudflare MAILER (env.MAILER) — wenn binding verfügbar
// 3. console.log — Dev-Fallback, Magic-Link landet in Cloudflare Functions Logs

const FROM = 'hello@mandantor.de';
const FROM_NAME = 'Mandantor';

const SUBJECT = 'Mandantor — Anmeldelink';

function bodyText(magicUrl: string): string {
  return [
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
}

async function sendViaResend(apiKey: string, toEmail: string, magicUrl: string): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${FROM_NAME} <${FROM}>`,
      to: [toEmail],
      subject: SUBJECT,
      text: bodyText(magicUrl),
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Resend ${res.status}: ${detail}`);
  }
}

async function sendViaCloudflareMailer(
  mailer: NonNullable<Env['MAILER']>,
  toEmail: string,
  magicUrl: string,
): Promise<void> {
  // dynamic import so this runs only when the binding is present
  const { EmailMessage } = await import('cloudflare:email' as any);
  const date = new Date().toUTCString();
  const headers = [
    `From: ${FROM_NAME} <${FROM}>`,
    `To: ${toEmail}`,
    `Subject: ${SUBJECT}`,
    `Date: ${date}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
  ];
  const mime = headers.join('\r\n') + '\r\n\r\n' + bodyText(magicUrl);
  const msg = new EmailMessage(FROM, toEmail, mime);
  await mailer.send(msg);
}

export async function sendMagicLinkEmail(
  env: Env,
  toEmail: string,
  magicUrl: string,
): Promise<{ delivered: 'resend' | 'cloudflare' | 'logged' }> {
  const apiKey = (env as any).RESEND_API_KEY as string | undefined;
  if (apiKey) {
    await sendViaResend(apiKey, toEmail, magicUrl);
    return { delivered: 'resend' };
  }

  if (env.MAILER) {
    await sendViaCloudflareMailer(env.MAILER, toEmail, magicUrl);
    return { delivered: 'cloudflare' };
  }

  // Dev-Fallback: Magic-Link in Functions Logs ausgeben.
  console.log('[mail:fallback] No mail backend configured.');
  console.log(`[mail:fallback] To: ${toEmail}`);
  console.log(`[mail:fallback] Magic link: ${magicUrl}`);
  return { delivered: 'logged' };
}
