/**
 * Accounts and access: users, sign-in identities, sessions, memberships, invitations.
 * Workspace content (processes, designs, baselines) lives in repo.ts.
 */
import { createHash, randomBytes } from "node:crypto";
import { and, count, eq, inArray } from "drizzle-orm";
import type { DB } from "./db";
import { auditLog, identities, invitations, memberships, sessions, users, workspaces } from "./db/schema";
import { ConflictError, EXAMPLE_WORKSPACE, NotFoundError } from "./repo";
import { can, canAssignRole, type Permission } from "@/domain/permissions";
import type { Role } from "@/domain/types";

export class UnauthorizedError extends Error {}
export class ForbiddenError extends Error {}

type DbRole = "advisor" | "customer_admin" | "process_owner" | "viewer";
export const toRole = (r: DbRole): Role => r.replace("_", "-") as Role;
export const toDbRole = (r: Role): DbRole => r.replace("-", "_") as DbRole;

const DAY = 24 * 60 * 60 * 1000;
export const SESSION_DAYS = 30;
const RENEW_WHEN_DAYS_LEFT = 15;

export const normaliseEmail = (e: string) => e.trim().toLowerCase();
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

async function audit(db: DB, workspaceId: string, actorId: string | null, action: string, subject: unknown) {
  await db.insert(auditLog).values({ workspaceId, actorId, action, subject });
}

/* ---------- sessions ---------- */

export async function createSession(db: DB, userId: string, now = new Date()) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * DAY);
  await db.insert(sessions).values({ id: hashToken(token), userId, expiresAt });
  return { token, expiresAt };
}

export interface SessionUser { id: string; email: string; name: string; isBuildway: boolean }

/** Returns the signed-in user, or null. Deletes expired sessions and extends ones that are past half their life. */
export async function validateSession(db: DB, token: string | undefined, now = new Date()): Promise<{ user: SessionUser; expiresAt: Date; renewed: boolean } | null> {
  if (!token) return null;
  const id = hashToken(token);
  const [row] = await db.select({ s: sessions, u: users }).from(sessions).innerJoin(users, eq(users.id, sessions.userId)).where(eq(sessions.id, id));
  if (!row) return null;
  if (row.s.expiresAt.getTime() <= now.getTime()) {
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }
  let expiresAt = row.s.expiresAt;
  let renewed = false;
  if (expiresAt.getTime() - now.getTime() < RENEW_WHEN_DAYS_LEFT * DAY) {
    expiresAt = new Date(now.getTime() + SESSION_DAYS * DAY);
    await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, id));
    renewed = true;
  }
  const u = row.u;
  return { user: { id: u.id, email: u.email, name: u.name, isBuildway: u.isBuildway }, expiresAt, renewed };
}

export async function deleteSession(db: DB, token: string) {
  await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
}

/* ---------- sign-in ---------- */

export interface ProviderProfile { provider: string; subject: string; email: string; name: string }

/**
 * Finds or creates the user for a provider identity, links it by email when the
 * identity is new, marks Buildway staff by email domain, and accepts pending invitations.
 */
export async function signInWithIdentity(db: DB, profile: ProviderProfile, opts: { buildwayDomains: string[] }): Promise<string> {
  const email = normaliseEmail(profile.email);
  const domain = email.split("@")[1] ?? "";
  const isBuildway = opts.buildwayDomains.map((d) => d.toLowerCase()).includes(domain);

  return db.transaction(async (tx) => {
    let userId: string | undefined;
    const [ident] = await tx.select().from(identities).where(and(eq(identities.provider, profile.provider), eq(identities.subject, profile.subject)));
    if (ident) userId = ident.userId;
    if (!userId) {
      const [byEmail] = await tx.select().from(users).where(eq(users.email, email));
      userId = byEmail?.id;
      if (!userId) {
        const [created] = await tx.insert(users).values({ email, name: profile.name || email, isBuildway }).returning();
        userId = created.id;
      }
      await tx.insert(identities).values({ provider: profile.provider, subject: profile.subject, userId });
    }
    await tx.update(users).set({ name: profile.name || email, lastSignInAt: new Date(), ...(isBuildway ? { isBuildway: true } : {}) }).where(eq(users.id, userId));
    await acceptInvitations(tx as unknown as DB, userId, email);
    if (isBuildway) await joinExampleAsAdvisor(tx as unknown as DB, userId);
    return userId;
  });
}

