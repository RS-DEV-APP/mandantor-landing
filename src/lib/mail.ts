// E-Mail-Versand mit drei Backends, in Reihenfolge der Verfügbarkeit:
// 1. Resend (env.RESEND_API_KEY) — production (DSGVO via EU-Region)
// 2. Cloudflare MAILER (env.MAILER) — wenn binding verfügbar
// 3. console.log — Dev-Fallback

import { i18n, type Lang } from './i18n';

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
  kanzleiLinks?: { impressum_url?: string | null; datenschutz_url?: string | null } | null;
  lang?: Lang;
};

export function buildHtmlEmail(opts: HtmlLayoutOptions): string {
  const accent = opts.accentColor && /^#[0-9a-fA-F]{6}$/.test(opts.accentColor)
    ? opts.accentColor
    : '#B8956A';
  const preheader = opts.preheader ? escapeHtml(opts.preheader) : '';
  const headerLogo = opts.logoUrl
    ? `<img src="${escapeHtml(opts.logoUrl)}" alt="${escapeHtml(opts.brandName)}" style="max-height:48px;max-width:200px;" />`
    : `<span style="font-family:Georgia,serif;font-size:22px;color:#0F172A;letter-spacing:-0.01em;">${escapeHtml(opts.brandName)}</span>`;
  const lang: Lang = opts.lang ?? 'de';
  const labels = lang === 'en'
    ? { imprint: 'Imprint', privacy: 'Privacy', poweredBy: 'Powered by Mandantor — digital client onboarding for German law firms.' }
    : { imprint: 'Impressum', privacy: 'Datenschutz', poweredBy: 'Powered by Mandantor — digitales Mandanten-Onboarding für Anwaltskanzleien in Deutschland.' };
  const kanzleiLinkLine = opts.kanzleiLinks && (opts.kanzleiLinks.impressum_url || opts.kanzleiLinks.datenschutz_url)
    ? `<p style="margin:0 0 8px;color:#666;font-size:12px;">
        ${opts.kanzleiLinks.impressum_url ? `<a href="${escapeHtml(opts.kanzleiLinks.impressum_url)}" style="color:#666;">${labels.imprint}</a>` : ''}
        ${opts.kanzleiLinks.impressum_url && opts.kanzleiLinks.datenschutz_url ? '&nbsp;·&nbsp;' : ''}
        ${opts.kanzleiLinks.datenschutz_url ? `<a href="${escapeHtml(opts.kanzleiLinks.datenschutz_url)}" style="color:#666;">${labels.privacy}</a>` : ''}
      </p>`
    : '';
  const footer = opts.footerHtml ?? `
    ${kanzleiLinkLine}
    <p style="margin:0 0 8px;color:#666;font-size:12px;line-height:1.5;">
      ${labels.poweredBy}
    </p>
    ${opts.kanzleiLinks ? '' : `<p style="margin:0;color:#999;font-size:11px;">
      <a href="https://mandantor.de/impressum" style="color:#999;">${labels.imprint}</a>
      &nbsp;·&nbsp;
      <a href="https://mandantor.de/datenschutz" style="color:#999;">${labels.privacy}</a>
    </p>`}
  `;

  return `<!doctype html>
<html lang="${lang}">
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

// Benachrichtigung an die Kanzlei: Mandant hat eine neue Nachricht im Chat geschickt.
export async function sendNewMandantMessageNotification(
  env: Env,
  toEmail: string,
  mandantName: string,
  caseLabel: string | null,
  bodyPreview: string,
  akteUrl: string,
): Promise<{ delivered: Backend }> {
  const labelPart = caseLabel ? `Akte ${caseLabel}` : 'Akte';
  const subject = `Mandantor — Neue Nachricht von ${mandantName}`;
  const text = [
    'Hallo,',
    '',
    `${mandantName} hat im Mandantor-Portal eine neue Nachricht hinterlassen.`,
    '',
    labelPart,
    '',
    'Auszug:',
    bodyPreview,
    '',
    'Direkt zur Akte:',
    akteUrl,
    '',
    '—',
    'Mandantor',
    'mandantor.de',
  ].join('\r\n');
  const html = buildHtmlEmail({
    preheader: `${mandantName} hat eine neue Nachricht hinterlassen.`,
    brandName: 'Mandantor',
    bodyHtml: `
      ${paragraphHtml('Hallo,')}
      ${paragraphHtml(`${mandantName} hat im Mandantor-Portal eine neue Nachricht hinterlassen.`)}
      ${caseLabel ? `<p style="margin:0 0 16px;padding:12px 16px;background:#fafaf7;border-left:3px solid #B8956A;font-size:14px;color:#555;"><strong>Akte:</strong> ${escapeHtml(caseLabel)}</p>` : ''}
      <p style="margin:0 0 16px;padding:14px 16px;background:#fafaf7;border-left:3px solid #B8956A;font-size:14px;color:#1f2937;line-height:1.6;white-space:pre-wrap;">${escapeHtml(bodyPreview)}</p>
      ${ctaButtonHtml(akteUrl, 'Zur Akte')}
    `,
  });
  return sendEmail(env, toEmail, subject, text, 'mandant-message-notification', html);
}

function mandantInviteBody(
  lang: Lang,
  kanzleiName: string,
  inviteUrl: string,
  caseLabel: string | null,
): string {
  const t = i18n(lang).mail.invite;
  const caseLine = caseLabel ? `\n${t.case_label} ${caseLabel}` : '';
  return [
    t.greeting,
    '',
    `${t.intro(kanzleiName)}${caseLine}`,
    '',
    t.step_intro,
    '',
    inviteUrl,
    '',
    t.resume_note,
    '',
    t.contact_note(kanzleiName),
    '',
    '—',
    'Mandantor',
    'mandantor.de',
  ].join('\r\n');
}

export type MandantBranding = {
  logoUrl?: string | null;     // absolut, z.B. https://mandantor.de/api/kanzlei/<id>/logo
  accentColor?: string | null; // hex
  impressumUrl?: string | null;
  datenschutzUrl?: string | null;
};

function brandingLinks(b: MandantBranding) {
  if (!b.impressumUrl && !b.datenschutzUrl) return null;
  return { impressum_url: b.impressumUrl ?? null, datenschutz_url: b.datenschutzUrl ?? null };
}

export async function sendMandantInviteEmail(
  env: Env,
  toMandant: string,
  kanzleiName: string,
  inviteUrl: string,
  caseLabel: string | null,
  lang: Lang,
  branding: MandantBranding = {},
): Promise<{ delivered: Backend }> {
  const t = i18n(lang).mail.invite;
  const html = buildHtmlEmail({
    preheader: t.preheader(kanzleiName),
    brandName: kanzleiName,
    logoUrl: branding.logoUrl,
    accentColor: branding.accentColor,
    kanzleiLinks: brandingLinks(branding),
    lang,
    bodyHtml: `
      ${paragraphHtml(t.greeting)}
      ${paragraphHtml(t.intro(kanzleiName))}
      ${caseLabel ? `<p style="margin:0 0 16px;padding:12px 16px;background:#fafaf7;border-left:3px solid #B8956A;font-size:14px;color:#555;"><strong>${escapeHtml(t.case_label)}</strong> ${escapeHtml(caseLabel)}</p>` : ''}
      ${paragraphHtml(t.step_intro)}
      ${ctaButtonHtml(inviteUrl, t.cta, branding.accentColor)}
      ${smallHtml(t.resume_note)}
      ${smallHtml(t.contact_note(kanzleiName))}
    `,
  });
  return sendEmail(
    env,
    toMandant,
    t.subject(kanzleiName),
    mandantInviteBody(lang, kanzleiName, inviteUrl, caseLabel),
    'mandant-invite',
    html,
  );
}

function mandantConfirmationBody(
  lang: Lang,
  kanzleiName: string,
  caseLabel: string | null,
): string {
  const t = i18n(lang).mail.confirmation;
  const caseLine = caseLabel ? `\n${t.case_label} ${caseLabel}` : '';
  return [
    t.greeting,
    '',
    `${t.intro(kanzleiName)}${caseLine}`,
    '',
    t.next_steps,
    '',
    t.copy_note(kanzleiName),
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
  lang: Lang,
  branding: MandantBranding = {},
): Promise<{ delivered: Backend }> {
  const t = i18n(lang).mail.confirmation;
  const html = buildHtmlEmail({
    preheader: t.preheader,
    brandName: kanzleiName,
    logoUrl: branding.logoUrl,
    accentColor: branding.accentColor,
    kanzleiLinks: brandingLinks(branding),
    lang,
    bodyHtml: `
      ${paragraphHtml(t.greeting)}
      ${paragraphHtml(t.intro(kanzleiName))}
      ${caseLabel ? `<p style="margin:0 0 16px;padding:12px 16px;background:#fafaf7;border-left:3px solid #B8956A;font-size:14px;color:#555;"><strong>${escapeHtml(t.case_label)}</strong> ${escapeHtml(caseLabel)}</p>` : ''}
      ${paragraphHtml(t.next_steps)}
      ${smallHtml(t.copy_note(kanzleiName))}
    `,
  });
  return sendEmail(
    env,
    toMandant,
    t.subject,
    mandantConfirmationBody(lang, kanzleiName, caseLabel),
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

function reopenBody(lang: Lang, kanzleiName: string, reason: string, inviteUrl: string): string {
  const t = i18n(lang).mail.reopen;
  return [
    t.greeting,
    '',
    t.intro(kanzleiName),
    '',
    t.reason_heading,
    reason,
    '',
    t.cta_intro,
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
  lang: Lang,
  branding: MandantBranding = {},
): Promise<{ delivered: Backend }> {
  const t = i18n(lang).mail.reopen;
  const html = buildHtmlEmail({
    preheader: t.preheader,
    brandName: kanzleiName,
    logoUrl: branding.logoUrl,
    accentColor: branding.accentColor,
    kanzleiLinks: brandingLinks(branding),
    lang,
    bodyHtml: `
      ${paragraphHtml(t.greeting)}
      ${paragraphHtml(t.intro(kanzleiName))}
      <p style="margin:16px 0;padding:16px;background:#fffaf0;border-left:4px solid #B8956A;font-size:14px;color:#1f2937;line-height:1.6;"><strong style="display:block;margin-bottom:6px;">${escapeHtml(t.reason_heading)}</strong>${nl2br(reason)}</p>
      ${paragraphHtml(t.cta_intro)}
      ${ctaButtonHtml(inviteUrl, t.cta, branding.accentColor)}
    `,
  });
  return sendEmail(
    env,
    toMandant,
    t.subject(kanzleiName),
    reopenBody(lang, kanzleiName, reason, inviteUrl),
    'akte-reopen',
    html,
  );
}

function reminderBody(lang: Lang, kanzleiName: string, inviteUrl: string): string {
  const t = i18n(lang).mail.reminder;
  return [
    t.greeting,
    '',
    t.intro(kanzleiName),
    '',
    t.cta_intro,
    '',
    inviteUrl,
    '',
    t.footer(kanzleiName),
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
  lang: Lang,
  branding: MandantBranding = {},
): Promise<{ delivered: Backend }> {
  const t = i18n(lang).mail.reminder;
  const html = buildHtmlEmail({
    preheader: t.preheader,
    brandName: kanzleiName,
    logoUrl: branding.logoUrl,
    accentColor: branding.accentColor,
    kanzleiLinks: brandingLinks(branding),
    lang,
    bodyHtml: `
      ${paragraphHtml(t.greeting)}
      ${paragraphHtml(t.intro(kanzleiName))}
      ${paragraphHtml(t.cta_intro)}
      ${ctaButtonHtml(inviteUrl, t.cta, branding.accentColor)}
      ${smallHtml(t.footer(kanzleiName))}
    `,
  });
  return sendEmail(
    env,
    toMandant,
    t.subject(kanzleiName),
    reminderBody(lang, kanzleiName, inviteUrl),
    'akte-reminder',
    html,
  );
}
