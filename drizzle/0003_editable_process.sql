CREATE TYPE "public"."step_phase" AS ENUM('both', 'as-is', 'to-be');--> statement-breakpoint
CREATE TABLE "process_edges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"process_id" uuid NOT NULL,
	"from_step_id" uuid NOT NULL,
	"to_step_id" uuid NOT NULL,
	"label" text,
	CONSTRAINT "process_edges_from_step_id_to_step_id_unique" UNIQUE("from_step_id","to_step_id")
);
--> statement-breakpoint
ALTER TABLE "designs" ADD COLUMN "steps_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "steps" ADD COLUMN "case_share" double precision DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "steps" ADD COLUMN "phase" "step_phase" DEFAULT 'both' NOT NULL;--> statement-breakpoint
ALTER TABLE "steps" ADD COLUMN "pos_x" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "steps" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "process_edges" ADD CONSTRAINT "process_edges_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_edges" ADD CONSTRAINT "process_edges_process_id_processes_id_fk" FOREIGN KEY ("process_id") REFERENCES "public"."processes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_edges" ADD CONSTRAINT "process_edges_from_step_id_steps_id_fk" FOREIGN KEY ("from_step_id") REFERENCES "public"."steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_edges" ADD CONSTRAINT "process_edges_to_step_id_steps_id_fk" FOREIGN KEY ("to_step_id") REFERENCES "public"."steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "steps" ADD CONSTRAINT "case_share_range" CHECK ("steps"."case_share" between 0 and 100);--> statement-breakpoint
ALTER TABLE "steps" ADD CONSTRAINT "minutes_non_negative" CHECK ("steps"."minutes_per_case" >= 0);--> statement-breakpoint
-- Lay out existing steps left to right in their current order.
UPDATE "steps" SET "pos_x" = "position" * 220;--> statement-breakpoint
-- Connect existing steps in sequence.
INSERT INTO "process_edges" ("workspace_id", "process_id", "from_step_id", "to_step_id")
SELECT a."workspace_id", a."process_id", a."id", b."id"
FROM "steps" a JOIN "steps" b ON b."process_id" = a."process_id" AND b."position" = a."position" + 1
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- Example workspaces: escalation and quality review apply to a share of contacts (template v1.1).
UPDATE "steps" s SET "case_share" = CASE s."key" WHEN 'escalate' THEN 20 WHEN 'review' THEN 15 ELSE s."case_share" END
FROM "processes" p JOIN "workspaces" w ON w."id" = p."workspace_id"
WHERE s."process_id" = p."id" AND w."is_example" = true AND p."template_id" = 'customer-service' AND s."key" IN ('escalate', 'review');
