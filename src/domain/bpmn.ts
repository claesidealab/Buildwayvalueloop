/**
 * BPMN 2.0 exchange, so maps move in and out of Signavio, Camunda, Bizagi, ARIS or Visio.
 *
 * Export: one process with a lane per actor (to-be: human, AI agent, system; as-is: people),
 * a task per step (userTask for people, serviceTask for agents and systems), the map's arrows
 * as sequence flows, and diagram positions so tools draw it as on the canvas. Each task
 * carries the step's minutes, case share and autonomy as documentation and extension attributes.
 *
 * Import: every task-like element (task, userTask, serviceTask, manualTask, scriptTask,
 * businessRuleTask, sendTask, receiveTask, subProcess, callActivity) becomes a step, ordered by
 * diagram position when there is one. Sequence flows become arrows; flows through gateways and
 * events are followed so the steps on either side are joined.
 */
import type { Lane, ProcessEdge, StepDefinition } from "./types";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const unesc = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, "&");
const xmlId = (s: string) => `s_${s.replace(/[^A-Za-z0-9_-]/g, "_")}`;

export interface BpmnStepInfo { step: StepDefinition; lane: Lane; level: number }

const LANE_LABEL: Record<Lane, string> = { human: "Human", agent: "AI agent", system: "System" };

