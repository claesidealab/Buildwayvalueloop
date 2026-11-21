"use client";

/**
 * Drag-and-drop process map with swimlanes.
 * - Drag a step sideways to reorder it, or up and down into another lane to change who does it.
 * - Drag from a step's right edge to another step to draw an arrow. Select an arrow and press Delete to remove it.
 * The as-is view has one lane: today people do every step.
 */
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background, Controls, Handle, MarkerType, Position, ReactFlow, ReactFlowProvider, useNodesState,
  type Connection, type Edge, type Node, type NodeChange, type NodeProps, type OnNodeDrag,
} from "@xyflow/react";
import { levelForLane } from "@/domain/autonomy";
import type { AutonomyLevel, Lane, StepDefinition } from "@/domain/types";
import type { ValueCase } from "@/domain/types";
import type { ProcessInstance, StepPatch } from "@/lib/api-types";

export const LANE_H = 140;
const NODE_W = 168;
const NODE_H = 76;
const LANE_LABEL_W = 150;
const LANE_LEFT = -LANE_LABEL_W - 40;
const GRID = 20;
/** Opening zoom: readable steps; pan sideways or use "fit" to see the whole process. */
const START_ZOOM = 0.85;

const TO_BE_LANES: Array<{ lane: Lane; label: string }> = [
  { lane: "human", label: "Human" },
  { lane: "agent", label: "AI agent" },
  { lane: "system", label: "System" },
];
const AS_IS_LANES: Array<{ lane: Lane; label: string }> = [{ lane: "human", label: "People, today" }];

type StepData = { step: StepDefinition; level: AutonomyLevel; lane: Lane; isNew: boolean; tobe: boolean; editable: boolean; comments: number };
type LaneData = { label: string; lane: Lane; width: number };

function StepNode({ data, selected }: NodeProps<Node<StepData>>) {
  const { step, level, lane, isNew, tobe, editable, comments } = data;
  const share = step.caseShare ?? 100;
  return (
    <div className={`pnode s-${tobe ? lane : "human"} ${selected ? "sel" : ""}`} style={{ width: NODE_W, minHeight: NODE_H }}>
      <Handle type="target" position={Position.Left} isConnectable={editable} />
      <div className="pnode-top">
        <b>{tobe ? `L${level}` : "Today"}</b>
        {isNew && <span className="pnode-new">New</span>}
        {comments > 0 && <span className="pnode-comments" title={`${comments} open comment${comments === 1 ? "" : "s"}`} aria-label={`${comments} open comments`}>{comments}</span>}
      </div>
      <span className="pnode-name">{step.name}</span>
      <span className="pnode-meta">{step.minutesPerCase.toFixed(1)} min{share < 100 ? ` · ${share}% of cases` : ""}</span>
      <Handle type="source" position={Position.Right} isConnectable={editable} />
    </div>
  );
}

function LaneNode({ data }: NodeProps<Node<LaneData>>) {
  return (
    <div className={`plane plane-${data.lane}`} style={{ width: data.width, height: LANE_H }}>
      <span className="plane-label"><i className={`dot ${data.lane === "human" ? "d-run" : data.lane === "agent" ? "d-build" : "d-find"}`} />{data.label}</span>
    </div>
  );
}

const nodeTypes = { step: StepNode, lane: LaneNode };

interface Props {
  process: ProcessInstance;
  value: ValueCase;
  view: "as-is" | "to-be";
  editable: boolean;
  selected: string | null;
  onSelect: (stepId: string | null) => void;
  onPatch: (stepId: string, patch: StepPatch) => void;
  onConnect: (from: string, to: string) => void;
  onRemoveEdge: (edgeId: string) => void;
}

