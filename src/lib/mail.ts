// E-Mail-Versand mit drei Backends, in Reihenfolge der Verfügbarkeit:
// 1. Resend (env.RESEND_API_KEY) — production (DSGVO via EU-Region)
// 2. Cloudflare MAILER (env.MAILER) — wenn binding verfügbar
// 3. console.log — Dev-Fallback

const FROM = 'hello@mandantor.de';
const FROM_NAME = 'Mandantor';

type Backend = 'resend' | 'cloudflare' | 'logged';

async function sendViaResend(
  apiKey: string,
  toEmail: string,
  subject: string,
  text: string,
): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${FROM_NAME} <${FROM}>`,
      to: [toEmail],
      subject,
      text,
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
  subject: string,
  text: string,
): Promise<void> {
  const { EmailMessage } = await import('cloudflare:email' as any);
  const date = new Date().toUTCString();
  const headers = [
    `From: ${FROM_NAME} <${FROM}>`,
    `To: ${toEmail}`,
    `Subject: ${subject}`,
    `Date: ${date}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
  ];
  const mime = headers.join('\r\n') + '\r\n\r\n' + text;
  const msg = new EmailMessage(FROM, toEmail, mime);
  await mailer.send(msg);
}

async function sendEmail(
  env: Env,
  toEmail: string,
  subject: string,
  text: string,
  context: string,
): Promise<{ delivered: Backend }> {
  const apiKey = (env as any).RESEND_API_KEY as string | undefined;
  if (apiKey) {
    await sendViaResend(apiKey, toEmail, subject, text);
    return { delivered: 'resend' };
  }
  if (env.MAILER) {
    await sendViaCloudflareMailer(env.MAILER, toEmail, subject, text);
    return { delivered: 'cloudflare' };
  }
  console.log(`[mail:fallback] ${context} | To: ${toEmail} | Subject: ${subject}`);
  console.log(`[mail:fallback] Body:\n${text}`);
  return { delivered: 'logged' };
}

function magicLinkBody(magicUrl: string): string {
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

export async function sendMagicLinkEmail(
  env: Env,
  toEmail: string,
  magicUrl: string,
): Promise<{ delivered: Backend }> {
  return sendEmail(env, toEmail, 'Mandantor — Anmeldelink', magicLinkBody(magicUrl), 'magic-link');
}

function submissionBody(
  mandantName: string,
  caseLabel: string | null,
  akteUrl: string,
): string {
  const labelLine = caseLabel ? `Akte: ${caseLabel}` : 'Akte ohne Bezeichnung';
  return [
    'Hallo,',
    '',
    `${mandantName} hat das Mandanten-Onboarding abgeschlossen und die Daten übermittelt.`,
    '',
    labelLine,
    '',
    'Zur Akte:',
    akteUrl,
    '',
    'Sie finden dort die Stammdaten, die unterzeichneten Bestätigungen mit Audit-Trail',
    'sowie alle hochgeladenen Dokumente.',
    '',
    '—',
    'Mandantor',
    'mandantor.de',
  ].join('\r\n');
}

export async function sendSubmissionNotificationEmail(
  env: Env,
  toEmail: string,
  mandantName: string,
  caseLabel: string | null,
  akteUrl: string,
): Promise<{ delivered: Backend }> {
  const labelPart = caseLabel ? `Akte ${caseLabel}` : 'Akte';
  return sendEmail(
    env,
    toEmail,
    `Mandantor — Neue Daten in ${labelPart}`,
    submissionBody(mandantName, caseLabel, akteUrl),
    'submission-notification',
  );
}

function mandantInviteBody(
  kanzleiName: string,
  inviteUrl: string,
  caseLabel: string | null,
): string {
  const caseLine = caseLabel ? `\nBetreff: ${caseLabel}` : '';
  return [
    'Sehr geehrte/r Mandant:in,',
    '',
    `die Kanzlei ${kanzleiName} hat ein digitales Mandanten-Onboarding für Sie vorbereitet.${caseLine}`,
    '',
    'Über folgenden Link tragen Sie Ihre Stammdaten ein, bestätigen Vollmacht,',
    'Datenschutz und Honorarvereinbarung und laden bei Bedarf Dokumente hoch:',
    '',
    inviteUrl,
    '',
    'Sie können den Link mehrfach öffnen und die Bearbeitung jederzeit fortsetzen,',
    'solange noch nicht abgeschickt wurde. Die Übertragung erfolgt verschlüsselt.',
    '',
    `Bei Fragen wenden Sie sich direkt an die Kanzlei ${kanzleiName}.`,
    '',
    '—',
    'Mandantor',
    'mandantor.de',
  ].join('\r\n');
}

export async function sendMandantInviteEmail(
  env: Env,
  toMandant: string,
  kanzleiName: string,
  inviteUrl: string,
  caseLabel: string | null,
): Promise<{ delivered: Backend }> {
  return sendEmail(
    env,
    toMandant,
    `${kanzleiName} — Ihr Mandanten-Onboarding`,
    mandantInviteBody(kanzleiName, inviteUrl, caseLabel),
    'mandant-invite',
  );
}
