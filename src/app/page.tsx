"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { call } from "@/lib/store";
import type { MeResponse } from "@/lib/api-types";
import { Logo } from "@/components/Logo";

/** Sends people to their first workspace, or explains what to do when they have none. */
export default function Home() {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    call<MeResponse>("GET", "/api/me").then((m) => {
      if (m.workspaces.length) router.replace(`/w/${m.workspaces[0].slug}`);
      else setMe(m);
    }).catch(() => {});
  }, [router]);

  const signOut = async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/login"; };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const ws = await call<{ slug: string }>("POST", "/api/workspaces", { name, slug });
      router.replace(`/w/${ws.slug}`);
    } catch (err) { setError((err as Error).message); }
  };

  if (!me) return <main className="login"><p className="muted">Loading…</p></main>;
  return (
    <main className="login">
      <div className="login-card">
        <Logo href="/" />
        <div>
          <p className="eyebrow">Signed in as {me.user.email}</p>
          <h1>No workspace yet</h1>
          <p className="sub">{me.user.isBuildway ? "Create a workspace for a customer. You'll be its advisor and can invite people." : "You're not a member of any workspace. Ask your Buildway advisor or your company's admin to invite this email address."}</p>
        </div>
        {me.user.isBuildway && (
          <form className="login-options" onSubmit={create}>
            <label className="field"><span>Customer name</span><input id="ws-name" value={name} onChange={(e) => { setName(e.target.value); setSlug(e.target.value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")); }} required minLength={2} /></label>
            <label className="field"><span>Address</span><input id="ws-slug" value={slug} onChange={(e) => setSlug(e.target.value)} required pattern="[a-z0-9-]+" /></label>
            {error && <p className="banner" role="alert">{error}</p>}
            <button className="btn btn-pri btn-wide" type="submit">Create workspace</button>
          </form>
        )}
        <button className="linkbtn" onClick={signOut}>Sign out</button>
      </div>
    </main>
  );
}