export function exportBpmn(processName: string, items: BpmnStepInfo[], edges: ProcessEdge[], view: "as-is" | "to-be"): string {
  const lanes: Lane[] = view === "to-be" ? ["human", "agent", "system"] : ["human"];
  const laneH = 140, taskW = 150, taskH = 80, left = 60;
  const laneOf = (i: BpmnStepInfo): Lane => (view === "to-be" ? i.lane : "human");
  const minX = Math.min(0, ...items.map((i) => i.step.x ?? 0));
  const maxX = Math.max(0, ...items.map((i) => i.step.x ?? 0)) - minX;
  const ids = new Set(items.map((i) => i.step.id));
  const flows = edges.filter((e) => ids.has(e.from) && ids.has(e.to));

  const tasks = items.map((i) => {
    const tag = laneOf(i) === "human" ? "userTask" : "serviceTask";
    const doc = `${i.step.description ? `${i.step.description} ` : ""}${i.step.minutesPerCase} min per case, ${i.step.caseShare ?? 100}% of cases${view === "to-be" ? `, autonomy L${i.level}` : ""}.`;
    return `    <bpmn:${tag} id="${xmlId(i.step.id)}" name="${esc(i.step.name)}" vl:minutes="${i.step.minutesPerCase}" vl:caseShare="${i.step.caseShare ?? 100}"${view === "to-be" ? ` vl:autonomy="${i.level}"` : ""}>\n      <bpmn:documentation>${esc(doc)}</bpmn:documentation>\n    </bpmn:${tag}>`;
  }).join("\n");
  const seq = flows.map((e, k) => `    <bpmn:sequenceFlow id="f_${k}" sourceRef="${xmlId(e.from)}" targetRef="${xmlId(e.to)}"${e.label ? ` name="${esc(e.label)}"` : ""} />`).join("\n");
  const laneSet = lanes.map((l) => `      <bpmn:lane id="lane_${l}" name="${LANE_LABEL[l]}">\n${items.filter((i) => laneOf(i) === l).map((i) => `        <bpmn:flowNodeRef>${xmlId(i.step.id)}</bpmn:flowNodeRef>`).join("\n")}\n      </bpmn:lane>`).join("\n");

  const pos = (i: BpmnStepInfo) => ({ x: left + 120 + ((i.step.x ?? 0) - minX), y: lanes.indexOf(laneOf(i)) * laneH + (laneH - taskH) / 2 });
  const width = maxX + taskW + 240;
  const laneShapes = lanes.map((l, k) => `      <bpmndi:BPMNShape id="lane_${l}_di" bpmnElement="lane_${l}" isHorizontal="true"><dc:Bounds x="${left + 30}" y="${k * laneH}" width="${width}" height="${laneH}" /></bpmndi:BPMNShape>`).join("\n");
  const shapes = items.map((i) => { const p = pos(i); return `      <bpmndi:BPMNShape id="${xmlId(i.step.id)}_di" bpmnElement="${xmlId(i.step.id)}"><dc:Bounds x="${p.x}" y="${p.y}" width="${taskW}" height="${taskH}" /></bpmndi:BPMNShape>`; }).join("\n");
  const byId = new Map(items.map((i) => [i.step.id, i]));
  const edgesDi = flows.map((e, k) => {
    const a = pos(byId.get(e.from)!), b = pos(byId.get(e.to)!);
    return `      <bpmndi:BPMNEdge id="f_${k}_di" bpmnElement="f_${k}"><di:waypoint x="${a.x + taskW}" y="${a.y + taskH / 2}" /><di:waypoint x="${b.x}" y="${b.y + taskH / 2}" /></bpmndi:BPMNEdge>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:vl="https://buildway.se/value-loop" id="defs" targetNamespace="https://buildway.se/value-loop" exporter="Value Loop">
  <bpmn:collaboration id="collab">
    <bpmn:participant id="participant" name="${esc(processName)} (${view === "to-be" ? "redesign" : "today"})" processRef="process" />
  </bpmn:collaboration>
  <bpmn:process id="process" name="${esc(processName)}" isExecutable="false">
    <bpmn:laneSet id="lanes">
${laneSet}
    </bpmn:laneSet>
${tasks}
${seq}
  </bpmn:process>
  <bpmndi:BPMNDiagram id="diagram">
    <bpmndi:BPMNPlane id="plane" bpmnElement="collab">
      <bpmndi:BPMNShape id="participant_di" bpmnElement="participant" isHorizontal="true"><dc:Bounds x="${left}" y="0" width="${width + 30}" height="${lanes.length * laneH}" /></bpmndi:BPMNShape>
${laneShapes}
${shapes}
${edgesDi}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
`;
}

/* ---------- import ---------- */

export interface ImportedStep { name: string; description: string; minutesPerCase: number; caseShare: number }
export interface BpmnImport { steps: ImportedStep[]; edges: Array<[number, number]>; skipped: number }

export class BpmnError extends Error {}

const TASKS = ["task", "userTask", "serviceTask", "manualTask", "scriptTask", "businessRuleTask", "sendTask", "receiveTask", "subProcess", "callActivity"];
const attr = (s: string, name: string) => {
  const m = new RegExp(`(?:^|\\s)(?:[\\w-]+:)?${name}\\s*=\\s*"([^"]*)"`).exec(s) ?? new RegExp(`(?:^|\\s)(?:[\\w-]+:)?${name}\\s*=\\s*'([^']*)'`).exec(s);
  return m ? unesc(m[1]) : undefined;
};

export function parseBpmn(xml: string, maxSteps = 40): BpmnImport {
  if (!/definitions/.test(xml) || !/http:\/\/www\.omg\.org\/spec\/BPMN\/20100524\/MODEL/.test(xml)) throw new BpmnError("This doesn't look like a BPMN 2.0 file.");
  const body = xml.replace(/<!--[\s\S]*?-->/g, "");
  // Task elements: opening tag attributes, plus documentation inside non-self-closing ones.
  const tasks: Array<{ id: string; name: string; doc: string; minutes?: number; share?: number; index: number }> = [];
  const re = new RegExp(`<(?:[\\w-]+:)?(${TASKS.join("|")})\\b([^>]*?)(/?)>`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const id = attr(m[2], "id");
    if (!id) continue;
    let doc = "";
    if (m[3] !== "/") {
      const close = body.indexOf(`${m[1]}>`, re.lastIndex);
      const inner = close > 0 ? body.slice(re.lastIndex, close) : "";
      const d = /<(?:[\w-]+:)?documentation[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?documentation>/.exec(inner);
      if (d) doc = unesc(d[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")).trim();
    }
    const minutes = Number(attr(m[2], "minutes"));
    const share = Number(attr(m[2], "caseShare"));
    tasks.push({ id, name: (attr(m[2], "name") ?? "").replace(/\s+/g, " ").trim() || "Step", doc, minutes: Number.isFinite(minutes) ? minutes : undefined, share: Number.isFinite(share) ? share : undefined, index: tasks.length });
  }
  if (!tasks.length) throw new BpmnError("No tasks found in the file.");

  const flows: Array<[string, string]> = [];
  const fre = /<(?:[\w-]+:)?sequenceFlow\b([^>]*?)\/?>/g;
  while ((m = fre.exec(body))) { const a = attr(m[1], "sourceRef"), b = attr(m[1], "targetRef"); if (a && b) flows.push([a, b]); }

  const xOf = new Map<string, number>();
  const sre = /<(?:[\w-]+:)?BPMNShape\b([^>]*)>[\s\S]*?<(?:[\w-]+:)?Bounds\b([^>]*)\/?>/g;
  while ((m = sre.exec(body))) { const el = attr(m[1], "bpmnElement"); const x = Number(attr(m[2], "x")); if (el && Number.isFinite(x)) xOf.set(el, x); }

  const ordered = [...tasks].sort((a, b) => (xOf.get(a.id) ?? a.index * 1000) - (xOf.get(b.id) ?? b.index * 1000) || a.index - b.index);
  const kept = ordered.slice(0, maxSteps);
  const pos = new Map(kept.map((t, i) => [t.id, i]));

  // Follow flows through gateways and events to join tasks on either side.
  const out = new Map<string, string[]>();
  for (const [a, b] of flows) out.set(a, [...(out.get(a) ?? []), b]);
  const edges: Array<[number, number]> = [];
  for (const t of kept) {
    const seen = new Set<string>([t.id]);
    const stack = [...(out.get(t.id) ?? [])];
    while (stack.length) {
      const n = stack.pop()!;
      if (seen.has(n)) continue;
      seen.add(n);
      if (pos.has(n)) { const e: [number, number] = [pos.get(t.id)!, pos.get(n)!]; if (e[0] !== e[1] && !edges.some((x) => x[0] === e[0] && x[1] === e[1])) edges.push(e); continue; }
      if (tasks.some((x) => x.id === n)) continue; // a task beyond the limit
      stack.push(...(out.get(n) ?? []));
    }
  }

  return {
    steps: kept.map((t) => ({ name: t.name.slice(0, 60), description: t.doc.slice(0, 500), minutesPerCase: Math.min(1440, Math.max(0, t.minutes ?? 1)), caseShare: Math.min(100, Math.max(0, t.share ?? 100)) })),
    edges, skipped: tasks.length - kept.length,
  };
}
