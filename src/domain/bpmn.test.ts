import { describe, expect, it } from "vitest";
import { BpmnError, exportBpmn, parseBpmn } from "./bpmn";
import { customerService } from "@/templates";
import { computeValueCase } from "./value-model";

describe("BPMN", () => {
  const t = customerService;
  const vc = computeValueCase(t.steps, t.defaultDesign, t.defaultAssumptions);
  const items = vc.steps.filter((s) => s.status !== "removed").map((s) => ({ step: s.step, lane: s.lane, level: s.level }));
  const edges = t.steps.slice(1).map((s, i) => ({ id: `e${i}`, from: t.steps[i].id, to: s.id }));

  it("exports lanes, tasks, flows and diagram positions", () => {
    const xml = exportBpmn("Customer service & more", items, edges, "to-be");
    expect(xml).toContain('<bpmn:lane id="lane_agent" name="AI agent">');
    expect(xml).toContain("Customer service &amp; more");
    expect((xml.match(/<bpmn:sequenceFlow /g) ?? []).length).toBe(edges.length);
    expect((xml.match(/<bpmndi:BPMNShape /g) ?? []).length).toBe(items.length + 3 + 1);
    expect(xml).toMatch(/<bpmn:serviceTask id="s_triage" name="Triage"/);
  });

  it("round-trips: steps, order, times, shares and arrows come back", () => {
    const back = parseBpmn(exportBpmn("CS", items, edges, "to-be"));
    expect(back.steps.map((s) => s.name)).toEqual(items.map((i) => i.step.name));
    expect(back.steps[0].minutesPerCase).toBe(items[0].step.minutesPerCase);
    expect(back.edges).toHaveLength(edges.length);
    expect(back.edges[0]).toEqual([0, 1]);
  });

  it("follows flows through gateways and events, and orders by position", () => {
    const xml = `<?xml version="1.0"?><definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC">
      <process id="p">
        <startEvent id="start"/>
        <task id="b" name="Approve &amp; book"><documentation>Manager approves</documentation></task>
        <userTask id="a" name="Register"/>
        <exclusiveGateway id="g"/>
        <manualTask id="c" name="Archive"/>
        <sequenceFlow id="1" sourceRef="start" targetRef="a"/>
        <sequenceFlow id="2" sourceRef="a" targetRef="g"/>
        <sequenceFlow id="3" sourceRef="g" targetRef="b"/>
        <sequenceFlow id="4" sourceRef="g" targetRef="c"/>
        <sequenceFlow id="5" sourceRef="b" targetRef="c"/>
      </process>
      <bpmndi:BPMNDiagram><bpmndi:BPMNPlane>
        <bpmndi:BPMNShape bpmnElement="a"><dc:Bounds x="100" y="0" width="1" height="1"/></bpmndi:BPMNShape>
        <bpmndi:BPMNShape bpmnElement="b"><dc:Bounds x="300" y="0" width="1" height="1"/></bpmndi:BPMNShape>
        <bpmndi:BPMNShape bpmnElement="c"><dc:Bounds x="500" y="0" width="1" height="1"/></bpmndi:BPMNShape>
      </bpmndi:BPMNPlane></bpmndi:BPMNDiagram></definitions>`;
    const r = parseBpmn(xml);
    expect(r.steps.map((s) => s.name)).toEqual(["Register", "Approve & book", "Archive"]);
    expect(r.steps[1].description).toBe("Manager approves");
    expect(r.edges).toEqual(expect.arrayContaining([[0, 1], [0, 2], [1, 2]]));
    expect(r.edges).toHaveLength(3);
  });

  it("rejects files that aren't BPMN or have no tasks", () => {
    expect(() => parseBpmn("<xml/>")).toThrow(BpmnError);
    expect(() => parseBpmn('<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"><process id="p"/></definitions>')).toThrow(/No tasks/);
  });
});
