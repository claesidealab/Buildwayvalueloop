"use client";

import Link from "next/link";
import { useWorkspace } from "@/lib/store";
import { computeValueCase, formatMSEK } from "@/domain/value-model";
import { summariseActuals } from "@/domain/actuals";
import { PageHead, RouteTrack, TrafficLight } from "@/components/ui";

/** Example share of plan realised, shown only while no actuals have been uploaded. */
const EXAMPLE_REALISED = 0.76;
const EXAMPLE_MONTH = 9;

export default function Overview() {
  const { state, path } = useWorkspace();
  if (!state) return null;
  const valueOf = (p: (typeof state.processes)[number]) => computeValueCase(p.steps, p.design, p.assumptions);
  const live = state.processes.filter((p) => p.stage === "run" && p.steps.length);
  const plan = live.reduce((t, p) => t + (p.baseline?.net ?? valueOf(p).net), 0);
  const measured = live.filter((p) => p.actuals.some((a) => a.metric === "hours_released"));
  const realised = measured.reduce((t, p) => {
    const planCase = computeValueCase(p.baseline?.steps ?? p.steps, p.baseline?.design ?? p.design, p.baseline?.assumptions ?? p.assumptions);
    return t + summariseActuals(p.actuals, { net: p.baseline?.net ?? planCase.net, aiCost: planCase.aiCost, assumptions: p.baseline?.assumptions ?? p.assumptions }).realisedToDate;
  }, 0);
  const agents = live.reduce((t, p) => t + valueOf(p).steps.filter((s) => s.lane === "agent").length, 0);

  return (
    <>
      <PageHead
        eyebrow={`${state.workspace.name} · AI-native journey`}
        title="One process at a time"
        sub="Each process is a route: find the redesign, build it, run it. The light shows whether it may pass the next gate."
        right={state.workspace.isExample ? <span className="example">Example data</span> : undefined}
      />
      <div className="tiles">
        <div className="tile"><span className="label">Planned value</span><span className="v num">{formatMSEK(plan)} MSEK</span><small>Per year, running processes</small></div>
        <div className="tile"><span className="label">Realised to date</span><span className="v num">{formatMSEK(measured.length ? realised : (plan * EXAMPLE_MONTH) / 12 * EXAMPLE_REALISED)} MSEK</span><small>{measured.length ? "From uploaded figures" : "Example until figures are uploaded"}</small></div>
        <div className="tile"><span className="label">Agents live</span><span className="v num">{agents}</span><small>Across {live.length} process</small></div>
        <div className="tile"><span className="label">Processes</span><span className="v num">{live.length} / {state.processes.length}</span><small>Running AI-native</small></div>
      </div>
      <section className="panel">
        <div className="panel-h">
          <h2>Routes</h2>
          <div className="legend"><span><i className="dot d-find" />Find</span><span><i className="dot d-build" />Build</span><span><i className="dot d-run" />Run</span></div>
        </div>
        <div className="routes">
          {state.processes.map((p) => {
            const ready = p.steps.length > 0;
            const body = (
              <>
                <div><h3>{p.name}</h3><p className="meta">{p.templateId ? `Template v${p.templateVersion} · ${p.steps.filter((s) => s.phase !== "as-is").length} steps after redesign` : "Not mapped yet"}</p></div>
                <RouteTrack stage={p.stage} />
                <TrafficLight gate={p.gate} />
                <div className="rv"><b className="num">{ready ? `${formatMSEK(p.baseline?.net ?? valueOf(p).net)} MSEK ${p.baseline ? "approved" : "planned"} / yr` : p.stage === "not-started" ? "In the backlog" : "In progress"}</b><p className="meta">{p.note}</p></div>
              </>
            );
            return ready ? (
              <Link key={p.id} className="route live" href={path(`/processes/${p.id}/map`)}>{body}</Link>
            ) : (
              <div key={p.id} className="route">{body}</div>
            );
          })}
        </div>
      </section>
    </>
  );
}
