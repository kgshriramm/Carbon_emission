"use client";

import Link from "next/link";

const complianceFacts = [
  { label: "CBAM Coverage", value: "Annex I sectors" },
  { label: "Audit Trail", value: "Immutable logs" },
  { label: "Reporting", value: "Quarterly packs" },
  { label: "Verification", value: "Third-party ready" }
];

const checklist = [
  "Plant activity data captured",
  "Emission factors applied",
  "Product allocations validated",
  "Verification evidence attached",
  "Submission file generated"
];

const artifacts = [
  { title: "Audit Log Export", meta: "CSV + JSON" },
  { title: "CBAM Report Pack", meta: "PDF + XML" },
  { title: "Verification Dossier", meta: "Annex-ready" }
];

export default function LandingPage() {
  return (
    <main className="lp-root">
      <div className="lp-bg" aria-hidden="true">
        <span className="lp-blob lp-blob-a" />
      </div>

      <div className="lp-shell">
        <nav className="lp-nav anim-stagger" style={{ "--i": 0 } as React.CSSProperties}>
          <strong className="lp-brand">Project Carbon</strong>
          <div className="lp-nav-links">
            <Link href="#product">Product</Link>
            <Link href="#cbam">CBAM</Link>
            <Link href="#pricing">Pricing</Link>
            <Link href="#docs">Docs</Link>
          </div>
          <div className="lp-actions">
            <Link className="lp-btn lp-btn-ghost" href="/auth/login">Login</Link>
            <Link className="lp-btn lp-btn-primary" href="/auth/register">Start Free</Link>
          </div>
        </nav>

        <section className="lp-hero-grid" id="product">
          <div className="lp-hero-copy anim-stagger" style={{ "--i": 1 } as React.CSSProperties}>
            <span className="lp-chip">Built for EU Carbon Border Adjustment Mechanism (CBAM)</span>
            <h1>Compliance-grade carbon reporting for Indian exporters to the EU.</h1>
            <p>
              Capture plant activity, calculate product-level emissions, and generate audit-ready
              CBAM submissions with verified evidence trails.
            </p>
            <div className="lp-actions">
              <Link className="lp-btn lp-btn-primary" href="/auth/register">Start Free</Link>
              <Link className="lp-btn lp-btn-ghost" href="/auth/login">View Demo</Link>
            </div>
            <div className="lp-metrics">
              {complianceFacts.map((item, idx) => (
                <article className="lp-metric anim-stagger" style={{ "--i": idx + 2 } as React.CSSProperties} key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </article>
              ))}
            </div>
          </div>

          <aside className="lp-preview anim-stagger" style={{ "--i": 2 } as React.CSSProperties} aria-label="Compliance checklist">
            <header className="lp-preview-top">
              <strong>CBAM Readiness</strong>
              <span>Q4 2026</span>
            </header>
            <div className="lp-preview-main-kpi">
              <span>Submission status</span>
              <strong>On track</strong>
            </div>
            <ul className="lp-checklist">
              {checklist.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </aside>
        </section>

        <section className="lp-trust anim-stagger" style={{ "--i": 3 } as React.CSSProperties} id="cbam">
          <article className="lp-trust-item">Mapped to CBAM Annex I categories</article>
          <article className="lp-trust-item">Audit log export with immutable timestamps</article>
          <article className="lp-trust-item">Evidence pack with verification checklist</article>
          <article className="lp-trust-item">Submission formats aligned to EU schema</article>
        </section>

        <section className="lp-section anim-stagger" style={{ "--i": 4 } as React.CSSProperties} aria-label="Evidence Pack">
          <div className="lp-section-head">
            <h2>Compliance Evidence Pack</h2>
            <p>Provide auditors with complete, structured, and traceable documentation.</p>
          </div>
          <div className="lp-artifacts">
            {artifacts.map((item, idx) => (
              <div className="lp-artifact anim-stagger" style={{ "--i": idx } as React.CSSProperties} key={item.title}>
                <strong>{item.title}</strong>
                <span>{item.meta}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="lp-section anim-stagger" style={{ "--i": 5 } as React.CSSProperties}>
          <div className="lp-section-head">
            <h2>How It Works</h2>
          </div>
          <div className="lp-timeline">
            <div className="lp-timeline-item">
              <span>1</span>
              <p>Upload manufacturing activity data</p>
            </div>
            <div className="lp-timeline-item">
              <span>2</span>
              <p>Calculate carbon emissions by product</p>
            </div>
            <div className="lp-timeline-item">
              <span>3</span>
              <p>Generate audit-ready CBAM reports</p>
            </div>
            <div className="lp-timeline-item">
              <span>4</span>
              <p>Submit with verification evidence attached</p>
            </div>
          </div>
        </section>

        <section className="lp-section anim-stagger" style={{ "--i": 6 } as React.CSSProperties} id="pricing">
          <div className="lp-section-head">
            <h2>Pricing</h2>
            <p>Clear plans for exporters scaling compliance operations.</p>
          </div>
          <div className="lp-artifacts">
            <div className="lp-artifact">
              <strong>Starter</strong>
              <span>Single entity + audit export</span>
            </div>
            <div className="lp-artifact">
              <strong>Growth</strong>
              <span>Multi-facility + verification workflow</span>
            </div>
            <div className="lp-artifact">
              <strong>Enterprise</strong>
              <span>Dedicated onboarding + integrations</span>
            </div>
          </div>
        </section>

        <footer className="lp-footer anim-stagger" style={{ "--i": 7 } as React.CSSProperties} id="docs">
          <Link href="#">About</Link>
          <Link href="#">Contact</Link>
          <Link href="#">Documentation</Link>
          <Link href="#">Privacy</Link>
          <Link href="#">Terms</Link>
        </footer>
      </div>
    </main>
  );
}