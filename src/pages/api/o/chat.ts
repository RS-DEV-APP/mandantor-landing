import type { APIRoute } from 'astro';
import { findKanzleiBySlug } from '../../../lib/db';
import { listAktenTypen } from '../../../lib/akten_typ';
import { createAkte, setMandantContact } from '../../../lib/akten';
import { sendMandantInviteEmail } from '../../../lib/mail';
import { appendAudit } from '../../../lib/audit';
import { dispatchEvent } from '../../../lib/webhooks';
import { rebuildFtsAsync } from '../../../lib/search';
import { analyzeAndPersist } from '../../../lib/ai_actions';
import { getSubscription, countActiveAkten } from '../../../lib/subscription';
import { PLAN_LIMITS } from '../../../lib/stripe';
import { isAiConfigured } from '../../../lib/ai';
import { normalizeLang, type Lang } from '../../../lib/i18n';
import { hashIp } from '../../../lib/hash';
import {
  decodeState,
  cookieHeader,
  runIntakeTurn,
  INTAKE_COOKIE,
  type IntakeState,
} from '../../../lib/intake_chat';

export const prerender = false;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RATE_LIMIT_PER_IP_PER_HOUR = 5;
const RATE_LIMIT_PER_KANZLEI_PER_DAY = 50;

function getClientIp(request: Request): string | null {
  return request.headers.get('cf-connecting-ip')
    ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? null;
}

