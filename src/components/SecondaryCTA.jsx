// Secondary CTA — inline Probelauf-Anmeldung.
//
// Variante C aus der Discovery: Tally-Umfrage bleibt für die breite
// Bedarfserhebung; dieses Inline-Formular ist nur für Pilot-Anmeldungen
// (Kanzleien, die jetzt schon mitmachen wollen).
//
// Submission läuft über Formspree (kostenlos, Mail an Rolf).
// Setup: https://formspree.io → neues Formular anlegen → ID in
// FORMSPREE_ENDPOINT unten einsetzen.
import { useState } from 'react';

// TODO Rolf: Formspree-ID einsetzen (siehe landing-page/README.md, Schritt 4)
const FORMSPREE_ENDPOINT = 'https://formspree.io/f/xeenjkea';

export default function SecondaryCTA() {
  const [email, setEmail] = useState('');
  const [firm, setFirm] = useState('');
  const [size, setSize] = useState('');
  const [status, setStatus] = useState('idle'); // idle | submitting | success | error

  const submit = async (e) => {
    e.preventDefault();
    if (!email || !firm) return;

    setStatus('submitting');

    try {
      const res = await fetch(FORMSPREE_ENDPOINT, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ Kanzlei: firm, Email: email, Kanzleigroesse: size }),
      });
      if (res.ok) setStatus('success');
      else setStatus('error');
    } catch {
      setStatus('error');
    }
  };

  return (
    <section id="kontakt" className="cta-section">
      <div className="container">
        <div className="cta-marker-row">
          <span className="marker">
            <span className="pilcrow">§</span>
            <span>05 — Probelauf</span>
          </span>
          <span className="mono">Vier Fragen. Neunzig Sekunden.</span>
        </div>

        <div className="cta-grid">
          <div>
            <h2 className="serif cta-title">
              Eintragen, wenn der Bedarf da ist.
            </h2>
            <p className="lead cta-lead">
              Wir nehmen ab Sommer drei Kanzleien in einen kostenlosen, geschlossenen Probelauf auf.
              Keine Vertragsbindung, kein Vertriebsanruf — nur ein ausgemachter Termin
              und Ihr ehrliches Feedback im Tausch gegen frühen Zugang.
            </p>
            <p className="cta-survey-link mono">
              Lieber zuerst die anonyme Umfrage ausfüllen?{' '}
              <a
                href="https://tally.so/r/9q6PbY"
                target="_blank"
                rel="noopener"
                className="tlink"
              >
                5-Minuten-Umfrage öffnen →
              </a>
            </p>
          </div>

          {status !== 'success' ? (
            <form onSubmit={submit} className="cta-form">
              <label className="cta-row">
                <span className="mono">Kanzlei</span>
                <input
                  required
                  value={firm}
                  onChange={(e) => setFirm(e.target.value)}
                  placeholder="z. B. Kanzlei Sieweke & Partner"
                  className="cta-input"
                />
              </label>
              <label className="cta-row">
                <span className="mono">E-Mail</span>
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="rolf@kanzlei-sieweke.de"
                  className="cta-input"
                />
              </label>
              <label className="cta-row">
                <span className="mono">Kanzleigröße</span>
                <div className="cta-size-grid">
                  {['1', '2–5', '6–10', '11–20'].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSize(s)}
                      className={`cta-size-btn${size === s ? ' is-active' : ''}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </label>
              <div className="cta-foot">
                <span className="mono">DSGVO · keine Weitergabe</span>
                <button type="submit" className="btn" disabled={status === 'submitting'}>
                  <span>{status === 'submitting' ? 'Wird gesendet …' : 'Probelauf anfragen'}</span>
                  <span className="arrow">→</span>
                </button>
              </div>
              {status === 'error' && (
                <p className="cta-error mono">
                  Senden fehlgeschlagen. Bitte direkt an{' '}
                  <a href="mailto:hello@mandantor.de" className="tlink">
                    hello@mandantor.de
                  </a>{' '}
                  schreiben.
                </p>
              )}
            </form>
          ) : (
            <div className="cta-success">
              <span className="mono cta-success-tag">§ Eingegangen</span>
              <h3 className="serif cta-success-title">
                Vermerkt. Sie hören innerhalb eines Werktags von uns.
              </h3>
              <p className="cta-success-text">
                Wir melden uns persönlich, nicht aus einem Marketing-Postfach.
                Antwort kommt von hello@mandantor.de.
              </p>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .cta-section {
          padding: 120px 0;
          border-top: 1px solid var(--rule);
        }
        .cta-marker-row {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          margin-bottom: 48px;
        }
        .cta-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 80px;
          align-items: start;
        }
        .cta-title {
          font-size: clamp(36px, 4.5vw, 56px);
          line-height: 1.1;
          letter-spacing: -0.02em;
          max-width: 14ch;
        }
        .cta-lead { margin-top: 24px; font-size: 17px; }
        .cta-survey-link { margin-top: 24px; }

        .cta-form {
          border: 1px solid var(--rule-strong);
          padding: 32px;
          background: var(--paper);
          display: flex;
          flex-direction: column;
          gap: 18px;
        }
        .cta-row {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .cta-row > .mono { font-size: 10.5px; }
        .cta-input {
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
        .cta-input:focus { border-color: var(--ink); }

        .cta-size-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
        }
        .cta-size-btn {
          padding: 12px 8px;
          border: 1px solid var(--rule);
          background: transparent;
          color: var(--ink-2);
          font-family: var(--sans);
          font-size: 14px;
          border-radius: 2px;
          cursor: pointer;
          transition: all .15s;
        }
        .cta-size-btn.is-active {
          border-color: var(--ink);
          background: var(--ink);
          color: var(--paper);
        }

        .cta-foot {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 8px;
        }

        .cta-error {
          color: #B23A3A;
          margin-top: 8px;
        }

        .cta-success {
          border: 1px solid var(--rule-strong);
          padding: 40px;
          background: var(--paper);
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .cta-success-tag { color: var(--gold); }
        .cta-success-title {
          font-size: 28px;
          letter-spacing: -0.015em;
        }
        .cta-success-text { color: var(--ink-2); font-size: 15px; }

        @media (max-width: 880px) {
          .cta-section { padding: 64px 0; }
          .cta-marker-row { flex-direction: column; gap: 8px; align-items: flex-start; margin-bottom: 32px; }
          .cta-grid { grid-template-columns: 1fr; gap: 32px; }
          .cta-form { padding: 20px; }
          .cta-foot { flex-direction: column; gap: 16px; align-items: flex-start; }
        }
      `}</style>
    </section>
  );
}
