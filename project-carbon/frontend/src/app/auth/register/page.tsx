"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { register } from "@/services/auth";

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError("");
      await register(fullName, email, password, companyName);
      router.push("/dashboard");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="ap-root">
      <div className="ap-shell">
        <section className="ap-showcase">
          <span className="ap-chip">Start Free</span>
          <h1>Create your exporter workspace in minutes.</h1>
          <p>Register once, connect operations data, and begin generating CBAM-ready reports.</p>
          <div className="ap-mini-grid">
            <article><span>Setup</span><strong>Under 10 min</strong></article>
            <article><span>Workflow</span><strong>4 Guided Steps</strong></article>
            <article><span>Compliance</span><strong>EU CBAM</strong></article>
          </div>
        </section>

        <section className="ap-card">
          <h2>Create account</h2>
          <form onSubmit={onSubmit} className="ap-form">
            <input className="ap-input" placeholder="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            <input className="ap-input" placeholder="Company name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
            <input className="ap-input" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input className="ap-input" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button className="ap-btn ap-btn-primary" disabled={loading} type="submit">
              {loading ? "Creating..." : "Create account"}
            </button>
            {error ? <p className="ap-error">{error}</p> : null}
          </form>
          <p className="ap-meta">Already have an account? <Link href="/auth/login">Login</Link></p>
        </section>
      </div>
    </main>
  );
}