// "How it works" — interactive preview of what the client sees.
// Five steps in a left rail; right side is a live, navigable
// rendering of the actual onboarding form (no fake screenshot).
import { useState } from 'react';

const STEPS = [
  {
    n: '01',
    label: 'Stammdaten',
    title: 'Persönliche Angaben',
    description:
      'Vor- und Nachname, Anschrift, Geburtsdatum, Telefon, E-Mail. Pflichtfelder klar markiert.',
    fields: [
      {
        type: 'split',
        items: [
          { label: 'Vorname', placeholder: 'Maria' },
          { label: 'Nachname', placeholder: 'Schneider' },
        ],
      },
      { type: 'text', label: 'Straße und Hausnummer', placeholder: 'Lindenstraße 12' },
      {
        type: 'split',
        items: [
          { label: 'PLZ', placeholder: '40213' },
          { label: 'Ort', placeholder: 'Düsseldorf' },
        ],
      },
      { type: 'text', label: 'E-Mail', placeholder: 'maria.schneider@…' },
    ],
  },
  {
    n: '02',
    label: 'Vollmacht',
    title: 'Vollmacht zur Vertretung',
    description: 'Vorformulierter Text der Bundesrechtsanwaltskammer. Anpassbar pro Kanzlei.',
    note:
      'Hiermit bevollmächtige ich die Kanzlei [Kanzleiname], mich in der Angelegenheit [Aktenzeichen] gerichtlich und außergerichtlich zu vertreten. Die Vollmacht erstreckt sich insbesondere auf das Empfangen von Zustellungen sowie auf die Begründung und Aufhebung von Vertragsverhältnissen.',
  },
  {
    n: '03',
    label: 'DSGVO',
    title: 'Datenschutzbelehrung',
    description:
      'Verständliche Belehrung nach Art. 13 DSGVO. Kein Juristen-Deutsch, aber rechtssicher.',
    checks: [
      'Ich wurde über die Verarbeitung meiner Daten informiert.',
      'Ich kenne meine Rechte (Auskunft, Berichtigung, Löschung).',
      'Mir ist die Auftragsverarbeitung bekannt.',
    ],
  },
  {
    n: '04',
    label: 'Honorar',
    title: 'Honorarvereinbarung',
    description:
      'Stundensatz oder Pauschale. Die Kanzlei trägt einmalig den Rahmen ein, der Mandant bestätigt.',
    pricing: [
      { row: 'Stundensatz', val: '€ 280,00 zzgl. USt.' },
      { row: 'Schreibauslagen', val: 'Nach RVG' },
      { row: 'Vorschuss', val: '€ 1 000,00' },
    ],
  },
  {
    n: '05',
    label: 'Unterlagen',
    title: 'Dokumenten-Upload',
    description:
      'Mandant lädt Anschreiben, Bescheide, Verträge in einer Sitzung hoch — Drag & Drop.',
    files: [
      { name: 'Bescheid_Finanzamt_2025.pdf', size: '1,2 MB' },
      { name: 'Mietvertrag.pdf', size: '480 KB' },
      { name: 'Schriftsatz_Gegenseite.pdf', size: '740 KB' },
    ],
  },
];

const Field = ({ label, placeholder }) => {
  const [v, setV] = useState('');
  return (
    <label className="hiw-field">
      <span className="mono hiw-field-label">{label}</span>
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder={placeholder}
        className="hiw-input"
      />
    </label>
  );
};

const FormFields = ({ fields }) => (
  <div className="hiw-fields">
    {fields.map((f, i) => {
      if (f.type === 'split') {
        return (
          <div key={i} className="hiw-split">
            {f.items.map((it, j) => (
              <Field key={j} label={it.label} placeholder={it.placeholder} />
            ))}
          </div>
        );
      }
      return <Field key={i} label={f.label} placeholder={f.placeholder} />;
    })}
  </div>
);

const Clause = ({ text }) => (
  <blockquote className="serif hiw-clause">„{text}"</blockquote>
);

const Checks = ({ items }) => {
  const [state, setState] = useState(items.map(() => false));
  return (
    <div className="hiw-checks">
      {items.map((t, i) => (
        <button
          key={i}
          onClick={() =>
            setState((s) => s.map((v, j) => (j === i ? !v : v)))
          }
          className="hiw-check"
        >
          <span className={`hiw-check-box${state[i] ? ' is-checked' : ''}`}>
            {state[i] && <span className="hiw-check-mark">✓</span>}
          </span>
          <span className="hiw-check-label">{t}</span>
        </button>
      ))}
    </div>
  );
};

