"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { call, useWorkspace } from "@/lib/store";
import { describeActivity } from "@/lib/activity";
import { formatMSEK } from "@/domain/value-model";
import { PageHead } from "@/components/ui";

interface History {
  baselines: Array<{ id: string; process: string; processName: string; approvedAt: string; approvedBy: string; net: number; low: number; high: number; designVersion: number }>;
  activity: Array<{ id: number; at: string; actor: string | null; action: string; subject: Record<string, unknown> }>;
}

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default function HistoryPage() {
  const { slug, state, path } = useWorkspace();
  const [data, setData] = useState<History | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { call<History>("GET", `/api/workspaces/${slug}/history`).then(setData).catch((e) => setError(e.message)); }, [slug]);

  const names = {
    process: (p: string) => state?.processes.find((x) => x.id === p)?.name ?? p,
    step: (p: string, k: string) => state?.processes.find((x) => x.id === p)?.steps.find((s) => s.id === k)?.name ?? k,
  };

  return (
    <>
      <PageHead eyebrow={state?.workspace.name ?? ""} title="History" sub="Every approved baseline, and who changed what. Baselines can't be edited once approved." />
      {error && <p className="banner" role="alert">{error}</p>}
      <section className="panel">
        <div className="panel-h"><h2>Approved baselines</h2></div>
        {data && !data.baselines.length && <p className="muted">No baselines yet. Approve one from a process's value case.</p>}
        {!!data?.baselines.length && (
          <div className="scroller">
            <table className="tbl">
              <thead><tr><th>Process</th><th>Approved</th><th>By</th><th>Net value / yr</th><th>Range</th><th>Design</th></tr></thead>
              <tbody>
                {data.baselines.map((b, i) => (
                  <tr key={b.id}>
                    <td><Link href={path(`/processes/${b.process}/value`)}><b>{b.processName}</b></Link>{i === data.baselines.findIndex((x) => x.process === b.process) && <span className="pill" style={{ marginLeft: 8 }}>Current</span>}</td>
                    <td className="num">{when(b.approvedAt)}</td>
                    <td>{b.approvedBy}</td>
                    <td className="num"><b>{formatMSEK(b.net)} MSEK</b></td>
                    <td className="num muted">{formatMSEK(b.low)} to {formatMSEK(b.high)}</td>
                    <td className="num muted">v{b.designVersion}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="panel">
        <div className="panel-h"><h2>Activity</h2><span className="muted" style={{ fontSize: 13 }}>Latest 200</span></div>
        {data && !data.activity.length && <p className="muted">Nothing has changed yet.</p>}
        <ol className="activity">
          {data?.activity.map((a) => (
            <li key={a.id}>
              <span className="muted num">{when(a.at)}</span>
              <span><b>{a.actor ?? "Someone"}</b> {describeActivity(a.action, a.subject, names)}</span>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
