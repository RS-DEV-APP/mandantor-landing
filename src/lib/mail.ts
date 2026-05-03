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
  html: string | null,
): Promise<void> {
  const payload: Record<string, unknown> = {
    from: `${FROM_NAME} <${FROM}>`,
    to: [toEmail],
    subject,
    text,
  };
  if (html) payload.html = html;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
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
  html: string | null = null,
): Promise<{ delivered: Backend }> {
  const apiKey = (env as any).RESEND_API_KEY as string | undefined;
  if (apiKey) {
    await sendViaResend(apiKey, toEmail, subject, text, html);
    return { delivered: 'resend' };
  }
  if (env.MAILER) {
    // Cloudflare-Mailer-Fallback bleibt plain-text — HTML-multipart-MIME wäre eigene Iteration.
    await sendViaCloudflareMailer(env.MAILER, toEmail, subject, text);
    return { delivered: 'cloudflare' };
  }
  console.log(`[mail:fallback] ${context} | To: ${toEmail} | Subject: ${subject}`);
  console.log(`[mail:fallback] Body:\n${text}`);
  return { delivered: 'logged' };
}

// ── HTML Layout helper ──────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function nl2br(s: string): string {
  return escapeHtml(s).replace(/\n/g, '<br/>');
}

export type HtmlLayoutOptions = {
  preheader?: string;            // hidden preview text (Inbox-Snippet)
  logoUrl?: string | null;       // absolute URL, e.g. https://mandantor.de/api/kanzlei/<id>/logo
  brandName: string;             // displayed when no logo, fallback header
  accentColor?: string | null;   // hex like '#B8956A'; default Mandantor-gold
  bodyHtml: string;              // already-escaped HTML body
  footerHtml?: string;           // optional override; default = Mandantor-Footer
};

export function buildHtmlEmail(opts: HtmlLayoutOptions): string {
  const accent = opts.accentColor && /^#[0-9a-fA-F]{6}$/.test(opts.accentColor)
    ? opts.accentColor
    : '#B8956A';
  const preheader = opts.preheader ? escapeHtml(opts.preheader) : '';
  const headerLogo = opts.logoUrl
    ? `<img src="${escapeHtml(opts.logoUrl)}" alt="${escapeHtml(opts.brandName)}" style="max-height:48px;max-width:200px;" />`
    : `<span style="font-family:Georgia,serif;font-size:22px;color:#0F172A;letter-spacing:-0.01em;">${escapeHtml(opts.brandName)}</span>`;
  const footer = opts.footerHtml ?? `
    <p style="margin:0 0 8px;color:#666;font-size:12px;line-height:1.5;">
      Diese E-Mail kommt von <a href="https://mandantor.de" style="color:#666;">Mandantor</a> — dem digitalen
      Mandanten-Onboarding-Portal für Anwaltskanzleien in Deutschland.
    </p>
    <p style="margin:0;color:#999;font-size:11px;">
      <a href="https://mandantor.de/impressum" style="color:#999;">Impressum</a>
      &nbsp;·&nbsp;
      <a href="https://mandantor.de/datenschutz" style="color:#999;">Datenschutz</a>
    </p>
  `;

  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${escapeHtml(opts.brandName)}</title>
</head>
<body style="margin:0;padding:0;background:#f5f3ee;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0F172A;">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>` : ''}
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f5f3ee;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background:#ffffff;border:1px solid #e6e0d4;">
          <tr>
            <td style="padding:32px 32px 16px 32px;border-bottom:3px solid ${accent};">
              ${headerLogo}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px;font-size:15px;line-height:1.6;color:#1f2937;">
              ${opts.bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #e6e0d4;background:#fafaf7;">
              ${footer}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function ctaButtonHtml(href: string, label: string, accentColor?: string | null): string {
  const accent = accentColor && /^#[0-9a-fA-F]{6}$/.test(accentColor) ? accentColor : '#0F172A';
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
    <tr>
      <td style="background:${accent};border-radius:2px;">
        <a href="${escapeHtml(href)}" style="display:inline-block;padding:14px 28px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:500;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">${escapeHtml(label)}</a>
      </td>
    </tr>
  </table>`;
}

export function paragraphHtml(text: string): string {
  return `<p style="margin:0 0 16px;color:#1f2937;font-size:15px;line-height:1.6;">${nl2br(text)}</p>`;
}