function readCookie(request: Request, name: string): string | null {
  const raw = request.headers.get('cookie') ?? '';
  const match = raw.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function backToChat(slug: string, lang: Lang, message: string, state: IntakeState | null): Response {
  const params = new URLSearchParams();
  params.set('lang', lang);
  params.set('error', message);
  return new Response(null, {
    status: 303,
    headers: {
      Location: `/o/${slug}/chat?${params.toString()}`,
      'Set-Cookie': cookieHeader(state),
    },
  });
}

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime?.env;
  if (!env?.DB || !env.SECRET_KEY) return new Response('Server misconfigured', { status: 500 });
  if (!isAiConfigured(env)) {
    return new Response('AI not configured', { status: 503 });
  }

  const formData = await request.formData();
  const slug = (formData.get('slug') ?? '').toString();
  const lang = normalizeLang((formData.get('lang') ?? '').toString());
  const userInput = (formData.get('user_input') ?? '').toString().trim().slice(0, 2000);
  const honeypot = (formData.get('website') ?? '').toString();
  if (!slug) return new Response('Invalid request', { status: 400 });
  if (honeypot.length > 0) {
    return new Response(null, { status: 303, headers: { Location: `/o/${slug}/chat?lang=${lang}` } });
  }

  const kanzlei = await findKanzleiBySlug(env.DB, slug);
  if (!kanzlei || kanzlei.public_intake_enabled !== 1) {
    return new Response('Not Found', { status: 404 });
  }

  const aktenTypen = await listAktenTypen(env.DB, kanzlei.id);
  const allowOther = kanzlei.public_intake_other_enabled === 1;
  const rechtsgebieteNames = aktenTypen.map((t) => t.name);

  // State aus Cookie laden, oder neu beginnen.
  const cookieRaw = readCookie(request, INTAKE_COOKIE);
  let state = decodeState(cookieRaw);
  if (!state || state.slug !== slug) {
    state = {
      slug,
      lang,
      conversation: [],
      collected: {},
      complete: false,
    };
  } else {
    state.lang = lang;
  }

  // Bootstrap (leere Conversation) ohne User-Input → Claude generiert Begrüßung.
  // Bootstrap MIT User-Input → User-Input wird als erster Turn übernommen.
  // Non-Bootstrap ohne Input → Early-Redirect (kein leerer Claude-Call).
  const useUserInput = userInput || null;
  if (state.conversation.length > 0 && !useUserInput) {
    return new Response(null, {
      status: 303,
      headers: {
        Location: `/o/${slug}/chat?lang=${lang}`,
        'Set-Cookie': cookieHeader(state),
      },
    });
  }

  let result;
  try {
    result = await runIntakeTurn(env, {
      state,
      userInput: useUserInput,
      kanzleiName: kanzlei.display_name,
      rechtsgebiete: rechtsgebieteNames,
      allowOther,
    });
  } catch (err) {
    console.error('intake chat turn failed', err);
    return backToChat(slug, lang, lang === 'en' ? 'Assistant unavailable, please try again.' : 'Assistent gerade nicht erreichbar. Bitte erneut versuchen.', state);
  }

  state = result.state;

  // Wenn nicht complete: Cookie aktualisieren, zurück zur Chat-Seite.
  if (!state.complete) {
    return new Response(null, {
      status: 303,
      headers: {
        Location: `/o/${slug}/chat?lang=${lang}`,
        'Set-Cookie': cookieHeader(state),
      },
    });
  }

  // === Akte anlegen aus collected state ===

  const c = state.collected;
  const vorname = (c.vorname ?? '').trim();
  const nachname = (c.nachname ?? '').trim();
  const email = (c.email ?? '').trim().toLowerCase();
  const sachverhalt = (c.sachverhalt ?? '').trim().slice(0, 5000);

  if (!vorname || !nachname || !email || !sachverhalt || vorname.length < 2 || nachname.length < 2) {
    return backToChat(slug, lang, lang === 'en' ? 'Some fields are missing — let us continue.' : 'Es fehlen noch Angaben — bitte setzen Sie das Gespräch fort.', { ...state, complete: false });
  }
  if (!EMAIL_REGEX.test(email)) {
    return backToChat(slug, lang, lang === 'en' ? 'The email address looks invalid.' : 'Die E-Mail-Adresse scheint ungültig zu sein.', { ...state, complete: false });
  }
  if (sachverhalt.length < 30) {
    return backToChat(slug, lang, lang === 'en' ? 'Please describe the matter in a bit more detail.' : 'Bitte beschreiben Sie den Sachverhalt etwas ausführlicher.', { ...state, complete: false });
  }
  if (!c.privacy_consent) {
    return backToChat(slug, lang, lang === 'en' ? 'Please confirm the privacy consent in the conversation.' : 'Bitte bestätigen Sie noch die Datenschutz-Einwilligung im Gespräch.', { ...state, complete: false });
  }

  // Akten-Typ Match
  let aktenTypId: string | null = null;
  let aktenTypName: string | null = null;
  if (c.rechtsgebiet) {
    const lower = c.rechtsgebiet.toLowerCase().trim();
    const match = aktenTypen.find((t) => t.name.toLowerCase() === lower)
      ?? aktenTypen.find((t) => lower.includes(t.name.toLowerCase()) || t.name.toLowerCase().includes(lower));
    if (match) {
      aktenTypId = match.id;
      aktenTypName = match.name;
    }
  }

  // Rate-Limit
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
      return backToChat(slug, lang, lang === 'en' ? 'Too many requests — please try again later.' : 'Zu viele Anfragen — bitte später erneut versuchen.', null);
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
    return backToChat(slug, lang, lang === 'en' ? 'Daily limit reached — please contact the firm directly.' : 'Tageslimit erreicht — bitte Kanzlei direkt kontaktieren.', null);
  }

  // Plan-Limit
  const sub = await getSubscription(env.DB, kanzlei.id);
  const plan = sub?.plan ?? 'pilot';
  const limit = PLAN_LIMITS[plan]?.activeAkten ?? null;
  if (limit !== null) {
    const count = await countActiveAkten(env.DB, kanzlei.id);
    if (count >= limit) {
      return backToChat(slug, lang, lang === 'en' ? 'The firm has reached its plan limit.' : 'Die Kanzlei hat ihr Plan-Limit erreicht.', null);
    }
  }

  // Akte anlegen
  const mandantName = `${vorname} ${nachname}`;
  const labelPrefix = aktenTypName ?? (lang === 'en' ? 'Other matter' : 'Andere Angelegenheit');
  const caseLabel = `${labelPrefix} — ${mandantName}`.slice(0, 120);

  const akte = await createAkte(env.DB, kanzlei.id, caseLabel, aktenTypId, lang, 'public');
  await setMandantContact(env.DB, akte.id, email, mandantName);

  // Step 1 (Stammdaten) vorausfüllen aus Chat-Daten — Mandant ergänzt Anschrift etc.
  await env.DB
    .prepare(
      `INSERT INTO akte_step (akte_id, step_no, data_json, signed_at, ip_hash, ua_hash)
       VALUES (?1, 1, ?2, NULL, NULL, NULL)
       ON CONFLICT(akte_id, step_no) DO UPDATE SET data_json = excluded.data_json`,
    )
    .bind(akte.id, JSON.stringify({ vorname, nachname, email }))
    .run();

  // Sachverhalt vorausfüllen (unsigniert)
  await env.DB
    .prepare(
      `INSERT INTO akte_step (akte_id, step_no, data_json, signed_at, ip_hash, ua_hash)
       VALUES (?1, 6, ?2, NULL, NULL, NULL)
       ON CONFLICT(akte_id, step_no) DO UPDATE SET data_json = excluded.data_json`,
    )
    .bind(akte.id, JSON.stringify({ sachverhalt }))
    .run();

  // Conversation als Audit-Anhang speichern (bewusst KEINE PII-Redaktion hier — die Anwältin sieht den Original-Dialog)
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
      mode: 'chat',
      conversation_turns: state.conversation.length,
      rechtsgebiet_input: c.rechtsgebiet ?? null,
    },
  });

  rebuildFtsAsync(env.DB, locals.runtime?.ctx, akte.id);

  // KI-Analyse async im Hintergrund (auf den eigentlichen Sachverhalt)
  const ctxAudit = { actorUserId: null, actorEmail: email, ip, ua };
  const aiPromise = analyzeAndPersist(env.DB, env, akte.id, kanzlei.id, sachverhalt, ctxAudit)
    .catch((err) => console.error('chat-intake ai analyze failed', err));
  if (locals.runtime?.ctx) locals.runtime.ctx.waitUntil(aiPromise);

  await dispatchEvent(env.DB, locals.runtime?.ctx, kanzlei.id, 'akte.created', {
    akte_id: akte.id,
    case_label: caseLabel,
    akten_typ_id: aktenTypId,
    mandant_email: email,
    mandant_name: mandantName,
    lang,
    intake_source: 'public',
    intake_mode: 'chat',
    created_at: now,
  });

  // Invite-Mail
  try {
    const origin = new URL(request.url).origin;
    const inviteUrl = `${origin}/m/${akte.mandant_token}`;
    const branding = {
      logoUrl: kanzlei.logo_r2_key ? `${origin}/api/kanzlei/${kanzlei.id}/logo` : null,
      accentColor: kanzlei.brand_color,
      impressumUrl: kanzlei.impressum_url,
      datenschutzUrl: kanzlei.datenschutz_url,
    };
    const mailPromise = sendMandantInviteEmail(env, email, kanzlei.display_name, inviteUrl, akte.case_label, lang, branding);
    if (locals.runtime?.ctx) locals.runtime.ctx.waitUntil(mailPromise.catch(() => { /* swallow */ }));
  } catch (err) {
    console.error('chat intake invite mail failed', err);
  }

  // Cookie löschen, zurück zur Form-Page mit "sent=1"
  return new Response(null, {
    status: 303,
    headers: {
      Location: `/o/${slug}?sent=1&lang=${lang}`,
      'Set-Cookie': cookieHeader(null),
    },
  });
};

