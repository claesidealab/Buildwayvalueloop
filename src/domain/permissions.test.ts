import { describe, expect, it } from "vitest";
import { can, canAssignRole } from "./permissions";

describe("permissions", () => {
  it("lets viewers read but not change anything", () => {
    expect(can("viewer", "workspace.read")).toBe(true);
    expect(can("viewer", "design.edit")).toBe(false);
    expect(can("viewer", "baseline.approve")).toBe(false);
  });

  it("lets process owners edit designs but not approve baselines", () => {
    expect(can("process-owner", "design.edit")).toBe(true);
    expect(can("process-owner", "baseline.approve")).toBe(false);
    expect(can("process-owner", "members.manage")).toBe(false);
  });

  it("lets customer admins approve and manage members, but not reset", () => {
    expect(can("customer-admin", "baseline.approve")).toBe(true);
    expect(can("customer-admin", "members.manage")).toBe(true);
    expect(can("customer-admin", "workspace.reset")).toBe(false);
  });

  it("denies everything without a role", () => {
    expect(can(null, "workspace.read")).toBe(false);
  });

  it("reserves the advisor role for Buildway staff", () => {
    expect(canAssignRole({ role: "customer-admin", isBuildway: false }, "advisor")).toBe(false);
    expect(canAssignRole({ role: "customer-admin", isBuildway: false }, "viewer")).toBe(true);
    expect(canAssignRole({ role: "advisor", isBuildway: true }, "advisor")).toBe(true);
    expect(canAssignRole({ role: "process-owner", isBuildway: false }, "viewer")).toBe(false);
  });
});
