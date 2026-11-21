"use client";

import { useCallback, useEffect, useState } from "react";
import { call, useWorkspace } from "@/lib/store";
import type { MembersResponse } from "@/lib/api-types";
import { ROLES } from "@/domain/permissions";
import type { Role } from "@/domain/types";
import { PageHead } from "@/components/ui";

export default function MembersPage() {
  const { slug, state, can } = useWorkspace();
  const [data, setData] = useState<MembersResponse | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("process-owner");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const base = `/api/workspaces/${slug}`;
  const manage = can("members.manage");
  const assignable = ROLES.filter((r) => r.role !== "advisor" || state?.me.isBuildway);

  const run = useCallback(async (fn: () => Promise<MembersResponse>, ok?: string) => {
    try { setData(await fn()); if (ok) setMsg({ kind: "ok", text: ok }); }
    catch (e) { setMsg({ kind: "err", text: (e as Error).message }); }
  }, []);

  useEffect(() => { void run(() => call<MembersResponse>("GET", `${base}/members`)); }, [base, run]);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    const addr = email.trim();
    await run(() => call<MembersResponse>("POST", `${base}/members`, { email: addr, role }), `${addr} added. If they haven't signed in before, they join when they first sign in with that email.`);
    setEmail("");
  };

  const label = (r: Role) => ROLES.find((x) => x.role === r)?.label ?? r;
  const lockedAdvisor = (r: Role) => r === "advisor" && !state?.me.isBuildway;

  return (
    <>
      <PageHead eyebrow={state?.workspace.name ?? ""} title="Members" sub="Who can see and change this workspace. People sign in with their work account; invitations are matched on email." />
      {msg && <p className={msg.kind === "err" ? "banner" : "okmsg"} role={msg.kind === "err" ? "alert" : "status"}>{msg.text}</p>}
      {manage && (
        <section className="panel">
          <div className="panel-h"><h2>Invite someone</h2></div>
          <form className="invite" onSubmit={invite}>
            <label className="field"><span>Work email</span><input id="invite-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.se" /></label>
            <label className="field"><span>Role</span>
              <select id="invite-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                {assignable.map((r) => <option key={r.role} value={r.role}>{r.label}</option>)}
              </select>
            </label>
            <button className="btn btn-pri" type="submit">Invite</button>
          </form>
          <dl className="roles">{ROLES.map((r) => <div key={r.role}><dt>{r.label}</dt><dd>{r.description}</dd></div>)}</dl>
        </section>
      )}
      <section className="panel">
        <div className="panel-h"><h2>People</h2><span className="muted num">{data?.members.length ?? "…"}</span></div>
        <div className="scroller">
          <table className="tbl">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Last sign-in</th>{manage && <th />}</tr></thead>
            <tbody>
              {data?.members.map((m) => (
                <tr key={m.userId}>
                  <td><b>{m.name}</b>{m.email === state?.me.email && <span className="muted"> (you)</span>}</td>
                  <td className="muted">{m.email}</td>
                  <td>
                    {manage && !lockedAdvisor(m.role) ? (
                      <select aria-label={`Role for ${m.name}`} value={m.role} onChange={(e) => run(() => call<MembersResponse>("PATCH", `${base}/members/${m.userId}`, { role: e.target.value }), "Role changed")}>
                        {assignable.map((r) => <option key={r.role} value={r.role}>{r.label}</option>)}
                      </select>
                    ) : label(m.role)}
                  </td>
                  <td className="muted num">{m.lastSignInAt ? new Date(m.lastSignInAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Never"}</td>
                  {manage && <td>{!lockedAdvisor(m.role) && <button className="btn btn-sm" onClick={() => run(() => call<MembersResponse>("DELETE", `${base}/members/${m.userId}`), `${m.name} removed`)}>Remove</button>}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {!!data?.invitations.length && (
        <section className="panel">
          <div className="panel-h"><h2>Waiting for first sign-in</h2></div>
          <table className="tbl">
            <thead><tr><th>Email</th><th>Role</th><th>Invited</th>{manage && <th />}</tr></thead>
            <tbody>
              {data.invitations.map((i) => (
                <tr key={i.id}>
                  <td>{i.email}</td><td>{label(i.role)}</td>
                  <td className="muted num">{new Date(i.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</td>
                  {manage && <td><button className="btn btn-sm" onClick={() => run(() => call<MembersResponse>("DELETE", `${base}/invitations/${i.id}`), "Invitation withdrawn")}>Withdraw</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
