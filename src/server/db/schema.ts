/**
 * Database schema (Postgres, via Drizzle). Source of truth for migrations in /drizzle.
 * Every tenant-owned table carries workspace_id; all queries in src/server/repo.ts filter on it.
 */
import { sql } from "drizzle-orm";
import { check, uniqueIndex, boolean, doublePrecision, integer, jsonb, pgEnum, pgTable, primaryKey, smallint, text, timestamp, unique, uuid, bigserial, date } from "drizzle-orm/pg-core";
import type { Assumptions } from "@/domain/types";

export const memberRole = pgEnum("member_role", ["advisor", "customer_admin", "process_owner", "viewer"]);
export const processStage = pgEnum("process_stage", ["not_started", "find", "build", "run"]);
export const gateStatus = pgEnum("gate_status", ["red", "amber", "green"]);
export const rating = pgEnum("rating", ["low", "medium", "high"]);
export const designStatus = pgEnum("design_status", ["draft", "approved"]);

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  isExample: boolean("is_example").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  isBuildway: boolean("is_buildway").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSignInAt: timestamp("last_sign_in_at", { withTimezone: true }),
});

/** A sign-in identity at a provider (Microsoft Entra ID, Google). One user can have several. */
export const identities = pgTable("identities", {
  provider: text("provider").notNull(),
  subject: text("subject").notNull(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.provider, t.subject] })]);

/** Sessions. The cookie holds a random token; only its SHA-256 hash is stored. */
export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Pending invitations, accepted when someone signs in with the invited email. */
export const invitations = pgTable("invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: memberRole("role").notNull(),
  invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique().on(t.workspaceId, t.email)]);

export const memberships = pgTable("memberships", {
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: memberRole("role").notNull(),
}, (t) => [primaryKey({ columns: [t.workspaceId, t.userId] })]);

export const processes = pgTable("processes", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  templateId: text("template_id"),
  templateVersion: text("template_version"),
  unit: text("unit").notNull().default("case"),
  stage: processStage("stage").notNull().default("not_started"),
  gate: gateStatus("gate").notNull().default("red"),
  note: text("note").notNull().default(""),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique().on(t.workspaceId, t.slug)]);

export const steps = pgTable("steps", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  processId: uuid("process_id").notNull().references(() => processes.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  position: integer("position").notNull(),
  minutesPerCase: doublePrecision("minutes_per_case").notNull(),
  fitVolume: rating("fit_volume").notNull(),
  fitRuleBased: rating("fit_rule_based").notNull(),
  fitDataReady: rating("fit_data_ready").notNull(),
  fitErrorRisk: rating("fit_error_risk").notNull(),
}, (t) => [unique().on(t.processId, t.key)]);

/** One mutable draft per process; approving copies it into an immutable approved design. */
export const designs = pgTable("designs", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  processId: uuid("process_id").notNull().references(() => processes.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  status: designStatus("status").notNull(),
  assumptions: jsonb("assumptions").$type<Assumptions>().notNull(),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique().on(t.processId, t.version),
  uniqueIndex("one_draft_per_process").on(t.processId).where(sql`${t.status} = 'draft'`),
]);

export const designSteps = pgTable("design_steps", {
  designId: uuid("design_id").notNull().references(() => designs.id, { onDelete: "cascade" }),
  stepId: uuid("step_id").notNull().references(() => steps.id, { onDelete: "cascade" }),
  autonomy: smallint("autonomy").notNull(),
  isSystem: boolean("is_system").notNull().default(false),
}, (t) => [
  primaryKey({ columns: [t.designId, t.stepId] }),
  check("autonomy_range", sql`${t.autonomy} between 0 and 4`),
]);

export const baselines = pgTable("baselines", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  processId: uuid("process_id").notNull().references(() => processes.id, { onDelete: "cascade" }),
  designId: uuid("design_id").notNull().references(() => designs.id),
  netValueSek: doublePrecision("net_value_sek").notNull(),
  lowSek: doublePrecision("low_sek").notNull(),
  highSek: doublePrecision("high_sek").notNull(),
  approvedBy: uuid("approved_by").notNull().references(() => users.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Metric values per period, per process and optionally per step. Filled by CSV upload and connectors. */
export const actuals = pgTable("actuals", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  processId: uuid("process_id").notNull().references(() => processes.id, { onDelete: "cascade" }),
  stepId: uuid("step_id").references(() => steps.id, { onDelete: "cascade" }),
  metric: text("metric").notNull(),
  periodStart: date("period_start").notNull(),
  value: doublePrecision("value").notNull(),
  source: text("source").notNull(),
});

export const auditLog = pgTable("audit_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  actorId: uuid("actor_id").references(() => users.id),
  action: text("action").notNull(),
  subject: jsonb("subject").notNull(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});
