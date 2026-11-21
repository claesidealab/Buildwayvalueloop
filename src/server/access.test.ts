import { beforeEach, describe, expect, it } from "vitest";
import type { DB } from "./db";
import { createTestDb } from "./test-db";
import { users } from "./db/schema";
import { eq } from "drizzle-orm";
import {
  authorize, changeRole, createSession, createWorkspace, deleteSession, ForbiddenError, getAccess, inviteMember, listMembers,
  listMyWorkspaces, removeMember, revokeInvitation, signInDev, signInWithIdentity, validateSession, type SessionUser,
} from "./access";
import { ConflictError, EXAMPLE_WORKSPACE as WS, listActivity, NotFoundError, seedExample } from "./repo";

let db: DB;
const DAY = 86_400_000;
const userBy = async (email: string): Promise<SessionUser> => {
  const [u] = await db.select().from(users).where(eq(users.email, email));
  return { id: u.id, email: u.email, name: u.name, isBuildway: u.isBuildway };
};

beforeEach(async () => {
  db = await createTestDb();
  await seedExample(db);
});

describe("sessions", () => {
  it("validates a fresh session and rejects unknown tokens", async () => {
    const advisor = await userBy("advisor@buildway.example");
    const { token } = await createSession(db, advisor.id);
    expect((await validateSession(db, token))?.user.email).toBe("advisor@buildway.example");
    expect(await validateSession(db, "not-a-token")).toBeNull();
    expect(await validateSession(db, undefined)).toBeNull();
  });

  it("expires sessions after 30 days and extends them when past half their life", async () => {
    const u = await userBy("viewer@acme.example");
    const t0 = new Date("2026-01-01T00:00:00Z");
    const { token } = await createSession(db, u.id, t0);
    const later = await validateSession(db, token, new Date(t0.getTime() + 20 * DAY));
    expect(later?.renewed).toBe(true);
    expect(later!.expiresAt.getTime()).toBe(t0.getTime() + 50 * DAY);
    expect(await validateSession(db, token, new Date(t0.getTime() + 51 * DAY))).toBeNull();
  });

  it("signs out by deleting the session", async () => {
    const u = await userBy("viewer@acme.example");
    const { token } = await createSession(db, u.id);
    await deleteSession(db, token);
    expect(await validateSession(db, token)).toBeNull();
  });
});