const Pricing = ({ rows }) => (
  <div className="hiw-pricing">
    {rows.map((r, i) => (
      <div key={i} className="hiw-pricing-row">
        <span className="hiw-pricing-key">{r.row}</span>
        <span className="serif hiw-pricing-val">{r.val}</span>
      </div>
    ))}
  </div>
);

const Files = ({ items }) => (
  <div className="hiw-files">
    {items.map((f, i) => (
      <div key={i} className="hiw-file">
        <span className="hiw-file-name">{f.name}</span>
        <span className="mono">{f.size}</span>
        <span className="mono hiw-file-state">✓ hochgeladen</span>
      </div>
    ))}
    <div className="hiw-dropzone">
      Weitere Datei hier ablegen oder{' '}
      <span className="tlink hiw-dropzone-link">auswählen</span>
    </div>
  </div>
);

const PreviewPane = ({ step }) => (
  <div className="hiw-preview">
    {/* Restrained browser chrome */}
    <div className="hiw-preview-chrome">
      <div className="hiw-preview-dots">
        <span /><span /><span />
      </div>
      <span className="mono hiw-preview-url">
        kanzlei-merten.mandantor.de / aufnahme
      </span>
      <span className="mono hiw-preview-step">{step.n} / 05</span>
    </div>

    <div className="hiw-preview-body">
      <div className="mono hiw-preview-eyebrow">
        Schritt {step.n} — {step.label}
      </div>
      <h3 className="serif hiw-preview-title">{step.title}</h3>
      <p className="hiw-preview-desc">{step.description}</p>

      {step.fields && <FormFields fields={step.fields} />}
      {step.note && <Clause text={step.note} />}
      {step.checks && <Checks items={step.checks} />}
      {step.pricing && <Pricing rows={step.pricing} />}
      {step.files && <Files items={step.files} />}

      <div className="hiw-preview-foot">
        <span className="mono">verschlüsselt · zwischen­gespeichert</span>
        <button className="btn hiw-next">
          <span>{step.n === '05' ? 'Senden' : 'Weiter'}</span>
          <span className="arrow">→</span>
        </button>
      </div>
    </div>
  </div>
);

