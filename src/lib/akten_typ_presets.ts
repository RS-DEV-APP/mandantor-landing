// DACH-Anwaltsmarkt-Standards: typische Mandatsarten als Akten-Typ-Vorlagen.
// Beim Onboarding kann die Anwältin Presets ankreuzen und sie werden automatisch
// als akten_typ angelegt. Texte sind absichtlich allgemein gehalten — pro Typ
// editierbar in den Settings nach dem Onboarding.

export type AktenTypPreset = {
  key: string;
  name: string;
  description: string;
  vollmacht_template?: string;
  honorar_hourly?: string;
  honorar_advance?: string;
  dsgvo_template?: string;
  file_hints: string[];
};

export const AKTEN_TYP_PRESETS: AktenTypPreset[] = [
  {
    key: 'mietsache',
    name: 'Mietsache',
    description: 'Wohnraum-Mietrecht: Kündigung, Mietminderung, Räumung, Nebenkosten.',
    vollmacht_template:
      'Hiermit bevollmächtige ich die Kanzlei {KANZLEI}, mich in mietrechtlichen Angelegenheiten gerichtlich und außergerichtlich zu vertreten. Die Vollmacht erstreckt sich insbesondere auf Korrespondenz mit Vermieter:in und Hausverwaltung, Beauftragung von Sachverständigen sowie das Stellen aller in Betracht kommenden Anträge.',
    file_hints: ['Mietvertrag', 'Schriftverkehr mit Vermieter:in', 'Nebenkostenabrechnung', 'ggf. Mängelfotos'],
  },
  {
    key: 'verkehrsunfall',
    name: 'Verkehrsunfall',
    description: 'Schadensregulierung nach Verkehrsunfall: Personen-/Sachschäden, Versicherung, Bußgeldverfahren.',
    vollmacht_template:
      'Hiermit bevollmächtige ich die Kanzlei {KANZLEI}, mich in der Verkehrsunfallsache gerichtlich und außergerichtlich zu vertreten. Die Vollmacht erstreckt sich auf die Geltendmachung sämtlicher Ansprüche aus dem Unfallereignis gegenüber Versicherung, Schädiger und Behörden sowie die Entgegennahme von Zahlungen.',
    file_hints: [
      'Polizeibericht / Unfallmitteilung',
      'Schadensgutachten',
      'Versicherungsschein',
      'Lichtbilder vom Unfall',
      'Atteste / Arztberichte (bei Personenschaden)',
    ],
  },
  {
    key: 'familienrecht',
    name: 'Familienrecht',
    description: 'Scheidung, Unterhalt, Sorgerecht, Umgang, Versorgungsausgleich.',
    vollmacht_template:
      'Hiermit bevollmächtige ich die Kanzlei {KANZLEI}, mich in der familienrechtlichen Angelegenheit gerichtlich und außergerichtlich zu vertreten. Die Vollmacht erstreckt sich auf alle damit verbundenen Verfahren (Scheidung, Folgesachen, einstweiliger Rechtsschutz) sowie Korrespondenz mit Jugendamt und Familiengericht.',
    file_hints: [
      'Heiratsurkunde',
      'Geburtsurkunden gemeinsamer Kinder',
      'Einkommensnachweise letzte 12 Monate',
      'Vermögensaufstellung',
      'ggf. Ehevertrag',
    ],
  },
  {
    key: 'arbeitsrecht',
    name: 'Arbeitsrecht',
    description: 'Kündigungsschutz, Aufhebungsvertrag, Abmahnung, Lohnforderungen.',
    vollmacht_template:
      'Hiermit bevollmächtige ich die Kanzlei {KANZLEI}, mich in der arbeitsrechtlichen Angelegenheit gerichtlich und außergerichtlich zu vertreten. Die Vollmacht erstreckt sich auf Korrespondenz mit Arbeitgeber:in, Erhebung der Kündigungsschutzklage sowie Verhandlungen über Aufhebungsvereinbarungen oder Abfindungen.',
    file_hints: [
      'Arbeitsvertrag (inkl. ggf. Zusatzvereinbarungen)',
      'Kündigung / Abmahnung / Aufhebungsvertrag',
      'Letzte 3 Gehaltsabrechnungen',
      'Schriftverkehr mit Arbeitgeber:in',
    ],
  },
  {
    key: 'inkasso',
    name: 'Forderungseinzug (Inkasso)',
    description: 'Außergerichtliche und gerichtliche Geltendmachung offener Forderungen.',
    vollmacht_template:
      'Hiermit bevollmächtige ich die Kanzlei {KANZLEI}, die nachfolgend bezeichneten Forderungen außergerichtlich und gerichtlich geltend zu machen, einschließlich Mahnverfahren, Klage, Zwangsvollstreckung und Abnahme der eidesstattlichen Versicherung.',
    honorar_hourly: '180,00 EUR netto je angefangener Stunde',
    honorar_advance: '0,00 EUR (Vergütung gem. RVG, Erstattung durch Schuldner:in)',
    file_hints: ['Rechnung(en) / Forderungsgrundlage', 'Vorhergehende Mahnungen', 'Vertrag / Auftragsbestätigung', 'Schriftverkehr mit Schuldner:in'],
  },
  {
    key: 'strafrecht',
    name: 'Strafrecht / Verteidigung',
    description: 'Strafverteidigung, Anhörungsbescheid, Strafbefehl, Hauptverhandlung.',
    vollmacht_template:
      'Hiermit bevollmächtige ich die Kanzlei {KANZLEI}, mich in der vorgenannten Strafsache zu verteidigen und zu vertreten. Die Vollmacht erstreckt sich auf Akteneinsicht, Stellung von Anträgen, Einlegung von Rechtsmitteln, Korrespondenz mit Staatsanwaltschaft und Gericht sowie auf Strafvollstreckung.',
    file_hints: [
      'Anhörungsbescheid / Strafbefehl / Anklageschrift',
      'Polizeiliche Vernehmungsprotokolle (falls vorliegend)',
      'Personalpapiere',
    ],
  },
  {
    key: 'erbrecht',
    name: 'Erbrecht',
    description: 'Erbschein, Pflichtteil, Testamentsvollstreckung, Erbauseinandersetzung.',
    vollmacht_template:
      'Hiermit bevollmächtige ich die Kanzlei {KANZLEI}, mich in der erbrechtlichen Angelegenheit gerichtlich und außergerichtlich zu vertreten. Die Vollmacht erstreckt sich auf Beantragung des Erbscheins, Geltendmachung des Pflichtteils, Erbauseinandersetzung und Korrespondenz mit Nachlassgericht und Miterben.',
    file_hints: [
      'Sterbeurkunde',
      'Testament / Erbvertrag (falls vorhanden)',
      'Familienstammbuch',
      'Vermögensaufstellung des Nachlasses',
    ],
  },
];
