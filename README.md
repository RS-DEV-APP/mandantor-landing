# Mandantor Landing Page (Astro)

Editoriale Landing Page für mandantor.de. Astro mit React-Inseln für die interaktiven Stellen
(„How it works"-Tab-Switcher, Pilot-Anmeldeformular).

---

## Was du anfassen musst, bevor das live geht

| Was | Wo | Warum |
|---|---|---|
| Adresse einfügen | `src/pages/impressum.astro` und `src/pages/datenschutz.astro` (Platzhalter `[Straße…]`) | Pflichtangabe nach § 5 TMG |
| Aufsichtsbehörde prüfen | `src/pages/datenschutz.astro` Abschnitt 7 | aktuell auf Bayern (BayLDA Ansbach) gesetzt — bei Standortwechsel anpassen |
| Formspree-ID setzen | `src/components/SecondaryCTA.jsx` Konstante `FORMSPREE_ENDPOINT` | sonst funktioniert das Pilot-Formular nicht (siehe „Formspree einrichten" unten) |
| Milestones im Status-Block aktualisieren | `src/components/Status.astro` | wenn sich der reale Stand ändert (Pilotphase startet, Kanzleien hinzukommen) |

---

## Lokale Vorschau (optional, nur falls du Node installiert hast)

```bash
npm install
npm run dev          # öffnet http://localhost:4321
npm run build        # erzeugt produktionsreife Dateien in dist/
```

Falls du **kein Node installieren** willst — überspringe das. Cloudflare Pages baut die Seite
automatisch in der Cloud, sobald du die Dateien hinterlegst (siehe „Deployment").

---

## Deployment auf Cloudflare Pages

### Variante A — Direkt-Upload (einfachste, ohne Git)

1. Auf einem Rechner mit Node: `npm install && npm run build` ausführen → erzeugt Ordner `dist/`
2. Auf [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Pages** → **Direct Upload**
3. Den Inhalt des `dist/`-Ordners als ZIP hochladen
4. Custom Domain `mandantor.de` zuweisen → Cloudflare gibt DNS-Anweisungen für deine Domain bei INWX

> Wenn du Variante A nutzt, musst du bei jeder Inhaltsänderung neu bauen und neu hochladen.
> Für Discovery-Phase ist das oft genug, sobald der Inhalt steht.

### Variante B — Git + Auto-Build (empfohlen für laufende Anpassungen)

1. GitHub-Konto anlegen (kostenlos, ~5 Min)
2. Neues Repository `mandantor-landing` erstellen → den Inhalt von `landing-page/` hochladen
   (per Web-UI ist das ein Drag-and-Drop in den GitHub-Browser, kein Git-Befehl nötig)
3. In Cloudflare Pages → **Create** → **Pages** → **Connect to Git** → GitHub-Repo auswählen
4. Build-Einstellungen:
   - **Framework preset:** Astro
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
5. **Save and Deploy** → in 1–2 Min ist die Seite unter `mandantor.pages.dev` live
6. Custom Domain `mandantor.de` verbinden — Cloudflare gibt dir den CNAME für INWX

Bei jedem Update auf GitHub baut Cloudflare automatisch neu. Eine Text-Änderung in der
Status-Sektion wird nach Push in 1–2 Min live.

---

## Formspree einrichten (Pflicht, damit das Pilot-Formular funktioniert)

1. Auf [formspree.io](https://formspree.io) Konto anlegen (kostenlos, 50 Submissions/Monat)
2. Neues Formular erstellen → E-Mail-Empfänger: `hello@mandantor.de`
3. Formspree gibt dir eine URL der Form `https://formspree.io/f/abcd1234`
4. Diese URL in `src/components/SecondaryCTA.jsx` als `FORMSPREE_ENDPOINT` einsetzen
5. Lokal kurz testen oder direkt deployen

> Solange `FORMSPREE_ENDPOINT` auf dem Platzhalter `YOUR_FORM_ID` steht, zeigt das Formular
> beim Absenden eine Fehlermeldung mit Mailto-Fallback an. Niemand verliert Daten — aber Pilot-
> Anmeldungen kommen nicht bei dir an.

---

## Projektstruktur

```
landing-page/
├── package.json              ← Astro + React-Abhängigkeiten
├── astro.config.mjs          ← Astro-Konfiguration
├── tsconfig.json             ← TypeScript für Astro
├── public/
│   └── icon.svg              ← Favicon (Mandantor-„M")
├── src/
│   ├── styles/
│   │   └── global.css        ← Design-Tokens + Basis-Styles
│   ├── layouts/
│   │   └── Layout.astro      ← Shared HTML-Hülle (Head, Fonts, Body)
│   ├── components/
│   │   ├── BrandIcon.astro   ← Logo-Icon mit Signature-Line
│   │   ├── Wordmark.astro    ← Mandantor-Schriftzug
│   │   ├── Nav.astro         ← Top-Navigation (mit Vanilla-JS für Scroll)
│   │   ├── Hero.astro        ← Sektion 01 — Einleitung
│   │   ├── HowItWorks.jsx    ← Sektion 02 — interaktive Schritt-Vorschau (React-Insel)
│   │   ├── Features.astro    ← Sektion 03 — drei Punkte
│   │   ├── Status.astro      ← Sektion 04 — ehrliche Discovery-Timeline
│   │   ├── SecondaryCTA.jsx  ← Sektion 05 — Pilot-Anmeldung (React-Insel)
│   │   └── Footer.astro      ← Sektion 06 — Footer
│   └── pages/
│       ├── index.astro       ← Hauptseite
│       ├── impressum.astro   ← Pflicht-Impressum
│       └── datenschutz.astro ← Datenschutzerklärung
└── .gitignore
```

---

## Häufige Bearbeitungen

### Status-Milestones aktualisieren
`src/components/Status.astro` — Array `milestones` enthält die Zeile pro Eintrag.
States: `done` (schwarzer Punkt) · `active` (goldener Punkt, kursiv) · `next` / `planned`
(leerer Punkt mit Rand). Beim nächsten echten Fortschritt: state ändern + Datum im
`lastReviewed` aktualisieren.

### Hero-Headline ändern
`src/components/Hero.astro` — die `<h1>`-Zeile. Das `<em>` macht das letzte Wort kursiv.

### Tally-Umfrage-URL austauschen
Suchen nach `tally.so/r/9q6PbY` und überall ersetzen (kommt in `Nav` und `SecondaryCTA` vor).

### Schriftgrößen anpassen
`src/styles/global.css` — die `--fs-*` Variablen unter `:root`. Eine Änderung dort wirkt überall.

### Neue Sektion hinzufügen
Neue `.astro`-Datei in `src/components/`, dann in `src/pages/index.astro` zwischen den
existierenden Sektionen importieren und einfügen.

---

## Rückfall: Plain-HTML-Variante (auf Anfrage)

Falls du zum Schluss kommst, dass dir der Astro-Setup zu schwer ist — sag mir Bescheid.
Ich generiere aus dieser Source eine reine HTML/CSS/JS-Variante, die du per Drag-and-Drop
auf Cloudflare Pages ziehen kannst, ohne jeden Build-Step. Visuelles Ergebnis: identisch.
