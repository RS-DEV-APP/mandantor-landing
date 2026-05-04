// Mandant-facing i18n. Sprache wird pro Akte beim Anlegen festgelegt
// (akte.lang, Default 'de'). Keine Browser-Erkennung — die Anwältin entscheidet,
// in welcher Sprache der Mandant sein Onboarding bekommt.
//
// Anwältinnen-/Admin-UI bleibt deutsch (Zielgruppe = DE-Kanzleien).

export type Lang = 'de' | 'en';

export const SUPPORTED_LANGS: readonly Lang[] = ['de', 'en'] as const;
export const DEFAULT_LANG: Lang = 'de';

export function normalizeLang(input: string | null | undefined): Lang {
  if (input === 'en') return 'en';
  return 'de';
}

export const LANG_LABELS: Record<Lang, string> = {
  de: 'Deutsch',
  en: 'English',
};

const STRINGS = {
  wizard: {
    title: { de: 'Mandanten-Onboarding', en: 'Client Onboarding' },
    thanks_label: { de: '✓ Abgeschlossen', en: '✓ Completed' },
    thanks_title: { de: 'Vielen Dank.', en: 'Thank you.' },
    submitted_at: {
      de: (date: string, kanzlei: string) => `Ihre Angaben wurden am ${date} an die Kanzlei ${kanzlei} übermittelt.`,
      en: (date: string, kanzlei: string) => `Your information was submitted to ${kanzlei} on ${date}.`,
    },
    submitted_close_window: {
      de: 'Sie können dieses Fenster schließen. Bei Rückfragen meldet sich die Kanzlei direkt bei Ihnen.',
      en: 'You may close this window. The firm will contact you directly with any follow-up questions.',
    },
    reopened_label: { de: 'Bitte um Ergänzung', en: 'Action requested' },
    reopened_heading: { de: 'Anmerkung der Kanzlei', en: 'Note from the firm' },
    reopened_hint: {
      de: 'Bitte passen Sie die betroffenen Schritte an und senden Sie die Akte erneut ab.',
      en: 'Please adjust the affected steps and resubmit your file.',
    },
  },
  step: {
    // Reihenfolge entspricht step_no: Index 0 = step_no 1 (Stammdaten), Index 5 = step_no 6 (Sachverhalt), Index 6 = step_no 7 (Widerruf).
    labels: {
      de: ['Stammdaten', 'Vollmacht', 'DSGVO', 'Honorar', 'Upload', 'Sachverhalt', 'Widerruf'] as const,
      en: ['Personal Data', 'Power of Attorney', 'Privacy', 'Fees', 'Upload', 'Matter', 'Withdrawal'] as const,
    },
    cta_save: { de: 'Speichern & weiter →', en: 'Save & continue →' },
    cta_confirm: { de: 'Bestätigen & weiter →', en: 'Confirm & continue →' },
    signed_name_label: {
      de: 'Vor- und Nachname zur Bestätigung *',
      en: 'First and last name for confirmation *',
    },
  },
  step1: {
    title: { de: 'Stammdaten', en: 'Personal Data' },
    hint: {
      de: 'Bitte tragen Sie Ihre Kontaktdaten ein. Diese benötigt die Kanzlei für Vollmacht und Korrespondenz.',
      en: 'Please enter your contact details. The firm needs them for the power of attorney and correspondence.',
    },
    vorname: { de: 'Vorname *', en: 'First name *' },
    nachname: { de: 'Nachname *', en: 'Last name *' },
    anschrift: { de: 'Straße & Hausnummer *', en: 'Street & house number *' },
    plz: { de: 'PLZ *', en: 'ZIP / Postal code *' },
    ort: { de: 'Ort *', en: 'City *' },
    geburtsdatum: { de: 'Geburtsdatum *', en: 'Date of birth *' },
    telefon: { de: 'Telefon', en: 'Phone' },
    email: { de: 'E-Mail *', en: 'Email *' },
  },
  step2: {
    title: { de: 'Vollmacht', en: 'Power of Attorney' },
    hint: {
      de: 'Bitte lesen Sie den folgenden Text und bestätigen Sie unten.',
      en: 'Please read the following text and confirm below.',
    },
    qes_warning: {
      de: 'Hinweis: Diese Kanzlei verlangt für die Vollmacht eine qualifizierte elektronische Signatur (QES, § 80 ZPO). Diese Funktion ist im aktuellen Mandantor-Setup noch nicht aktiviert — bitte wenden Sie sich für die abschließende Vollmachtserteilung direkt an die Kanzlei.',
      en: 'Note: This firm requires a qualified electronic signature (QES) for the power of attorney. This feature is not yet active in the current Mandantor setup — please contact the firm directly to finalise the power of attorney.',
    },
    confirm: {
      de: 'Hiermit erteile ich die vorstehende Vollmacht. Ich verstehe, dass meine Bestätigung mit Datum und IP-Adresse protokolliert wird.',
      en: 'I hereby grant the above power of attorney. I understand that my confirmation will be logged with timestamp and IP address.',
    },
  },
  step3: {
    title: { de: 'Datenschutz-Einwilligung', en: 'Privacy Consent' },
    hint: {
      de: 'Bitte lesen Sie die Datenschutzhinweise und bestätigen Sie.',
      en: 'Please read the privacy notice and confirm.',
    },
    confirm: {
      de: 'Ich habe die Datenschutzhinweise gelesen und willige in die beschriebene Verarbeitung meiner personenbezogenen Daten ein.',
      en: 'I have read the privacy notice and consent to the described processing of my personal data.',
    },
  },
  step4: {
    title: { de: 'Honorarvereinbarung', en: 'Fee Agreement' },
    hint: {
      de: 'Bitte lesen Sie die Honorarvereinbarung sorgfältig.',
      en: 'Please read the fee agreement carefully.',
    },
    confirm: {
      de: 'Ich akzeptiere die vorstehende Honorarvereinbarung.',
      en: 'I accept the above fee agreement.',
    },
  },
  step6: {
    title: { de: 'Sachverhalt', en: 'Matter Description' },
    hint: {
      de: 'Bitte schildern Sie kurz Ihren Sachverhalt. Die Kanzlei nutzt diese Angaben zur Vorbereitung des Mandats.',
      en: 'Please briefly describe the matter. The firm uses this to prepare the engagement.',
    },
    field_label: { de: 'Sachverhalt *', en: 'Matter description *' },
    placeholder: {
      de: 'z. B. Was ist passiert, wann, was möchten Sie erreichen …',
      en: 'e.g. What happened, when, what do you want to achieve …',
    },
  },
  step7: {
    title: { de: 'Widerrufsbelehrung', en: 'Right of Withdrawal' },
    hint: {
      de: 'Bitte lesen Sie die Widerrufsbelehrung und bestätigen Sie die Kenntnisnahme.',
      en: 'Please read the right of withdrawal notice and confirm.',
    },
    confirm: {
      de: 'Ich habe die Widerrufsbelehrung gelesen und bestätige die Kenntnisnahme.',
      en: 'I have read the right of withdrawal notice and confirm.',
    },
  },
  step5: {
    title: { de: 'Dokumente hochladen', en: 'Upload Documents' },
    hint_with_files: {
      de: 'Bitte laden Sie folgende Dokumente hoch:',
      en: 'Please upload the following documents:',
    },
    hint_limits: {
      de: (max: number, mb: number, exts: string) => `Maximal ${max} Dateien · ${mb} MB pro Datei · ${exts}.`,
      en: (max: number, mb: number, exts: string) => `Up to ${max} files · ${mb} MB per file · ${exts}.`,
    },
    hint_optional: {
      de: (max: number, mb: number, exts: string) => `Optional. Maximal ${max} Dateien · ${mb} MB pro Datei · ${exts}.`,
      en: (max: number, mb: number, exts: string) => `Optional. Up to ${max} files · ${mb} MB per file · ${exts}.`,
    },
    upload_label: {
      de: 'Datei wählen — Upload startet automatisch',
      en: 'Choose file — upload starts automatically',
    },
    uploading: { de: 'Wird hochgeladen…', en: 'Uploading…' },
    upload_button: { de: 'Hochladen', en: 'Upload' },
    submit_title: { de: 'Abschließen', en: 'Finish' },
    submit_hint: {
      de: 'Wenn Sie fertig sind, übermitteln Sie Ihre Angaben an die Kanzlei. Danach ist keine Bearbeitung mehr möglich.',
      en: 'When you are done, submit your data to the firm. After that, editing is no longer possible.',
    },
    submit_required: {
      de: 'Bitte schließen Sie zuerst Schritte 01-04 ab.',
      en: 'Please complete steps 01–04 first.',
    },
    submit_cta: { de: 'Verbindlich übermitteln →', en: 'Submit →' },
  },
  chat: {
    title: { de: 'Direktnachrichten mit der Kanzlei', en: 'Messages with the firm' },
    empty: { de: 'Noch keine Nachrichten.', en: 'No messages yet.' },
    sender_lawyer: { de: 'Kanzlei', en: 'Firm' },
    placeholder: { de: 'Nachricht an die Kanzlei …', en: 'Message to the firm …' },
    send: { de: 'Senden', en: 'Send' },
    sent_flash: { de: '✓ Nachricht übermittelt.', en: '✓ Message sent.' },
  },
  fallback: {
    vollmacht: {
      de: 'Hiermit bevollmächtige ich die Kanzlei {KANZLEI}, mich in der vorgenannten Angelegenheit gerichtlich und außergerichtlich zu vertreten. Die Vollmacht erstreckt sich insbesondere auf die Entgegennahme von Zustellungen aller Art, das Stellen aller in Betracht kommenden Anträge, das Einlegen von Rechtsmitteln, deren Zurücknahme oder Verzicht sowie die Annahme von Geld und Wertsachen.',
      en: 'I hereby authorise {KANZLEI} to represent me in the above matter, both judicially and extrajudicially. This power of attorney extends in particular to receiving all forms of service, filing all relevant motions, lodging and withdrawing appeals, and accepting funds and valuables on my behalf.',
    },
    dsgvo: {
      de: 'Die Kanzlei {KANZLEI} verarbeitet Ihre personenbezogenen Daten gemäß Art. 6 Abs. 1 lit. b DSGVO zur Erfüllung des Mandatsverhältnisses sowie nach Art. 6 Abs. 1 lit. c DSGVO zur Erfüllung gesetzlicher Aufbewahrungspflichten. Daten werden bis zum Ablauf der gesetzlichen Aufbewahrungsfristen (i.d.R. 6 Jahre nach Mandatsende, in Einzelfällen länger) gespeichert. Sie haben jederzeit Anspruch auf Auskunft, Berichtigung, Löschung sowie Datenübertragbarkeit. Beschwerden sind an die zuständige Aufsichtsbehörde zu richten.',
      en: '{KANZLEI} processes your personal data pursuant to Art. 6(1)(b) GDPR to fulfil the engagement and pursuant to Art. 6(1)(c) GDPR to comply with statutory retention obligations. Data will be stored until the end of the statutory retention period (typically 6 years after the engagement ends, longer in some cases). You have the right at any time to access, correct, erase, and port your data. Complaints may be filed with the competent supervisory authority.',
    },
    honorar: {
      de: (kanzlei: string, hourly: string, advance: string) =>
        `Mandant und Kanzlei ${kanzlei} vereinbaren ein Stundenhonorar in Höhe von ${hourly} zuzüglich gesetzlicher Umsatzsteuer. Vor Tätigkeitsaufnahme wird ein Vorschuss in Höhe von ${advance} fällig. Reisezeit gilt als Arbeitszeit. Die Abrechnung erfolgt im 6-Minuten-Takt. Diese Vereinbarung gilt nur außergerichtlich; im gerichtlichen Verfahren wird mindestens nach RVG abgerechnet.`,
      en: (kanzlei: string, hourly: string, advance: string) =>
        `The client and ${kanzlei} agree on an hourly rate of ${hourly} plus statutory VAT. An advance of ${advance} is due before work begins. Travel time counts as working time. Billing is in 6-minute increments. This agreement applies to extra-judicial work only; for court proceedings, billing follows the German Lawyers' Compensation Act (RVG) at minimum.`,
    },
    widerruf: {
      // Standardtext angelehnt an Anlage 1 zu Art. 246a § 1 EGBGB. Kanzlei kann pro
      // Akten-Typ überschreiben, wenn andere Frist/Empfänger gewünscht.
      de: 'Widerrufsrecht: Sie haben das Recht, binnen 14 Tagen ohne Angabe von Gründen diesen Mandatsvertrag zu widerrufen. Die Widerrufsfrist beträgt 14 Tage ab dem Tag des Vertragsschlusses. Um Ihr Widerrufsrecht auszuüben, müssen Sie der Kanzlei {KANZLEI} mittels einer eindeutigen Erklärung (z. B. ein mit der Post versandter Brief oder eine E-Mail) über Ihren Entschluss, diesen Vertrag zu widerrufen, informieren. Zur Wahrung der Widerrufsfrist reicht es aus, dass Sie die Mitteilung über die Ausübung des Widerrufsrechts vor Ablauf der Widerrufsfrist absenden.\n\nFolgen des Widerrufs: Wenn Sie diesen Vertrag widerrufen, hat die Kanzlei Ihnen alle Zahlungen, die sie von Ihnen erhalten hat, einschließlich der Lieferkosten, unverzüglich und spätestens binnen 14 Tagen ab dem Tag zurückzuzahlen, an dem die Mitteillung über Ihren Widerruf bei ihr eingegangen ist. Haben Sie verlangt, dass die Dienstleistung während der Widerrufsfrist beginnen soll, so haben Sie der Kanzlei einen angemessenen Betrag zu zahlen, der dem Anteil der bis zu Ihrem Widerruf erbrachten Leistungen entspricht.',
      en: 'Right of withdrawal: You have the right to withdraw from this engagement within 14 days without giving any reason. The withdrawal period expires 14 days after the day on which the contract was concluded. To exercise the right of withdrawal, you must inform {KANZLEI} of your decision to withdraw by an unequivocal statement (e.g. a letter sent by post or an email). To meet the withdrawal deadline, it is sufficient for you to send your communication concerning the exercise of the right of withdrawal before the withdrawal period has expired.\n\nEffects of withdrawal: If you withdraw from this contract, the firm shall reimburse all payments received from you, including the costs of delivery, without undue delay and not later than 14 days from the day on which it is informed of your decision to withdraw. If you requested the services to begin during the withdrawal period, you shall pay a reasonable amount corresponding to the services already provided up to the point of withdrawal.',
    },
  },
  intake: {
    title: { de: 'Mandant werden', en: 'Become a client' },
    subtitle: {
      de: (kanzlei: string) => `Bitte wählen Sie ein Rechtsgebiet und tragen Sie Ihre Kontaktdaten ein. ${kanzlei} meldet sich mit dem nächsten Schritt bei Ihnen.`,
      en: (kanzlei: string) => `Please select a legal area and enter your contact details. ${kanzlei} will get back to you with the next step.`,
    },
    rechtsgebiet_label: { de: 'Rechtsgebiet *', en: 'Legal area *' },
    rechtsgebiet_other: { de: 'Andere Angelegenheit', en: 'Other matter' },
    name_label: { de: 'Name *', en: 'Name *' },
    vorname_placeholder: { de: 'Vorname', en: 'First name' },
    nachname_placeholder: { de: 'Nachname', en: 'Last name' },
    email_label: { de: 'E-Mail *', en: 'Email *' },
    sachverhalt_label: { de: 'Worum geht es?', en: 'What is it about?' },
    sachverhalt_placeholder: {
      de: 'Kurz Ihren Sachverhalt schildern …',
      en: 'Briefly describe your matter …',
    },
    privacy_consent: {
      de: 'Ich habe die Datenschutzhinweise zur Kenntnis genommen und willige in die Verarbeitung meiner Anfrage ein.',
      en: 'I have read the privacy notice and consent to the processing of my request.',
    },
    submit_cta: { de: 'Anfrage senden →', en: 'Send request →' },
    sent_title: { de: 'Anfrage übermittelt.', en: 'Request submitted.' },
    sent_hint: {
      de: 'Sie erhalten in Kürze eine E-Mail mit dem nächsten Schritt zur Vervollständigung Ihrer Mandatsangaben.',
      en: 'You will receive an email shortly with the next step to complete your engagement details.',
    },
    error_invalid_email: { de: 'Bitte geben Sie eine gültige E-Mail-Adresse ein.', en: 'Please enter a valid email address.' },
    error_missing_fields: { de: 'Bitte füllen Sie alle Pflichtfelder aus.', en: 'Please fill in all required fields.' },
    error_rate_limit: { de: 'Zu viele Anfragen — bitte versuchen Sie es später erneut.', en: 'Too many requests — please try again later.' },
    error_disabled: { de: 'Online-Mandat ist bei dieser Kanzlei aktuell nicht aktiviert.', en: 'Online intake is currently not enabled for this firm.' },
  },
  footer: {
    imprint: { de: 'Impressum', en: 'Imprint' },
    privacy: { de: 'Datenschutz', en: 'Privacy' },
  },
  mail: {
    invite: {
      subject: {
        de: (kanzlei: string) => `${kanzlei} — Ihr Mandanten-Onboarding`,
        en: (kanzlei: string) => `${kanzlei} — Your Client Onboarding`,
      },
      preheader: {
        de: (kanzlei: string) => `${kanzlei} hat ein Onboarding für Sie vorbereitet.`,
        en: (kanzlei: string) => `${kanzlei} has prepared an onboarding for you.`,
      },
      greeting: { de: 'Sehr geehrte/r Mandant:in,', en: 'Dear client,' },
      intro: {
        de: (kanzlei: string) => `die Kanzlei ${kanzlei} hat ein digitales Mandanten-Onboarding für Sie vorbereitet.`,
        en: (kanzlei: string) => `${kanzlei} has prepared a digital client onboarding for you.`,
      },
      case_label: { de: 'Betreff:', en: 'Re:' },
      step_intro: {
        de: 'Über folgenden Link tragen Sie Ihre Stammdaten ein, bestätigen Vollmacht, Datenschutz und Honorarvereinbarung und laden bei Bedarf Dokumente hoch:',
        en: 'Use the link below to enter your personal details, confirm power of attorney, privacy and fee agreement, and upload documents if required:',
      },
      cta: { de: 'Onboarding starten', en: 'Start onboarding' },
      resume_note: {
        de: 'Sie können den Link mehrfach öffnen und die Bearbeitung jederzeit fortsetzen, solange noch nicht abgeschickt wurde. Die Übertragung erfolgt verschlüsselt.',
        en: 'You can open the link multiple times and continue at any time, as long as you have not yet submitted. All data is transmitted encrypted.',
      },
      contact_note: {
        de: (kanzlei: string) => `Bei Fragen wenden Sie sich direkt an die Kanzlei ${kanzlei}.`,
        en: (kanzlei: string) => `If you have questions, please contact ${kanzlei} directly.`,
      },
    },
    confirmation: {
      subject: {
        de: 'Ihre Bestätigung — Mandanten-Onboarding',
        en: 'Your confirmation — client onboarding',
      },
      preheader: {
        de: 'Ihre Angaben sind bei der Kanzlei eingegangen.',
        en: 'Your information has been received by the firm.',
      },
      greeting: { de: 'Sehr geehrte/r Mandant:in,', en: 'Dear client,' },
      intro: {
        de: (kanzlei: string) => `vielen Dank — Ihre Angaben sind bei der Kanzlei ${kanzlei} eingegangen.`,
        en: (kanzlei: string) => `Thank you — your information has been received by ${kanzlei}.`,
      },
      case_label: { de: 'Betreff:', en: 'Re:' },
      next_steps: {
        de: 'Die Kanzlei meldet sich bei Ihnen, sobald die Bearbeitung beginnt oder Rückfragen bestehen. Bis dahin sind keine weiteren Schritte erforderlich.',
        en: 'The firm will contact you once work has begun or if there are follow-up questions. Until then, no further action is required.',
      },
      copy_note: {
        de: (kanzlei: string) => `Eine Kopie Ihrer Bestätigungen (Vollmacht, Datenschutz, Honorarvereinbarung) wurde der Kanzlei zur Aktenführung zugestellt. Bei Fragen wenden Sie sich direkt an die Kanzlei ${kanzlei}.`,
        en: (kanzlei: string) => `A copy of your confirmations (power of attorney, privacy, fee agreement) has been delivered to the firm for the case file. If you have questions, please contact ${kanzlei} directly.`,
      },
    },
    reminder: {
      subject: {
        de: (kanzlei: string) => `Erinnerung — Onboarding bei ${kanzlei}`,
        en: (kanzlei: string) => `Reminder — onboarding with ${kanzlei}`,
      },
      preheader: {
        de: 'Ihr Mandanten-Onboarding ist noch nicht abgeschlossen.',
        en: 'Your client onboarding is not yet complete.',
      },
      greeting: { de: 'Sehr geehrte/r Mandant:in,', en: 'Dear client,' },
      intro: {
        de: (kanzlei: string) => `Ihr digitales Onboarding bei der Kanzlei ${kanzlei} ist noch nicht abgeschlossen.`,
        en: (kanzlei: string) => `Your digital onboarding with ${kanzlei} is not yet complete.`,
      },
      cta_intro: {
        de: 'Bitte vervollständigen Sie Ihre Angaben über folgenden Link:',
        en: 'Please complete your information using the link below:',
      },
      cta: { de: 'Onboarding fortsetzen', en: 'Continue onboarding' },
      footer: {
        de: (kanzlei: string) => `Falls Sie kein Onboarding bei ${kanzlei} erwarten, ignorieren Sie bitte diese Nachricht.`,
        en: (kanzlei: string) => `If you are not expecting an onboarding with ${kanzlei}, please ignore this message.`,
      },
    },
    reopen: {
      subject: {
        de: (kanzlei: string) => `Bitte um Ergänzung — ${kanzlei}`,
        en: (kanzlei: string) => `Action requested — ${kanzlei}`,
      },
      preheader: {
        de: 'Ihre Akte benötigt eine Korrektur.',
        en: 'Your file requires a correction.',
      },
      greeting: { de: 'Sehr geehrte/r Mandant:in,', en: 'Dear client,' },
      intro: {
        de: (kanzlei: string) => `die Kanzlei ${kanzlei} hat Ihre Akte zur Ergänzung an Sie zurückgegeben.`,
        en: (kanzlei: string) => `${kanzlei} has returned your file for correction.`,
      },
      reason_heading: { de: 'Anmerkung der Kanzlei:', en: 'Note from the firm:' },
      cta_intro: {
        de: 'Bitte passen Sie die betroffenen Schritte an und senden Sie die Akte erneut ab:',
        en: 'Please adjust the affected steps and resubmit your file:',
      },
      cta: { de: 'Akte öffnen', en: 'Open file' },
    },
  },
} as const;

export function pickLang<T>(lang: Lang, table: { de: T; en: T }): T {
  return table[lang];
}

// Convenience wrapper: returns a "scoped" object with helpers all bound to the given lang.
// Verwendung: const i = i18n('en'); i.wizard.title  // 'Client Onboarding'
type ScopedKey<V> = V extends { de: infer D; en: unknown } ? D : never;
type ScopedSection<S> = { [K in keyof S]: ScopedKey<S[K]> };
type Scoped = { [K in keyof typeof STRINGS]: ScopedSection<(typeof STRINGS)[K]> };

export function i18n(lang: Lang): Scoped {
  const out: Record<string, Record<string, unknown>> = {};
  for (const [section, entries] of Object.entries(STRINGS)) {
    const scoped: Record<string, unknown> = {};
    for (const [key, table] of Object.entries(entries as Record<string, { de: unknown; en: unknown }>)) {
      scoped[key] = (table as { de: unknown; en: unknown })[lang];
    }
    out[section] = scoped;
  }
  return out as Scoped;
}