describe("sign-in", () => {
  it("creates a user on first sign-in and reuses it next time", async () => {
    const p = { provider: "google", subject: "g-1", email: "New.Person@Customer.se", name: "New Person" };
    const a = await signInWithIdentity(db, p, { buildwayDomains: ["buildway.se"] });
    const b = await signInWithIdentity(db, p, { buildwayDomains: ["buildway.se"] });
    expect(a).toBe(b);
    const [u] = await db.select().from(users).where(eq(users.id, a));
    expect(u.email).toBe("new.person@customer.se");
    expect(u.isBuildway).toBe(false);
    expect(await listMyWorkspaces(db, a)).toEqual([]);
  });

  it("accepts pending invitations for the signed-in email", async () => {
    const admin = await getAccess(db, WS, await userBy("admin@acme.example"));
    await inviteMember(db, admin, "Lisa@Customer.se", "process-owner");
    const id = await signInWithIdentity(db, { provider: "microsoft-entra-id", subject: "m-1", email: "lisa@customer.se", name: "Lisa" }, { buildwayDomains: [] });
    expect(await listMyWorkspaces(db, id)).toEqual([{ slug: WS, name: "Acme Support", isExample: true, role: "process-owner" }]);
    expect((await listMembers(db, admin)).invitations).toHaveLength(0);
  });

  it("marks Buildway staff by email domain and adds them to the example workspace", async () => {
    const id = await signInWithIdentity(db, { provider: "google", subject: "g-2", email: "claes@buildway.se", name: "Claes" }, { buildwayDomains: ["buildway.se"] });
    const [u] = await db.select().from(users).where(eq(users.id, id));
    expect(u.isBuildway).toBe(true);
    expect((await listMyWorkspaces(db, id))[0]?.role).toBe("advisor");
  });

  it("only lets the developer sign-in use existing users", async () => {
    expect(await signInDev(db, "owner@acme.example")).toBeTruthy();
    await expect(signInDev(db, "stranger@acme.example")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("access", () => {
  it("hides workspaces from non-members", async () => {
    const id = await signInWithIdentity(db, { provider: "google", subject: "g-3", email: "out@side.se", name: "Out" }, { buildwayDomains: [] });
    await expect(getAccess(db, WS, { id, isBuildway: false })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("enforces role permissions", async () => {
    const viewer = await userBy("viewer@acme.example");
    const owner = await userBy("owner@acme.example");
    await expect(authorize(db, WS, viewer, "design.edit")).rejects.toBeInstanceOf(ForbiddenError);
    expect((await authorize(db, WS, owner, "design.edit")).role).toBe("process-owner");
    await expect(authorize(db, WS, owner, "baseline.approve")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("lets only Buildway staff create workspaces", async () => {
    await expect(createWorkspace(db, await userBy("admin@acme.example"), { name: "X", slug: "x" })).rejects.toBeInstanceOf(ForbiddenError);
    const advisor = await userBy("advisor@buildway.example");
    await createWorkspace(db, advisor, { name: "Nordic Bank", slug: "nordic-bank" });
    expect((await getAccess(db, "nordic-bank", advisor)).role).toBe("advisor");
    await expect(createWorkspace(db, advisor, { name: "Again", slug: "nordic-bank" })).rejects.toBeInstanceOf(ConflictError);
    await expect(createWorkspace(db, advisor, { name: "Bad", slug: "Bad Slug" })).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("members", () => {
  it("adds existing users directly and refuses duplicates", async () => {
    const advisor = await getAccess(db, WS, await userBy("advisor@buildway.example"));
    await createWorkspace(db, await userBy("advisor@buildway.example"), { name: "Other", slug: "other" });
    const other = await getAccess(db, "other", await userBy("advisor@buildway.example"));
    await inviteMember(db, other, "viewer@acme.example", "viewer");
    expect((await listMembers(db, other)).members.map((m) => m.email)).toContain("viewer@acme.example");
    await expect(inviteMember(db, advisor, "viewer@acme.example", "viewer")).rejects.toBeInstanceOf(ConflictError);
  });

  it("reserves the advisor role for Buildway staff", async () => {
    const admin = await getAccess(db, WS, await userBy("admin@acme.example"));
    await expect(inviteMember(db, admin, "x@customer.se", "advisor")).rejects.toBeInstanceOf(ForbiddenError);
    const advisorId = (await userBy("advisor@buildway.example")).id;
    await expect(removeMember(db, admin, advisorId)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("keeps at least one admin or advisor", async () => {
    const advisorUser = await userBy("advisor@buildway.example");
    const advisor = await getAccess(db, WS, advisorUser);
    const adminId = (await userBy("admin@acme.example")).id;
    await removeMember(db, advisor, adminId);
    await expect(removeMember(db, advisor, advisorUser.id)).rejects.toBeInstanceOf(ConflictError);
    await expect(changeRole(db, advisor, advisorUser.id, "viewer")).rejects.toBeInstanceOf(ConflictError);
  });

  it("changes roles and revokes invitations", async () => {
    const admin = await getAccess(db, WS, await userBy("admin@acme.example"));
    const ownerId = (await userBy("owner@acme.example")).id;
    await changeRole(db, admin, ownerId, "viewer");
    expect((await listMembers(db, admin)).members.find((m) => m.userId === ownerId)?.role).toBe("viewer");
    await inviteMember(db, admin, "temp@customer.se", "viewer");
    const inv = (await listMembers(db, admin)).invitations[0];
    await revokeInvitation(db, admin, inv.id);
    expect((await listMembers(db, admin)).invitations).toHaveLength(0);
    const actions = (await listActivity(db, WS)).map((a) => a.action);
    expect(actions).toEqual(["invitation.revoked", "member.invited", "member.role_changed"]);
  });
});
