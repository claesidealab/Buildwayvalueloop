import type { ReactNode } from "react";
import type { AutonomyLevel, Gate, Lane, Stage } from "@/domain/types";

export function PageHead({ eyebrow, title, sub, dot, right }: { eyebrow: string; title: string; sub?: string; dot?: "find" | "build" | "run"; right?: ReactNode }) {
  return (
    <div className="ph">
      <div>
        <p className="eyebrow">{dot && <span className={`dot d-${dot}`} />}{eyebrow}</p>
        <h1>{title}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function LevelBadge({ level, lane }: { level: AutonomyLevel; lane: Lane }) {
  return <span className={`lv s-${lane}`}>L{level}</span>;
}

const GATE_LABEL: Record<Gate, string> = { red: "Gate red", amber: "Gate amber", green: "Gate green" };

export function TrafficLight({ gate }: { gate: Gate }) {
  return (
    <span className="light" role="img" aria-label={GATE_LABEL[gate]}>
      <i className={gate === "red" ? "on-r" : ""} />
      <i className={gate === "amber" ? "on-y" : ""} />
      <i className={gate === "green" ? "on-g" : ""} />
    </span>
  );
}

const STAGE_INDEX: Record<Stage, number> = { "not-started": 0, find: 1, build: 2, run: 3 };

/** The Find → Build → Run route, drawn like Buildway's sträckor. */
export function RouteTrack({ stage }: { stage: Stage }) {
  const reached = STAGE_INDEX[stage];
  const xs = [30, 150, 270];
  const cols = ["var(--sage)", "var(--coral)", "var(--human)"];
  return (
    <svg className="track" viewBox="0 0 330 44" aria-hidden="true">
      <path d="M0 22 C 40 6, 70 38, 110 22 S 190 6, 230 22 S 290 38, 330 22" fill="none" stroke="var(--ink)" strokeOpacity=".55" strokeWidth="2.5" strokeDasharray="7 7" />
      {xs.map((x, i) => (
        <circle key={x} cx={x} cy={22} r={9} fill={i < reached ? cols[i] : "var(--surface)"} stroke={cols[i]} strokeWidth={2.5} />
      ))}
    </svg>
  );
}
