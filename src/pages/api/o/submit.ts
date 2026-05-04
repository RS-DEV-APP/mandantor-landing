import type { APIRoute } from 'astro';
import { findKanzleiBySlug } from '../../../lib/db';
import { findAktenTypById, listAktenTypen } from '../../../lib/akten_typ';
import { createAkte, setMandantContact } from '../../../lib/akten';
import { sendMandantInviteEmail } from '../../../lib/mail';
import { appendAudit } from '../../../lib/audit';
import { dispatchEvent } from '../../../lib/webhooks';
import { analyzeAndPersist } from '../../../lib/ai_actions';
import { rebuildFtsAsync } from '../../../lib/search';
import { getSubscription, countActiveAkten } from '../../../lib/subscription';
import { PLAN_LIMITS } from '../../../lib/stripe';
import { normalizeLang, type Lang } from '../../../lib/i18n';
import { hashIp } from '../../../lib/hash';

export const prerender = false;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RATE_LIMIT_PER_IP_PER_HOUR = 5;
const RATE_LIMIT_PER_KANZLEI_PER_DAY = 50;

function getClientIp(request: Request): string | null {
  return request.headers.get('cf-connecting-ip')
    ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? null;
}

function backToForm(slug: string, message: string, lang: Lang): Response {
  const params = new URLSearchParams();
  params.set('lang', lang);
  params.set('error', message);
  return new Response(null, { status: 303, headers: { Location: `/o/${slug}?${params.toString()}` } });
}

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime?.env;
  if (!env?.DB || !env.SECRET_KEY) {
    return new Response('Server misconfigured', { status: 500 });
  }

  const formData = await request.formData();
  const slug = (formData.get('slug') ?? '').toString();
  const lang = normalizeLang((formData.get('lang') ?? '').toString());
  if (!slug) return new Response('Invalid request', { status: 400 });

  const kanzlei = await findKanzleiBySlug(env.DB, slug);
  if (!kanzlei || kanzlei.public_intake_enabled !== 1) {
    return new Response('Not Found', { status: 404 });
  }

  // Honeypot — silently drop
  if ((formData.get('website') ?? '').toString().length > 0) {
    return new Response(null, { status: 303, headers: { Location: `/o/${slug}?sent=1` } });
  }

  const aktenTypIdRaw = (formData.get('akten_typ_id') ?? '').toString();
  const vorname = (formData.get('vorname') ?? '').toString().trim();
  const nachname = (formData.get('nachname') ?? '').toString().trim();
  const email = (formData.get('email') ?? '').toString().trim().toLowerCase();
  const sachverhalt = (formData.get('sachverhalt') ?? '').toString().trim().slice(0, 5000);
  const privacyConsent = (formData.get('privacy_consent') ?? '').toString() === '1';

  if (!privacyConsent || !vorname || !nachname || !email || vorname.length < 2 || nachname.length < 2) {
    const i18nMsg = lang === 'en' ? 'Please fill in all required fields.' : 'Bitte füllen Sie alle Pflichtfelder aus.';
    return backToForm(slug, i18nMsg, lang);
  }
  if (!EMAIL_REGEX.test(email)) {
    const i18nMsg = lang === 'en' ? 'Please enter a valid email address.' : 'Bitte geben Sie eine gültige E-Mail-Adresse ein.';
    return backToForm(slug, i18nMsg, lang);
  }

  // Akten-Typ-Auflösung
  let aktenTypId: string | null = null;
  let aktenTypName: string | null = null;
  if (aktenTypIdRaw && aktenTypIdRaw !== '__other__') {
    const typ = await findAktenTypById(env.DB, kanzlei.id, aktenTypIdRaw);
    if (!typ) {
      // Falls UI veraltet ist, fallback: zeige sichtbare Liste, sonst Andere
      const _list = await listAktenTypen(env.DB, kanzlei.id);
      void _list;
      const i18nMsg = lang === 'en' ? 'Selected legal area is invalid.' : 'Das gewählte Rechtsgebiet ist ungültig.';
      return backToForm(slug, i18nMsg, lang);
    }
    aktenTypId = typ.id;
    aktenTypName = typ.name;
  } else if (aktenTypIdRaw === '__other__') {
    if (kanzlei.public_intake_other_enabled !== 1) {
      const i18nMsg = lang === 'en' ? 'Please choose a legal area.' : 'Bitte wählen Sie ein Rechtsgebiet.';
      return backToForm(slug, i18nMsg, lang);
    }
    aktenTypId = null;
    aktenTypName = null;
  } else {
    const i18nMsg = lang === 'en' ? 'Please choose a legal area.' : 'Bitte wählen Sie ein Rechtsgebiet.';
    return backToForm(slug, i18nMsg, lang);
  }

  // Rate-Limit prüfen via audit_log
  const ip = getClientIp(request);
  const ua = request.headers.get('user-agent');
  const ipHash = await hashIp(env.SECRET_KEY, ip);
  const now = Math.floor(Date.now() / 1000);

  if (ipHash) {
    const ipCount = await env.DB
      .prepare(
        `SELECT COUNT(*) AS n FROM audit_log
         WHERE event_type = 'akte.public_intake' AND ip_hash = ?1 AND occurred_at > ?2`,
      )
      .bind(ipHash, now - 3600)
      .first<{ n: number }>();
    if ((ipCount?.n ?? 0) >= RATE_LIMIT_PER_IP_PER_HOUR) {
      const i18nMsg = lang === 'en' ? 'Too many requests — please try again later.' : 'Zu viele Anfragen — bitte versuchen Sie es später erneut.';
      return backToForm(slug, i18nMsg, lang);
    }
  }
  const kanzleiCount = await env.DB
    .prepare(
      `SELECT COUNT(*) AS n FROM audit_log
       WHERE event_type = 'akte.public_intake' AND kanzlei_id = ?1 AND occurred_at > ?2`,
    )
    .bind(kanzlei.id, now - 86400)
    .first<{ n: number }>();
  if ((kanzleiCount?.n ?? 0) >= RATE_LIMIT_PER_KANZLEI_PER_DAY) {
    const i18nMsg = lang === 'en' ? 'Daily limit reached — please contact the firm directly.' : 'Tageslimit erreicht — bitte kontaktieren Sie die Kanzlei direkt.';
    return backToForm(slug, i18nMsg, lang);
  }

  // Plan-Limit
  const sub = await getSubscription(env.DB, kanzlei.id);
  const plan = sub?.plan ?? 'pilot';
  const limit = PLAN_LIMITS[plan]?.activeAkten ?? null;
  if (limit !== null) {
    const count = await countActiveAkten(env.DB, kanzlei.id);
    if (count >= limit) {
      const i18nMsg = lang === 'en' ? 'The firm has reached its plan limit.' : 'Die Kanzlei hat ihr Plan-Limit erreicht.';
      return backToForm(slug, i18nMsg, lang);
    }
  }

  // Akte anlegen
  const mandantName = `${vorname} ${nachname}`;
  const labelPrefix = aktenTypName ?? (lang === 'en' ? 'Other matter' : 'Andere Angelegenheit');
  const caseLabel = `${labelPrefix} — ${mandantName}`.slice(0, 120);

  const akte = await createAkte(env.DB, kanzlei.id, caseLabel, aktenTypId, lang, 'public');
  await setMandantContact(env.DB, akte.id, email, mandantName);

  // Step 1 (Stammdaten) mit Vorname/Nachname/Email vorausfüllen — ohne signed_at,
  // sodass Mandant beim Wizard-Klick die Felder sieht und nur Anschrift/PLZ/etc.
  // ergänzen + bestätigen muss.
  await env.DB
    .prepare(
      `INSERT INTO akte_step (akte_id, step_no, data_json, signed_at, ip_hash, ua_hash)
       VALUES (?1, 1, ?2, NULL, NULL, NULL)
       ON CONFLICT(akte_id, step_no) DO UPDATE SET data_json = excluded.data_json`,
    )
    .bind(akte.id, JSON.stringify({ vorname, nachname, email }))
    .run();

  // Sachverhalt vorausfüllen (unsigniert) wenn vorhanden
  if (sachverhalt.length >= 10) {
    await env.DB
      .prepare(
        `INSERT INTO akte_step (akte_id, step_no, data_json, signed_at, ip_hash, ua_hash)
         VALUES (?1, 6, ?2, NULL, NULL, NULL)
         ON CONFLICT(akte_id, step_no) DO UPDATE SET data_json = excluded.data_json`,
      )
      .bind(akte.id, JSON.stringify({ sachverhalt }))
      .run();
  }

  // Audit + Webhook
  await appendAudit(env.DB, env.SECRET_KEY, kanzlei.id, {
    actorUserId: null,
    actorEmail: email,
    ip,
    ua,
  }, {
    eventType: 'akte.public_intake',
    subjectType: 'akte',
    subjectId: akte.id,
    payload: {
      akten_typ_id: aktenTypId,
      akten_typ_name: aktenTypName,
      mandant_name: mandantName,
      mandant_email: email,
      lang,
      has_sachverhalt: sachverhalt.length >= 10,
    },
  });

  rebuildFtsAsync(env.DB, locals.runtime?.ctx, akte.id);

  // KI-Analyse im Hintergrund anstoßen, wenn Sachverhalt mitgeliefert wurde
  if (sachverhalt.length >= 30) {
    const ctxAudit = { actorUserId: null, actorEmail: email, ip, ua };
    const aiPromise = analyzeAndPersist(env.DB, env, akte.id, kanzlei.id, sachverhalt, ctxAudit)
      .catch((err) => console.error('public intake ai analyze failed', err));
    if (locals.runtime?.ctx) {
      locals.runtime.ctx.waitUntil(aiPromise);
    }
  }

  await dispatchEvent(env.DB, locals.runtime?.ctx, kanzlei.id, 'akte.created', {
    akte_id: akte.id,
    case_label: caseLabel,
    akten_typ_id: aktenTypId,
    mandant_email: email,
    mandant_name: mandantName,
    lang,
    intake_source: 'public',
    created_at: now,
  });

  // Invite-Mail an Mandanten — Link zur Wizard-Vervollständigung
  try {
    const origin = new URL(request.url).origin;
    const inviteUrl = `${origin}/m/${akte.mandant_token}`;
    const branding = {
      logoUrl: kanzlei.logo_r2_key ? `${origin}/api/kanzlei/${kanzlei.id}/logo` : null,
      accentColor: kanzlei.brand_color,
      impressumUrl: kanzlei.impressum_url,
      datenschutzUrl: kanzlei.datenschutz_url,
    };
    await sendMandantInviteEmail(env, email, kanzlei.display_name, inviteUrl, akte.case_label, lang, branding);
  } catch (err) {
    console.error('public intake invite mail failed', err);
  }

  return new Response(null, { status: 303, headers: { Location: `/o/${slug}?sent=1&lang=${lang}` } });
};
