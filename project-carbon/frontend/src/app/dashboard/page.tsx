"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { createActivityData, calculateEmissions } from "@/services/emissions";
import { generateReport, updateReportStatus } from "@/services/reports";

type Step = 1 | 2 | 3 | 4;

const stepMeta: Array<{ id: Step; title: string; text: string }> = [
  { id: 1, title: "Data Intake", text: "Confirm entity, facility, product, period." },
  { id: 2, title: "Activity Records", text: "Capture electricity and fuel inputs." },
  { id: 3, title: "Emission Model", text: "Calculate and generate report pack." },
  { id: 4, title: "Submission", text: "Move through verification to submission." }
];

export default function DashboardPage() {
  const { logout } = useAuth();
  const [step, setStep] = useState<Step>(1);
  const [companyId, setCompanyId] = useState("1");
  const [factoryId, setFactoryId] = useState("1");
  const [productId, setProductId] = useState("1");
  const [periodId, setPeriodId] = useState("1");
  const [productionQty, setProductionQty] = useState("1000");
  const [reportId, setReportId] = useState("");
  const [result, setResult] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const ids = useMemo(
    () => ({
      companyId: Number(companyId),
      factoryId: Number(factoryId),
      productId: Number(productId),
      reportingPeriodId: Number(periodId),
      productionQuantity: Number(productionQty)
    }),
    [companyId, factoryId, productId, periodId, productionQty]
  );

  const write = (title: string, data: unknown) => setResult(`${title}\n${JSON.stringify(data, null, 2)}`);

  async function run(title: string, fn: () => Promise<unknown>) {
    try {
      setBusy(true);
      write(title, await fn());
    } catch (err) {
      write(`${title}:error`, { message: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="dp-root">
      <div className="dp-shell">
        <header className="dp-top anim-stagger" style={{ "--i": 0 } as React.CSSProperties}>
          <div>
            <p className="dp-kicker">Compliance Operations</p>
            <h1>CBAM Control Center</h1>
          </div>
          <div className="dp-actions">
            <span className="dp-badge">Step {step} / 4</span>
            <button className="dp-btn dp-btn-ghost" onClick={logout}>Logout</button>
          </div>
        </header>

        <section className="dp-overview anim-stagger" style={{ "--i": 1 } as React.CSSProperties}>
          <div className="dp-overview-item">
            <span>Current period</span>
            <strong>Q4 2026</strong>
          </div>
          <div className="dp-overview-item">
            <span>Verification status</span>
            <strong>In review</strong>
          </div>
          <div className="dp-overview-item">
            <span>Evidence completeness</span>
            <strong>92%</strong>
          </div>
          <div className="dp-overview-item">
            <span>Open issues</span>
            <strong>2</strong>
          </div>
        </section>

        <section className="dp-steps anim-stagger" style={{ "--i": 2 } as React.CSSProperties}>
          {stepMeta.map((item) => (
            <article
              key={item.id}
              className={`dp-step ${step === item.id ? "is-active" : ""}`}
              role="button"
              tabIndex={0}
              onClick={() => setStep(item.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") setStep(item.id);
              }}
            >
              <span>{item.id}</span>
              <div>
                <strong>{item.title}</strong>
                <p>{item.text}</p>
              </div>
            </article>
          ))}
        </section>

        {step === 1 && (
          <section className="dp-card anim-stagger" style={{ "--i": 3 } as React.CSSProperties}>
            <h2>Data Intake</h2>
            <div className="dp-grid">
              <input className="ap-input" value={companyId} onChange={(e) => setCompanyId(e.target.value)} placeholder="companyId" />
              <input className="ap-input" value={factoryId} onChange={(e) => setFactoryId(e.target.value)} placeholder="factoryId" />
              <input className="ap-input" value={productId} onChange={(e) => setProductId(e.target.value)} placeholder="productId" />
              <input className="ap-input" value={periodId} onChange={(e) => setPeriodId(e.target.value)} placeholder="reportingPeriodId" />
              <input className="ap-input" value={productionQty} onChange={(e) => setProductionQty(e.target.value)} placeholder="productionQuantity" />
            </div>
            <button className="dp-btn dp-btn-primary" onClick={() => setStep(2)}>Continue</button>
          </section>
        )}

        {step === 2 && (
          <section className="dp-card anim-stagger" style={{ "--i": 3 } as React.CSSProperties}>
            <h2>Activity Records</h2>
            <div className="dp-actions">
              <button
                className="dp-btn dp-btn-primary"
                disabled={busy}
                onClick={() =>
                  run("activity:electricity", () =>
                    createActivityData({
                      ...ids,
                      activityType: "electricity_kwh",
                      quantity: 20000,
                      unit: "kwh",
                      metadata: { geographyCode: "GLOBAL" }
                    })
                  )
                }
              >
                Add Electricity
              </button>
              <button
                className="dp-btn dp-btn-primary"
                disabled={busy}
                onClick={() =>
                  run("activity:fuel", () =>
                    createActivityData({
                      ...ids,
                      activityType: "fuel_liters",
                      quantity: 5000,
                      unit: "liter",
                      metadata: { geographyCode: "GLOBAL" }
                    })
                  )
                }
              >
                Add Fuel
              </button>
              <button className="dp-btn dp-btn-ghost" onClick={() => setStep(3)}>Next</button>
            </div>
          </section>
        )}

        {step === 3 && (
          <section className="dp-card anim-stagger" style={{ "--i": 3 } as React.CSSProperties}>
            <h2>Emission Model</h2>
            <div className="dp-actions">
              <button
                className="dp-btn dp-btn-primary"
                disabled={busy}
                onClick={() =>
                  run("calculate", () =>
                    calculateEmissions({
                      ...ids,
                      productionUnit: "tonne",
                      periodDate: "2026-03-01",
                      useStoredActivityData: true
                    })
                  )
                }
              >
                Calculate Emissions
              </button>
              <button
                className="dp-btn dp-btn-primary"
                disabled={busy}
                onClick={() =>
                  run("report:generate", async () => {
                    const r = await generateReport({ ...ids, productionUnit: "tonne", reportType: "cbam_transitional" });
                    setReportId(String((r as { data: { reportId: number } }).data.reportId));
                    return r;
                  })
                }
              >
                Generate Report Pack
              </button>
              <button className="dp-btn dp-btn-ghost" onClick={() => setStep(4)}>Next</button>
            </div>
          </section>
        )}

        {step === 4 && (
          <section className="dp-card anim-stagger" style={{ "--i": 3 } as React.CSSProperties}>
            <h2>Submission</h2>
            <div className="dp-actions">
              <input className="ap-input dp-id-input" value={reportId} onChange={(e) => setReportId(e.target.value)} placeholder="reportId" />
              <button className="dp-btn dp-btn-ghost" disabled={busy} onClick={() => run("status:ready", () => updateReportStatus(Number(reportId), "ready_for_verification"))}>Ready</button>
              <button className="dp-btn dp-btn-ghost" disabled={busy} onClick={() => run("status:verified", () => updateReportStatus(Number(reportId), "verified"))}>Verified</button>
              <button className="dp-btn dp-btn-primary" disabled={busy} onClick={() => run("status:submitted", () => updateReportStatus(Number(reportId), "submitted", `UI-REF-${Date.now()}`))}>Submitted</button>
            </div>
          </section>
        )}

        <section className="dp-card anim-stagger" style={{ "--i": 4 } as React.CSSProperties}>
          <h2>API Output</h2>
          <pre className="dp-output">{result || "Perform an action to view API response."}</pre>
        </section>
      </div>
    </main>
  );
}