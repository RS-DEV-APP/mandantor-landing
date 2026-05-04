// Lokale PII-Redaktion vor LLM-Aufrufen. Zweck: keine direkten E-Mails/Telefonnummern/
// Bankdaten/Steuer-IDs an den KI-Provider schicken. Namen werden NICHT redaktiert,
// weil die Anwältin die Zusammenfassung zur Identifikation nutzt.
//
// Konservative Strategie: lieber ein paar False-Positives (z.B. langer Zahlencode wird
// als IBAN markiert) als sensible Daten durchsickern lassen.

const EMAIL_RE = /\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g;
// Telefonnummern (DE-zentriert): +49…, 0…, mit Trennern
const PHONE_RE = /(?:\+\d{1,3}[\s./-]?)?(?:\(\d{1,5}\)|0\d{2,5})[\s./-]?\d{2,4}[\s./-]?\d{2,8}\b/g;
// IBAN: 2 Buchstaben + 20–32 Alphanumerisch (DE = 22, üblicher Range)
const IBAN_RE = /\b[A-Z]{2}\d{2}[A-Z0-9 ]{16,32}\b/g;
// Steuer-IDs (DE 11-stellig), Steuernummer (10-13 Ziffern mit /) — vereinfacht
const TAX_ID_RE = /\b\d{10,13}\b/g;
// Kreditkarten (13–19 Ziffern, mit Leerzeichen oder Bindestrichen)
const CC_RE = /\b(?:\d[ -]?){13,19}\b/g;

export type RedactionMap = Record<string, string>;

/** Redaktiert PII und liefert den maskierten Text + Map zurück (für später Re-Substitution). */
export function redactPii(input: string): { redacted: string; map: RedactionMap } {
  const map: RedactionMap = {};
  let counter = 0;
  const placeholder = (kind: string) => {
    const key = `[${kind}_${++counter}]`;
    return key;
  };

  let out = input;
  out = out.replace(EMAIL_RE, (match) => {
    const k = placeholder('EMAIL');
    map[k] = match;
    return k;
  });
  out = out.replace(IBAN_RE, (match) => {
    const k = placeholder('IBAN');
    map[k] = match;
    return k;
  });
  out = out.replace(CC_RE, (match) => {
    // Nur als Kreditkarte erkennen wenn Luhn-Check passt — sonst evtl. legitime Zahl.
    if (luhn(match.replace(/[ -]/g, ''))) {
      const k = placeholder('CARD');
      map[k] = match;
      return k;
    }
    return match;
  });
  out = out.replace(PHONE_RE, (match) => {
    // Mind. 6 Ziffern für Telefonnummer
    const digits = match.replace(/\D/g, '');
    if (digits.length < 6) return match;
    const k = placeholder('PHONE');
    map[k] = match;
    return k;
  });
  out = out.replace(TAX_ID_RE, (match) => {
    // Nur lange Ziffernblöcke ≥10 (vermeidet einfache Datums-Zahlen)
    if (match.length < 10) return match;
    const k = placeholder('ID');
    map[k] = match;
    return k;
  });

  return { redacted: out, map };
}

function luhn(num: string): boolean {
  if (!/^\d+$/.test(num)) return false;
  let sum = 0;
  let alt = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let n = parseInt(num.charAt(i), 10);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}
