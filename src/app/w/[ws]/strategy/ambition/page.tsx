"use client";

import { useMemo, useState } from "react";
import { useStrategy } from "@/lib/strategy-store";
import { computeScenario, type StrategyDecision } from "@/domain/strategy";
import { PageHead } from "@/components/ui";
import { NumField, StrategyTabs, TextField } from "@/components/strategy-ui";

const KINDS: Array<{ k: StrategyDecision["kind"]; label: string }> = [
  { k: "ambition", label: "Ambition" },
  { k: "scenario", label: "Scenario" },
  { k: "gate", label: "Gate" },
  { k: "other", label: "Other" },
];
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/**
 * Facilitated in the room: the leadership team sets AI-native targets year by year,
 * with the chosen scenario's figures beside them, and records what they decided.
 */
export default function AmbitionPage() {
  const { plan, editable, update, recordDecision } = useStrategy();
  const [present, setPresent] = useState(false);
  const [kind, setKind] = useState<StrategyDecision["kind"]>("ambition");
  const [attendees, setAttendees] = useState("");
  const [decision, setDecision] = useState("");
  const [recorded, setRecorded] = useState(false);
  const chosen = plan?.scenarios.find((s) => s.id === plan.chosenScenarioId);
  const scenarioResult = useMemo(() => (plan && chosen ? computeScenario(plan, chosen) : null), [plan, chosen]);
  if (!plan) return <><PageHead eyebrow="Strategy" title="Ambition and decisions" /><StrategyTabs /></>;

  const years = Array.from({ length: plan.years }, (_, i) => plan.startYear + i);
  const setTarget = (mid: string, yi: number, v: number | null) =>
    update((p) => ({ ...p, ambition: p.ambition.map((m) => (m.id === mid ? { ...m, targets: years.map((_, k) => (k === yi ? v : m.targets[k] ?? null)) } : m)) }));
  // Reference figures from the chosen scenario, where the measure has one.
  const reference = (mid: string, yi: number): string | null => {
    if (!scenarioResult || !chosen) return null;
    if (mid === "net-value") return (scenarioResult.years[yi]?.netRunRateEnd / 1e6).toFixed(1);
    if (mid === "flows-live") {
      const end = (yi + 1) * 12;
      return String(chosen.flows.filter((f) => {
        const [y, h] = f.goLive.split("-H").map(Number);
        return (y - plan.startYear) * 12 + (h === 2 ? 6 : 0) < end;
      }).length);
    }
    return null;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!decision.trim()) return;
    if (await recordDecision({ kind, attendees: attendees.trim(), text: decision.trim() })) { setDecision(""); setRecorded(true); }
  };

  return (
    <div className={present ? "present" : ""}>
      <PageHead eyebrow="Strategy" title="Ambition and decisions"
        sub="Set the AI-native ambition year by year together with the leadership team, with the chosen scenario's figures beside it. Record what you decide."
        right={<button className="btn" aria-pressed={present} onClick={() => setPresent((p) => !p)}>{present ? "Exit presentation" : "Present in the room"}</button>} />
      <StrategyTabs />

      <section className="panel">
        <div className="panel-h">
          <h2>AI-native ambition</h2>
          <span className="muted" style={{ fontSize: 13 }}>{chosen ? <>Grey figures: the chosen scenario, <b>{chosen.name}</b></> : "Choose a scenario to see its figures here"}</span>
        </div>
        <div className="scroller">
          <table className="tbl amb">
            <thead><tr><th>Measure</th><th>Unit</th>{years.map((y) => <th key={y} className="num">End of {y}</th>)}{editable && <th />}</tr></thead>
            <tbody>
              {plan.ambition.map((m) => (
                <tr key={m.id}>
                  <td><TextField id={`m-${m.id}`} label="Measure" value={m.name} disabled={!editable} onSave={(v) => v && update((p) => ({ ...p, ambition: p.ambition.map((x) => (x.id === m.id ? { ...x, name: v } : x)) }))} /></td>
                  <td><TextField id={`u-${m.id}`} label="Unit" value={m.unit} disabled={!editable} onSave={(v) => update((p) => ({ ...p, ambition: p.ambition.map((x) => (x.id === m.id ? { ...x, unit: v } : x)) }))} /></td>
                  {years.map((y, yi) => {
                    const ref = reference(m.id, yi);
                    return (
                      <td key={y} className="amb-cell">
                        <NumField id={`t-${m.id}-${yi}`} label={`${m.name}, end of ${y}`} value={m.targets[yi] ?? null} disabled={!editable} width={present ? 110 : 80} onSave={(v) => setTarget(m.id, yi, v)} />
                        {ref !== null && <span className="muted amb-ref">Scenario {ref}</span>}
                      </td>
                    );
                  })}
                  {editable && <td><button className="btn btn-sm" aria-label={`Remove ${m.name}`} onClick={() => update((p) => ({ ...p, ambition: p.ambition.filter((x) => x.id !== m.id) }))}>Remove</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {editable && <button className="btn btn-sm" style={{ marginTop: 12 }} onClick={() => update((p) => ({ ...p, ambition: [...p.ambition, { id: `m-${Date.now().toString(36)}`, name: "New measure", unit: "", targets: years.map(() => null) }] }))}>+ Add a measure</button>}
      </section>

      <div className="mgrid">
        {editable && (
          <section className="panel">
            <div className="panel-h"><h2>Record a decision</h2></div>
            <form className="decide" onSubmit={submit}>
              <label className="field" htmlFor="dec-kind"><span>About</span>
                <select id="dec-kind" value={kind} onChange={(e) => setKind(e.target.value as StrategyDecision["kind"])}>{KINDS.map((k) => <option key={k.k} value={k.k}>{k.label}</option>)}</select>
              </label>
              <label className="field" htmlFor="dec-att"><span>In the room</span>
                <input id="dec-att" type="text" value={attendees} onChange={(e) => setAttendees(e.target.value)} placeholder="CEO, CFO, COO, Head of Support" />
              </label>
              <label className="field" htmlFor="dec-text"><span>Decision</span>
                <textarea id="dec-text" rows={3} value={decision} onChange={(e) => { setDecision(e.target.value); setRecorded(false); }} placeholder="We agree the ambition for 2027 and plan on the base scenario. Next review at gate 2." required />
              </label>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <button className="btn btn-pri" type="submit" disabled={!decision.trim()}>Record decision</button>
                {recorded && <span className="ok" role="status">Recorded</span>}
              </div>
            </form>
          </section>
        )}
        <section className="panel">
          <div className="panel-h"><h2>Decisions</h2><span className="muted" style={{ fontSize: 13 }}>Newest first, can't be edited</span></div>
          {plan.decisions.length === 0 && <p className="muted">No decisions recorded yet.</p>}
          <ol className="activity">
            {[...plan.decisions].reverse().map((d) => (
              <li key={d.id}>
                <span className="muted num">{when(d.at)}</span>
                <span><span className="pill" style={{ marginRight: 8 }}>{KINDS.find((k) => k.k === d.kind)?.label}</span>{d.text}
                  <span className="muted" style={{ display: "block", fontSize: 13 }}>Recorded by {d.recordedBy}{d.attendees ? ` · ${d.attendees}` : ""}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
