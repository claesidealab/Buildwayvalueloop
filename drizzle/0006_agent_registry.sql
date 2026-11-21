CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"process_id" uuid NOT NULL,
	"step_id" uuid NOT NULL,
	"name" text NOT NULL,
	"platform" text DEFAULT '' NOT NULL,
	"owner" text DEFAULT '' NOT NULL,
	"model" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"risk" text DEFAULT 'minimal' NOT NULL,
	"monthly_budget" double precision,
	"price_in" double precision,
	"price_out" double precision,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agents_step_id_unique" UNIQUE("step_id"),
	CONSTRAINT "agents_status" CHECK ("agents"."status" in ('planned', 'shadow', 'live', 'paused')),
	CONSTRAINT "agents_risk" CHECK ("agents"."risk" in ('minimal', 'limited', 'high'))
);
--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_process_id_processes_id_fk" FOREIGN KEY ("process_id") REFERENCES "public"."processes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_step_id_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."steps"("id") ON DELETE cascade ON UPDATE no action;