export default function HowItWorks() {
  const [active, setActive] = useState(0);
  const step = STEPS[active];

  return (
    <section id="how" className="hiw">
      <div className="container">
        <div className="hiw-marker-row">
          <span className="marker">
            <span className="pilcrow">§</span>
            <span>02 — Ablauf</span>
          </span>
          <span className="mono">Was Ihr Mandant tatsächlich sieht</span>
        </div>

        <h2 className="serif hiw-title">
          Fünf Schritte. Ein Link. <em>Kein</em> Hin und Her per E-Mail.
        </h2>

        <div className="hiw-grid">
          <ol className="hiw-rail">
            {STEPS.map((s, i) => {
              const isActive = i === active;
              return (
                <li key={s.n} className="hiw-rail-item">
                  <button
                    onClick={() => setActive(i)}
                    className={`hiw-rail-btn${isActive ? ' is-active' : ''}`}
                  >
                    <span
                      className="mono hiw-rail-num"
                      style={isActive ? { color: 'var(--gold)' } : undefined}
                    >
                      {s.n}
                    </span>
                    <span className="serif hiw-rail-label">{s.label}</span>
                    <span
                      className="hiw-rail-arrow"
                      style={{ opacity: isActive ? 1 : 0 }}
                    >
                      →
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

          <PreviewPane step={step} />
        </div>
      </div>

      <style>{`
        .hiw {
          padding: 96px 0;
          background: var(--paper-2);
          border-top: 1px solid var(--rule);
          border-bottom: 1px solid var(--rule);
        }
        .hiw-marker-row {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          margin-bottom: 56px;
        }
        .hiw-title {
          font-size: clamp(32px, 4vw, 48px);
          max-width: 20ch;
          margin-bottom: 56px;
        }
        .hiw-title em { font-style: italic; }
        .hiw-grid {
          display: grid;
          grid-template-columns: 320px 1fr;
          gap: 56px;
          align-items: start;
        }
        .hiw-rail {
          list-style: none;
          padding: 0;
          margin: 0;
          border-top: 1px solid var(--rule);
        }
        .hiw-rail-item { border-bottom: 1px solid var(--rule); }
        .hiw-rail-btn {
          width: 100%;
          text-align: left;
          background: transparent;
          border: 0;
          padding: 20px 0;
          display: grid;
          grid-template-columns: 40px 1fr 16px;
          gap: 16px;
          align-items: center;
          color: var(--muted);
          transition: color .15s ease;
          font-family: inherit;
        }
        .hiw-rail-btn:hover { color: var(--ink-2); }
        .hiw-rail-btn.is-active { color: var(--ink); }
        .hiw-rail-label { font-size: 19px; letter-spacing: -0.01em; }
        .hiw-rail-arrow { transition: opacity .15s; }

        .hiw-preview {
          background: var(--paper);
          border: 1px solid var(--rule);
          border-radius: 4px;
          overflow: hidden;
          min-height: 520px;
          display: flex;
          flex-direction: column;
        }
        .hiw-preview-chrome {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 18px;
          border-bottom: 1px solid var(--rule);
          background: var(--paper-2);
        }
        .hiw-preview-dots {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .hiw-preview-dots span {
          width: 8px;
          height: 8px;
          border-radius: 8px;
          background: var(--rule-strong);
          opacity: 0.4;
        }
        .hiw-preview-url, .hiw-preview-step { font-size: 11px; }
        .hiw-preview-body { padding: 40px 56px; flex: 1; }
        .hiw-preview-eyebrow { margin-bottom: 8px; }
        .hiw-preview-title {
          font-size: 28px;
          letter-spacing: -0.015em;
          margin-bottom: 12px;
        }
        .hiw-preview-desc {
          color: var(--muted);
          max-width: 52ch;
          margin-bottom: 32px;
          font-size: 15px;
        }
        .hiw-preview-foot {
          margin-top: 40px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .hiw-next { padding: 12px 18px; font-size: 14px; }

        .hiw-fields {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .hiw-split {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }
        .hiw-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .hiw-field-label { font-size: 10.5px; }
        .hiw-input {
          font-family: var(--sans);
          font-size: 15px;
          padding: 12px 14px;
          background: var(--paper);
          border: 1px solid var(--rule);
          border-radius: 2px;
          color: var(--ink);
          outline: none;
          transition: border-color .15s;
        }
        .hiw-input:focus { border-color: var(--ink); }

        .hiw-clause {
          font-size: 18px;
          line-height: 1.6;
          color: var(--ink-2);
          border-left: 1px solid var(--gold);
          margin: 0;
          padding: 4px 0 4px 24px;
          max-width: 60ch;
        }

        .hiw-checks {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .hiw-check {
          display: grid;
          grid-template-columns: 20px 1fr;
          gap: 14px;
          background: transparent;
          border: 0;
          text-align: left;
          padding: 8px 0;
          font-family: inherit;
        }
        .hiw-check-box {
          width: 20px;
          height: 20px;
          border: 1px solid var(--rule-strong);
          border-radius: 2px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          transition: background .15s;
        }
        .hiw-check-box.is-checked { background: var(--ink); }
        .hiw-check-mark { color: var(--paper); font-size: 12px; line-height: 1; }
        .hiw-check-label { font-size: 15px; color: var(--ink-2); }

        .hiw-pricing { border-top: 1px solid var(--rule); }
        .hiw-pricing-row {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          padding: 14px 0;
          border-bottom: 1px solid var(--rule);
        }
        .hiw-pricing-key { font-size: 15px; color: var(--ink-2); }
        .hiw-pricing-val { font-size: 18px; }

        .hiw-files {
          display: flex;
          flex-direction: column;
          gap: 0;
          border-top: 1px solid var(--rule);
        }
        .hiw-file {
          display: grid;
          grid-template-columns: 1fr auto auto;
          gap: 16px;
          align-items: center;
          padding: 14px 0;
          border-bottom: 1px solid var(--rule);
        }
        .hiw-file-name { font-size: 15px; }
        .hiw-file-state { color: var(--gold); }
        .hiw-dropzone {
          margin-top: 16px;
          border: 1px dashed var(--rule-strong);
          padding: 24px;
          text-align: center;
          color: var(--muted);
          font-size: 14px;
        }
        .hiw-dropzone-link { color: var(--ink); }

        @media (max-width: 880px) {
          .hiw-grid { grid-template-columns: 1fr; gap: 32px; }
          .hiw-preview-body { padding: 24px 20px; }
          .hiw-preview-url { display: none; }
          .hiw-marker-row { flex-direction: column; gap: 8px; align-items: flex-start; margin-bottom: 32px; }
          .hiw-title { margin-bottom: 32px; }
        }
      `}</style>
    </section>
  );
}