function Canvas({ process, value, view, editable, selected, onSelect, onPatch, onConnect, onRemoveEdge }: Props) {
  const tobe = view === "to-be";
  const lanes = tobe ? TO_BE_LANES : AS_IS_LANES;
  const visible = process.steps.filter((s) => (tobe ? s.phase !== "as-is" : s.phase !== "to-be"));
  const levelOf = (id: string) => (process.design.levels[id] ?? 0) as AutonomyLevel;
  const laneOfStep = (id: string): Lane => value.steps.find((v) => v.step.id === id)?.lane ?? "human";
  const maxX = Math.max(0, ...visible.map((s) => s.x ?? 0)) + NODE_W + 200;

  const built = useMemo<Node[]>(() => {
    const laneNodes: Node<LaneData>[] = lanes.map((l, i) => ({
      id: `lane-${l.lane}`, type: "lane", position: { x: LANE_LEFT, y: i * LANE_H }, data: { label: l.label, lane: l.lane, width: maxX - LANE_LEFT },
      draggable: false, selectable: false, connectable: false, zIndex: -1, focusable: false,
    }));
    const stepNodes: Node<StepData>[] = visible.map((s) => {
      const lane = tobe ? laneOfStep(s.id) : "human";
      const li = Math.max(0, lanes.findIndex((l) => l.lane === lane));
      return {
        id: s.id, type: "step", position: { x: s.x ?? 0, y: li * LANE_H + (LANE_H - NODE_H) / 2 },
        data: { step: s, level: levelOf(s.id), lane, isNew: tobe && s.phase === "to-be", tobe, editable, comments: process.comments.filter((c) => c.step === s.id && !c.resolvedAt).length },
        selected: s.id === selected, draggable: editable, connectable: editable,
      };
    });
    return [...laneNodes, ...stepNodes];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [process, value, view, editable, selected]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(built);
  useEffect(() => setNodes(built), [built, setNodes]);

  const visibleIds = new Set(visible.map((s) => s.id));
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const edges: Edge[] = process.edges
    .filter((e) => visibleIds.has(e.from) && visibleIds.has(e.to))
    .map((e) => ({
      id: e.id, source: e.from, target: e.to, type: "smoothstep", selected: e.id === selectedEdge,
      markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 }, className: "pedge", deletable: editable,
    }));

  const onDragStop: OnNodeDrag = useCallback((_e, node) => {
    if (node.type !== "step") return;
    const step = process.steps.find((s) => s.id === node.id);
    if (!step) return;
    const x = Math.max(0, Math.round(node.position.x / GRID) * GRID);
    const patch: StepPatch = {};
    if (x !== (step.x ?? 0)) patch.x = x;
    if (tobe) {
      const li = Math.min(lanes.length - 1, Math.max(0, Math.floor((node.position.y + NODE_H / 2) / LANE_H)));
      const target = lanes[li].lane;
      const current = laneOfStep(step.id);
      if (target !== current) {
        const next = levelForLane(target, levelOf(step.id));
        patch.autonomy = next.level;
        patch.isSystem = next.isSystem;
      }
    }
    if (Object.keys(patch).length) onPatch(step.id, patch);
    else setNodes(built); // snap back into its lane
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [process, tobe, built, onPatch]);

  const handleConnect = useCallback((c: Connection) => {
    if (c.source && c.target && c.source !== c.target) onConnect(c.source, c.target);
  }, [onConnect]);

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    // Selection is controlled by the page; deletion goes through the inspector.
    onNodesChange(changes.filter((c) => c.type !== "remove" && c.type !== "select"));
  }, [onNodesChange]);

  return (
    <div className="pcanvas" style={{ height: Math.round(lanes.length * LANE_H * START_ZOOM) + 46 }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={handleNodesChange}
        onNodeDragStop={onDragStop}
        onNodeClick={(_e, n) => { if (n.type === "step") { onSelect(n.id); setSelectedEdge(null); } }}
        onEdgeClick={(_e, ed) => { setSelectedEdge(ed.id); onSelect(null); }}
        onPaneClick={() => { setSelectedEdge(null); }}
        onConnect={handleConnect}
        onEdgesDelete={(eds) => eds.forEach((ed) => onRemoveEdge(ed.id))}
        nodesDraggable={editable}
        nodesConnectable={editable}
        edgesFocusable={editable}
        deleteKeyCode={editable ? ["Backspace", "Delete"] : null}
        snapToGrid
        snapGrid={[GRID, GRID]}
        defaultViewport={{ x: Math.round(-LANE_LEFT * START_ZOOM) + 4, y: 4, zoom: START_ZOOM }}
        fitViewOptions={{ padding: 0.05 }}
        panOnScroll
        zoomOnScroll={false}
        minZoom={0.3}
        maxZoom={1.6}
        translateExtent={[[LANE_LEFT - 200, -200], [maxX + 800, lanes.length * LANE_H + 200]]}
        proOptions={{ hideAttribution: true }}
        aria-label={`Process map, ${view}`}
      >
        <Background gap={GRID} size={1} color="var(--line)" />
        <Controls showInteractive={false} />
      </ReactFlow>
      {editable && selectedEdge && (
        <div className="pedge-bar">
          <span>Arrow selected</span>
          <button className="btn btn-sm" onClick={() => { onRemoveEdge(selectedEdge); setSelectedEdge(null); }}>Remove arrow</button>
        </div>
      )}
    </div>
  );
}

export function ProcessCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}
