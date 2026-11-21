"use client";

import { flowMatrix, type FlowDecision, type StrategyFlow } from "@/domain/strategy";

const COLOR: Record<FlowDecision, string> = { redesign: "var(--rust)", build: "var(--coral)", improve: "var(--sage)", leave: "var(--line)" };
const LABEL: Record<FlowDecision, string> = { redesign: "Redesign", build: "Build new", improve: "Improve in place", leave: "Leave for now" };

/** Value against ease: one bubble per flow, coloured by decision. Flows on the same spot are fanned out. */
export function FlowMatrix({ flows }: { flows: StrategyFlow[] }) {
  const W = 760, H = 440, L = 56, R = 16, T = 40, B = 44;
  const x = (ease: number) => L + ((W - L - R) * ease) / 100;
  const y = (value: number) => T + (H - T - B) * (1 - value / 100);
  const spots = new Map<string, number>();
  const placed = flows.map((f) => {
    const m = flowMatrix(f.scores);
    const key = `${m.ease}|${Math.round(m.value / 6)}`;
    const k = spots.get(key) ?? 0; spots.set(key, k + 1);
    const angle = k * 2.1, r = k === 0 ? 0 : 16 + 6 * k;
    return { f, cx: x(m.ease) + Math.cos(angle) * r, cy: y(m.value) + Math.sin(angle) * r, m };
  });
  return (
    <figure className="matrix">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Flows by value and ease">
        <rect x={x(50)} y={y(100)} width={x(100) - x(50)} height={y(50) - y(100)} fill="var(--surface2)" />
        <line x1={x(50)} x2={x(50)} y1={y(0)} y2={y(100)} stroke="var(--line)" strokeDasharray="4 4" />
        <line x1={x(0)} x2={x(100)} y1={y(50)} y2={y(50)} stroke="var(--line)" strokeDasharray="4 4" />
        <text x={x(100)} y={T - 22} textAnchor="end" className="mx-q">Start here</text>
        <text x={x(0)} y={T - 22} className="mx-q">Big bets: prove first</text>
        <text x={x(98)} y={y(4)} textAnchor="end" className="mx-q">Quick improvements</text>
        <text x={x(2)} y={y(4)} className="mx-q">Leave for now</text>
        <text x={(L + W - R) / 2} y={H - 8} textAnchor="middle" className="mx-axis">Ease: how proven AI is for this work →</text>
        <text x={16} y={(T + H - B) / 2} textAnchor="middle" className="mx-axis" transform={`rotate(-90 16 ${(T + H - B) / 2})`}>Value: prize, waiting, volume →</text>
        {placed.map(({ f, cx, cy, m }) => (
          <g key={f.id}>
            <title>{`${f.name}: value ${m.value}, ease ${m.ease}, ${LABEL[f.decision]}`}</title>
            <circle cx={cx} cy={cy} r={11} fill={COLOR[f.decision]} stroke="var(--surface)" strokeWidth="2" />
            <text x={cx > x(70) ? cx - 15 : cx + 15} y={cy + 4} textAnchor={cx > x(70) ? "end" : "start"} className="mx-label">{f.name}</text>
          </g>
        ))}
      </svg>
      <figcaption className="legend" style={{ fontSize: 13 }}>
        {(Object.keys(LABEL) as FlowDecision[]).map((d) => <span key={d}><i className="dot" style={{ background: COLOR[d] }} />{LABEL[d]}</span>)}
      </figcaption>
    </figure>
  );
}
