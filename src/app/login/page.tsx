"use client";

import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { ROLES } from "@/domain/permissions";
import type { Role } from "@/domain/types";

type Providers = { providers: Array<{ id: string; name: string }>; devLogin: Array<{ email: string; name: string; role: Role }> | null };

const ERRORS: Record<string, string> = {
  provider: "That sign-in option isn't set up.",
  state: "The sign-in took too long or was interrupted. Please try again.",
  email: "Your account didn't share a verified email address, so we couldn't sign you in.",
  signin: "Sign-in failed. Please try again.",
};

export default function LoginPage() {
  const [opts, setOpts] = useState<Providers | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("error");
    if (code) setError(ERRORS[code] ?? ERRORS.signin);
    fetch("/api/auth/providers").then((r) => r.json()).then(setOpts).catch(() => setError("Could not load sign-in options."));
  }, []);

  const devSignIn = async (email: string) => {
    setBusy(email);
    const res = await fetch("/api/auth/dev-login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
    if (res.ok) window.location.href = "/";
    else { setBusy(null); setError("Developer sign-in failed."); }
  };

  const roleLabel = (r: Role) => ROLES.find((x) => x.role === r)?.label ?? r;

  return (
    <main className="login">
      <div className="login-card">
        <Logo href="/login" />
        <div>
          <p className="eyebrow">Value Loop</p>
          <h1>Sign in</h1>
          <p className="sub">Use your work account. You'll see the workspaces you've been invited to.</p>
        </div>
        {error && <p className="banner" role="alert">{error}</p>}
        {opts && (
          <div className="login-options">
            {opts.providers.map((p) => (
              <a key={p.id} className="btn btn-pri btn-wide" href={`/api/auth/login/${p.id}`}>Continue with {p.name}</a>
            ))}
            {opts.providers.length === 0 && !opts.devLogin && <p className="muted">No sign-in method is set up yet. See the README for how to add Microsoft or Google.</p>}
          </div>
        )}
        {opts?.devLogin && (
          <section className="dev-login">
            <p className="label">Developer sign-in</p>
            <p className="muted" style={{ fontSize: 13 }}>For trying the roles with example people. Turned off in production.</p>
            {opts.devLogin.map((u) => (
              <button key={u.email} className="dev-user" onClick={() => devSignIn(u.email)} disabled={!!busy}>
                <b>{u.name}</b>
                <span className="muted">{roleLabel(u.role)} · {u.email}</span>
              </button>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
