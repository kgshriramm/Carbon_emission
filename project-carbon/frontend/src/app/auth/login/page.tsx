"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { demoLogin, login } from "@/services/auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError("");
      await login(email, password);
      router.push("/dashboard");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const onDemo = async () => {
    try {
      setLoading(true);
      setError("");
      await demoLogin();
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
          <span className="ap-chip">Welcome Back</span>
          <h1>Your CBAM workspace, ready to continue.</h1>
          <p>Access reporting workflows, verification progress, and emissions submissions in one place.</p>
          <div className="ap-mini-grid">
            <article><span>Reports</span><strong>Versioned</strong></article>
            <article><span>Status</span><strong>Tracked</strong></article>
            <article><span>Audit Trail</span><strong>Ready</strong></article>
          </div>
        </section>

        <section className="ap-card">
          <h2>Login</h2>
          <form onSubmit={onSubmit} className="ap-form">
            <input className="ap-input" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input className="ap-input" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <div className="ap-actions">
              <button className="ap-btn ap-btn-primary" disabled={loading} type="submit">
                {loading ? "Please wait..." : "Login"}
              </button>
              <button className="ap-btn ap-btn-ghost" disabled={loading} type="button" onClick={onDemo}>
                One-click Demo
              </button>
            </div>
            {error ? <p className="ap-error">{error}</p> : null}
          </form>
          <p className="ap-meta">No account? <Link href="/auth/register">Create one</Link></p>
        </section>
      </div>
    </main>
  );
}