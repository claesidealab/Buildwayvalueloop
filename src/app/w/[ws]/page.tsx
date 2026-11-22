"use client";

import Link from "next/link";
import { useWorkspace } from "@/lib/store";
import { computeValueCase, formatMSEK } from "@/domain/value-model";
import { summariseActuals } from "@/domain/actuals";
import { measureBasis } from "@/domain/progress";
import { useStrategy } from "@/lib/strategy-store";
import { RouteTrack, TrafficLight } from "@/components/ui";

/** Example share of plan realised, shown only while no actuals have been uploaded. */
const EXAMPLE_REALISED = 0.76;
const EXAMPLE_MONTH = 9;

export default function Overview() {
  const { state, path } = useWorkspace();
  const { plan: strategy } = useStrategy();
  if (!state) return null;
  const first = state.processes.find((p) => p.hasDraft && p.steps.length)?.id;
  const valueOf = (p: (typeof state.processes)[number]) => computeValueCase(p.steps, p.design, p.assumptions);
  const live = state.processes.filter((p) => p.stage === "run" && p.steps.length);
  const plan = live.reduce((t, p) => t + (p.baseline?.net ?? valueOf(p).net), 0);
  const measured = live.filter((p) => p.actuals.some((a) => a.metric === "hours_released"));
  const realised = measured.reduce((t, p) => t + summariseActuals(p.actuals, measureBasis(p, strategy)).realisedToDate, 0);
  const agents = live.reduce((t, p) => t + valueOf(p).steps.filter((s) => s.lane === "agent").length, 0);

  return (
    <>
      <section className="hero">
        <div className="ph" style={{ alignItems: "flex-start" }}>
          <div>
            <p className="eyebrow">{state.workspace.name} · AI-native journey</p>
            <h1 style={{ marginTop: 8 }}>Become AI-native, one process at a time.</h1>
          </div>
          {state.workspace.isExample && <span className="example">Example data</span>}
        </div>
        <p className="sub">Choose where AI pays, redesign the process, prove the value and run it. Each process is a route through the loop; the light shows whether it may pass the next gate.</p>
        <nav className="loopchips" aria-label="The loop">
          <Link className="loopchip" href={path("/strategy")}><b>01</b>Strategy</Link><span className="looparrow" aria-hidden="true">→</span>
          <Link className="loopchip" href={path(first ? `/processes/${first}/map` : "/templates")}><b>02</b>Redesign</Link><span className="looparrow" aria-hidden="true">→</span>
          <Link className="loopchip" href={path(first ? `/processes/${first}/value` : "/templates")}><b>03</b>Value case</Link><span className="looparrow" aria-hidden="true">→</span>
          <Link className="loopchip on" href={path(first ? `/processes/${first}/monitor` : "/agents")}><b>04</b>Monitor &amp; learn</Link>
        </nav>
      </section>
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
            const ready = p.hasDraft;
            const body = (
              <>
                <div><h3>{p.name}</h3><p className="meta">{p.steps.length ? `${p.templateId ? `Template v${p.templateVersion}` : "Own process"} · ${p.steps.filter((s) => s.phase !== "as-is").length} steps after redesign` : p.hasDraft ? "Ready to map" : "Not mapped yet"}</p></div>
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