export function smallHtml(text: string): string {
  return `<p style="margin:16px 0 0;color:#666;font-size:13px;line-height:1.5;">${nl2br(text)}</p>`;
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
  const html = buildHtmlEmail({
    preheader: 'Ihr Anmeldelink für Mandantor — 15 Minuten gültig.',
    brandName: 'Mandantor',
    bodyHtml: `
      ${paragraphHtml('Hallo,')}
      ${paragraphHtml('klicken Sie auf den folgenden Button, um sich bei Mandantor anzumelden:')}
      ${ctaButtonHtml(magicUrl, 'Bei Mandantor anmelden')}
      ${smallHtml('Der Link ist 15 Minuten gültig und nur einmal verwendbar. Falls der Button nicht funktioniert, kopieren Sie diese URL in den Browser:')}
      <p style="margin:8px 0 0;font-family:monospace;font-size:11px;color:#666;word-break:break-all;">${escapeHtml(magicUrl)}</p>
      ${smallHtml('Falls Sie diese Anmeldung nicht angefordert haben, ignorieren Sie diese E-Mail.')}
    `,
  });
  return sendEmail(env, toEmail, 'Mandantor — Anmeldelink', magicLinkBody(magicUrl), 'magic-link', html);
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
  const html = buildHtmlEmail({
    preheader: `${mandantName} hat das Onboarding abgeschlossen.`,
    brandName: 'Mandantor',
    bodyHtml: `
      ${paragraphHtml('Hallo,')}
      ${paragraphHtml(`${mandantName} hat das Mandanten-Onboarding abgeschlossen und die Daten übermittelt.`)}
      ${caseLabel ? `<p style="margin:0 0 16px;padding:12px 16px;background:#fafaf7;border-left:3px solid #B8956A;font-size:14px;color:#555;"><strong>Akte:</strong> ${escapeHtml(caseLabel)}</p>` : ''}
      ${ctaButtonHtml(akteUrl, 'Akte öffnen')}
      ${smallHtml('Sie finden dort die Stammdaten, die unterzeichneten Bestätigungen mit Audit-Trail sowie alle hochgeladenen Dokumente.')}
    `,
  });
  return sendEmail(
    env,
    toEmail,
    `Mandantor — Neue Daten in ${labelPart}`,
    submissionBody(mandantName, caseLabel, akteUrl),
    'submission-notification',
    html,
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

export type MandantBranding = {
  logoUrl?: string | null;     // absolut, z.B. https://mandantor.de/api/kanzlei/<id>/logo
  accentColor?: string | null; // hex
};

export async function sendMandantInviteEmail(
  env: Env,
  toMandant: string,
  kanzleiName: string,
  inviteUrl: string,
  caseLabel: string | null,
  branding: MandantBranding = {},
): Promise<{ delivered: Backend }> {
  const html = buildHtmlEmail({
    preheader: `${kanzleiName} hat ein Onboarding für Sie vorbereitet.`,
    brandName: kanzleiName,
    logoUrl: branding.logoUrl,
    accentColor: branding.accentColor,
    bodyHtml: `
      ${paragraphHtml('Sehr geehrte/r Mandant:in,')}
      ${paragraphHtml(`die Kanzlei ${kanzleiName} hat ein digitales Mandanten-Onboarding für Sie vorbereitet.`)}
      ${caseLabel ? `<p style="margin:0 0 16px;padding:12px 16px;background:#fafaf7;border-left:3px solid #B8956A;font-size:14px;color:#555;"><strong>Betreff:</strong> ${escapeHtml(caseLabel)}</p>` : ''}
      ${paragraphHtml('Über folgenden Link tragen Sie Ihre Stammdaten ein, bestätigen Vollmacht, Datenschutz und Honorarvereinbarung und laden bei Bedarf Dokumente hoch:')}
      ${ctaButtonHtml(inviteUrl, 'Onboarding starten', branding.accentColor)}
      ${smallHtml('Sie können den Link mehrfach öffnen und die Bearbeitung jederzeit fortsetzen, solange noch nicht abgeschickt wurde. Die Übertragung erfolgt verschlüsselt.')}
      ${smallHtml(`Bei Fragen wenden Sie sich direkt an die Kanzlei ${kanzleiName}.`)}
    `,
  });
  return sendEmail(
    env,
    toMandant,
    `${kanzleiName} — Ihr Mandanten-Onboarding`,
    mandantInviteBody(kanzleiName, inviteUrl, caseLabel),
    'mandant-invite',
    html,
  );
}

function mandantConfirmationBody(
  kanzleiName: string,
  caseLabel: string | null,
): string {
  const caseLine = caseLabel ? `\nBetreff: ${caseLabel}` : '';
  return [
    'Sehr geehrte/r Mandant:in,',
    '',
    `vielen Dank — Ihre Angaben sind bei der Kanzlei ${kanzleiName} eingegangen.${caseLine}`,
    '',
    'Die Kanzlei meldet sich bei Ihnen, sobald die Bearbeitung beginnt oder',
    'Rückfragen bestehen. Bis dahin sind keine weiteren Schritte erforderlich.',
    '',
    'Eine Kopie Ihrer Bestätigungen (Vollmacht, Datenschutz, Honorarvereinbarung)',
    `wurde der Kanzlei zur Aktenführung zugestellt. Bei Fragen wenden Sie sich`,
    `direkt an die Kanzlei ${kanzleiName}.`,
    '',
    '—',
    'Mandantor',
    'mandantor.de',
  ].join('\r\n');
}

export async function sendMandantConfirmationEmail(
  env: Env,
  toMandant: string,
  kanzleiName: string,
  caseLabel: string | null,
  branding: MandantBranding = {},
): Promise<{ delivered: Backend }> {
  const html = buildHtmlEmail({
    preheader: 'Ihre Angaben sind bei der Kanzlei eingegangen.',
    brandName: kanzleiName,
    logoUrl: branding.logoUrl,
    accentColor: branding.accentColor,
    bodyHtml: `
      ${paragraphHtml('Sehr geehrte/r Mandant:in,')}
      ${paragraphHtml(`vielen Dank — Ihre Angaben sind bei der Kanzlei ${kanzleiName} eingegangen.`)}
      ${caseLabel ? `<p style="margin:0 0 16px;padding:12px 16px;background:#fafaf7;border-left:3px solid #B8956A;font-size:14px;color:#555;"><strong>Betreff:</strong> ${escapeHtml(caseLabel)}</p>` : ''}
      ${paragraphHtml('Die Kanzlei meldet sich bei Ihnen, sobald die Bearbeitung beginnt oder Rückfragen bestehen. Bis dahin sind keine weiteren Schritte erforderlich.')}
      ${smallHtml(`Eine Kopie Ihrer Bestätigungen (Vollmacht, Datenschutz, Honorarvereinbarung) wurde der Kanzlei zur Aktenführung zugestellt. Bei Fragen wenden Sie sich direkt an die Kanzlei ${kanzleiName}.`)}
    `,
  });
  return sendEmail(
    env,
    toMandant,
    `${kanzleiName} — Bestätigung Ihrer Angaben`,
    mandantConfirmationBody(kanzleiName, caseLabel),
    'mandant-confirmation',
    html,
  );
}

function teamInviteBody(
  kanzleiName: string,
  inviterName: string,
  inviteUrl: string,
  role: string,
): string {
  const roleLabel = role === 'admin' ? 'Administrator:in' : 'Mitglied';
  return [
    'Hallo,',
    '',
    `${inviterName} hat Sie eingeladen, dem Mandantor-Konto der Kanzlei ${kanzleiName} als ${roleLabel} beizutreten.`,
    '',
    'Sie erhalten Zugriff auf alle Akten der Kanzlei, das Mandanten-Onboarding und je nach Rolle die Account-Verwaltung.',
    '',
    'Klicken Sie auf den folgenden Link, um die Einladung anzunehmen:',
    '',
    inviteUrl,
    '',
    'Der Link ist 14 Tage gültig und nur einmal verwendbar.',
    '',
    'Falls Sie diese Einladung nicht erwartet haben, ignorieren Sie diese E-Mail.',
    '',
    '—',
    'Mandantor',
    'mandantor.de',
  ].join('\r\n');
}

export async function sendTeamInviteEmail(
  env: Env,
  toEmail: string,
  kanzleiName: string,
  inviterName: string,
  inviteUrl: string,
  role: string,
): Promise<{ delivered: Backend }> {
  const roleLabel = role === 'admin' ? 'Administrator:in' : 'Mitglied';
  const html = buildHtmlEmail({
    preheader: `${inviterName} hat Sie zu ${kanzleiName} eingeladen.`,
    brandName: 'Mandantor',
    bodyHtml: `
      ${paragraphHtml('Hallo,')}
      ${paragraphHtml(`${inviterName} hat Sie eingeladen, dem Mandantor-Konto der Kanzlei ${kanzleiName} als ${roleLabel} beizutreten.`)}
      ${paragraphHtml('Sie erhalten Zugriff auf alle Akten der Kanzlei, das Mandanten-Onboarding und je nach Rolle die Account-Verwaltung.')}
      ${ctaButtonHtml(inviteUrl, 'Einladung annehmen')}
      ${smallHtml('Der Link ist 14 Tage gültig und nur einmal verwendbar. Falls Sie diese Einladung nicht erwartet haben, ignorieren Sie diese E-Mail.')}
    `,
  });
  return sendEmail(
    env,
    toEmail,
    `${kanzleiName} — Einladung ins Mandantor-Team`,
    teamInviteBody(kanzleiName, inviterName, inviteUrl, role),
    'team-invite',
    html,
  );
}

function reopenBody(kanzleiName: string, reason: string, inviteUrl: string): string {
  return [
    'Sehr geehrte/r Mandant:in,',
    '',
    `${kanzleiName} bittet Sie um Ergänzungen oder Korrekturen an den von Ihnen übermittelten Daten.`,
    '',
    'Anmerkung der Kanzlei:',
    reason,
    '',
    'Bitte öffnen Sie folgenden Link, passen Sie die betroffenen Schritte an und senden Sie die Akte erneut ab:',
    '',
    inviteUrl,
    '',
    '—',
    'Mandantor',
    'mandantor.de',
  ].join('\r\n');
}

export async function sendReopenRequestEmail(
  env: Env,
  toMandant: string,
  kanzleiName: string,
  reason: string,
  inviteUrl: string,
  branding: MandantBranding = {},
): Promise<{ delivered: Backend }> {
  const html = buildHtmlEmail({
    preheader: 'Bitte um Ergänzung Ihrer Mandantor-Akte.',
    brandName: kanzleiName,
    logoUrl: branding.logoUrl,
    accentColor: branding.accentColor,
    bodyHtml: `
      ${paragraphHtml('Sehr geehrte/r Mandant:in,')}
      ${paragraphHtml(`${kanzleiName} bittet Sie um Ergänzungen oder Korrekturen an den von Ihnen übermittelten Daten.`)}
      <p style="margin:16px 0;padding:16px;background:#fffaf0;border-left:4px solid #B8956A;font-size:14px;color:#1f2937;line-height:1.6;"><strong style="display:block;margin-bottom:6px;">Anmerkung der Kanzlei:</strong>${nl2br(reason)}</p>
      ${paragraphHtml('Bitte öffnen Sie den folgenden Link, passen Sie die betroffenen Schritte an und senden Sie die Akte erneut ab:')}
      ${ctaButtonHtml(inviteUrl, 'Akte öffnen', branding.accentColor)}
    `,
  });
  return sendEmail(
    env,
    toMandant,
    `${kanzleiName} — Bitte um Ergänzung Ihrer Akte`,
    reopenBody(kanzleiName, reason, inviteUrl),
    'akte-reopen',
    html,
  );
}

function reminderBody(kanzleiName: string, inviteUrl: string): string {
  return [
    'Sehr geehrte/r Mandant:in,',
    '',
    `eine kurze Erinnerung: ${kanzleiName} hat ein Mandanten-Onboarding für Sie vorbereitet, das noch nicht abgeschlossen ist.`,
    '',
    'Bitte schließen Sie die Stammdaten, Bestätigungen und ggf. Dokumenten-Uploads über folgenden Link ab:',
    '',
    inviteUrl,
    '',
    'Falls Sie das Mandat nicht weiterverfolgen möchten oder Rückfragen haben, wenden Sie sich bitte direkt an die Kanzlei.',
    '',
    '—',
    'Mandantor',
    'mandantor.de',
  ].join('\r\n');
}

export async function sendReminderEmail(
  env: Env,
  toMandant: string,
  kanzleiName: string,
  inviteUrl: string,
  branding: MandantBranding = {},
): Promise<{ delivered: Backend }> {
  const html = buildHtmlEmail({
    preheader: 'Ihr Mandanten-Onboarding ist noch offen.',
    brandName: kanzleiName,
    logoUrl: branding.logoUrl,
    accentColor: branding.accentColor,
    bodyHtml: `
      ${paragraphHtml('Sehr geehrte/r Mandant:in,')}
      ${paragraphHtml(`eine kurze Erinnerung: ${kanzleiName} hat ein Mandanten-Onboarding für Sie vorbereitet, das noch nicht abgeschlossen ist.`)}
      ${paragraphHtml('Bitte schließen Sie die Stammdaten, Bestätigungen und ggf. Dokumenten-Uploads über folgenden Link ab:')}
      ${ctaButtonHtml(inviteUrl, 'Onboarding fortsetzen', branding.accentColor)}
      ${smallHtml(`Falls Sie das Mandat nicht weiterverfolgen möchten oder Rückfragen haben, wenden Sie sich bitte direkt an die Kanzlei ${kanzleiName}.`)}
    `,
  });
  return sendEmail(
    env,
    toMandant,
    `${kanzleiName} — Erinnerung: Mandanten-Onboarding`,
    reminderBody(kanzleiName, inviteUrl),
    'akte-reminder',
    html,
  );
}