/** Developer sign-in: only for users that already exist (the seeded example users). Never enabled in production by default. */
export async function signInDev(db: DB, email: string): Promise<string> {
  const [u] = await db.select().from(users).where(eq(users.email, normaliseEmail(email)));
  if (!u) throw new NotFoundError("No such user");
  await db.update(users).set({ lastSignInAt: new Date() }).where(eq(users.id, u.id));
  return u.id;
}

async function acceptInvitations(db: DB, userId: string, email: string) {
  const pending = await db.select().from(invitations).where(eq(invitations.email, email));
  for (const inv of pending) {
    await db.insert(memberships).values({ workspaceId: inv.workspaceId, userId, role: inv.role }).onConflictDoNothing();
    await db.delete(invitations).where(eq(invitations.id, inv.id));
  }
}

async function joinExampleAsAdvisor(db: DB, userId: string) {
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.slug, EXAMPLE_WORKSPACE));
  if (ws) await db.insert(memberships).values({ workspaceId: ws.id, userId, role: "advisor" }).onConflictDoNothing();
}

/* ---------- access checks ---------- */

export interface Access { workspaceId: string; workspaceSlug: string; role: Role; userId: string; isBuildway: boolean }

/** The user's access to a workspace. Non-members get NotFound, so workspace names don't leak. */
export async function getAccess(db: DB, wsSlug: string, user: Pick<SessionUser, "id" | "isBuildway">): Promise<Access> {
  const [row] = await db.select({ ws: workspaces, role: memberships.role })
    .from(workspaces)
    .innerJoin(memberships, and(eq(memberships.workspaceId, workspaces.id), eq(memberships.userId, user.id)))
    .where(eq(workspaces.slug, wsSlug));
  if (!row) throw new NotFoundError(`Workspace ${wsSlug} not found`);
  return { workspaceId: row.ws.id, workspaceSlug: row.ws.slug, role: toRole(row.role), userId: user.id, isBuildway: user.isBuildway };
}

export async function authorize(db: DB, wsSlug: string, user: SessionUser, permission: Permission): Promise<Access> {
  const access = await getAccess(db, wsSlug, user);
  if (!can(access.role, permission)) throw new ForbiddenError("Your role does not allow this");
  return access;
}

export async function listMyWorkspaces(db: DB, userId: string) {
  const rows = await db.select({ slug: workspaces.slug, name: workspaces.name, isExample: workspaces.isExample, role: memberships.role })
    .from(memberships).innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
    .where(eq(memberships.userId, userId)).orderBy(workspaces.name);
  return rows.map((r) => ({ ...r, role: toRole(r.role) }));
}

/* ---------- workspaces and members ---------- */

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;

export async function createWorkspace(db: DB, user: SessionUser, input: { name: string; slug: string }) {
  if (!user.isBuildway) throw new ForbiddenError("Only Buildway staff can create workspaces");
  if (!SLUG.test(input.slug)) throw new ConflictError("Use lowercase letters, digits and hyphens for the address");
  return db.transaction(async (tx) => {
    const [taken] = await tx.select().from(workspaces).where(eq(workspaces.slug, input.slug));
    if (taken) throw new ConflictError("That address is taken");
    const [ws] = await tx.insert(workspaces).values({ slug: input.slug, name: input.name }).returning();
    await tx.insert(memberships).values({ workspaceId: ws.id, userId: user.id, role: "advisor" });
    await audit(tx as unknown as DB, ws.id, user.id, "workspace.created", { name: input.name });
    return ws;
  });
}

export async function listMembers(db: DB, access: Access) {
  const members = await db.select({ userId: users.id, email: users.email, name: users.name, role: memberships.role, lastSignInAt: users.lastSignInAt })
    .from(memberships).innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.workspaceId, access.workspaceId)).orderBy(users.name);
  const invites = await db.select({ id: invitations.id, email: invitations.email, role: invitations.role, createdAt: invitations.createdAt })
    .from(invitations).where(eq(invitations.workspaceId, access.workspaceId)).orderBy(invitations.createdAt);
  return {
    members: members.map((m) => ({ ...m, role: toRole(m.role), lastSignInAt: m.lastSignInAt?.toISOString() ?? null })),
    invitations: invites.map((i) => ({ ...i, role: toRole(i.role), createdAt: i.createdAt.toISOString() })),
  };
}

/** Adds an existing user directly; otherwise stores an invitation accepted at their first sign-in. */
export async function inviteMember(db: DB, access: Access, emailRaw: string, role: Role) {
  if (!canAssignRole(access, role)) throw new ForbiddenError("You can't give that role");
  const email = normaliseEmail(emailRaw);
  await db.transaction(async (tx) => {
    const [u] = await tx.select().from(users).where(eq(users.email, email));
    if (u) {
      const [m] = await tx.select().from(memberships).where(and(eq(memberships.workspaceId, access.workspaceId), eq(memberships.userId, u.id)));
      if (m) throw new ConflictError(`${email} is already a member`);
      await tx.insert(memberships).values({ workspaceId: access.workspaceId, userId: u.id, role: toDbRole(role) });
      await audit(tx as unknown as DB, access.workspaceId, access.userId, "member.added", { email, role });
    } else {
      await tx.insert(invitations).values({ workspaceId: access.workspaceId, email, role: toDbRole(role), invitedBy: access.userId })
        .onConflictDoUpdate({ target: [invitations.workspaceId, invitations.email], set: { role: toDbRole(role), invitedBy: access.userId } });
      await audit(tx as unknown as DB, access.workspaceId, access.userId, "member.invited", { email, role });
    }
  });
}

async function emailOf(db: DB, userId: string) {
  const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId));
  return u?.email ?? null;
}

async function managersLeft(db: DB, workspaceId: string, excludingUserId: string) {
  const [{ n }] = await db.select({ n: count() }).from(memberships)
    .where(and(eq(memberships.workspaceId, workspaceId), inArray(memberships.role, ["advisor", "customer_admin"])));
  const [self] = await db.select().from(memberships).where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, excludingUserId)));
  const selfIsManager = self && (self.role === "advisor" || self.role === "customer_admin");
  return n - (selfIsManager ? 1 : 0);
}

export async function changeRole(db: DB, access: Access, userId: string, role: Role) {
  if (!canAssignRole(access, role)) throw new ForbiddenError("You can't give that role");
  const [m] = await db.select().from(memberships).where(and(eq(memberships.workspaceId, access.workspaceId), eq(memberships.userId, userId)));
  if (!m) throw new NotFoundError("Member not found");
  if (m.role === "advisor" && !access.isBuildway) throw new ForbiddenError("Only Buildway staff can change an advisor");
  const staysManager = role === "advisor" || role === "customer-admin";
  if (!staysManager && (await managersLeft(db, access.workspaceId, userId)) < 1) throw new ConflictError("A workspace needs at least one admin or advisor");
  await db.update(memberships).set({ role: toDbRole(role) }).where(and(eq(memberships.workspaceId, access.workspaceId), eq(memberships.userId, userId)));
  await audit(db, access.workspaceId, access.userId, "member.role_changed", { userId, email: await emailOf(db, userId), from: toRole(m.role), to: role });
}

export async function removeMember(db: DB, access: Access, userId: string) {
  const [m] = await db.select().from(memberships).where(and(eq(memberships.workspaceId, access.workspaceId), eq(memberships.userId, userId)));
  if (!m) throw new NotFoundError("Member not found");
  if (m.role === "advisor" && !access.isBuildway) throw new ForbiddenError("Only Buildway staff can remove an advisor");
  if ((await managersLeft(db, access.workspaceId, userId)) < 1) throw new ConflictError("A workspace needs at least one admin or advisor");
  const email = await emailOf(db, userId);
  await db.delete(memberships).where(and(eq(memberships.workspaceId, access.workspaceId), eq(memberships.userId, userId)));
  await audit(db, access.workspaceId, access.userId, "member.removed", { userId, email, role: toRole(m.role) });
}

export async function revokeInvitation(db: DB, access: Access, invitationId: string) {
  const res = await db.delete(invitations).where(and(eq(invitations.workspaceId, access.workspaceId), eq(invitations.id, invitationId))).returning();
  if (!res.length) throw new NotFoundError("Invitation not found");
  await audit(db, access.workspaceId, access.userId, "invitation.revoked", { email: res[0].email });
}
