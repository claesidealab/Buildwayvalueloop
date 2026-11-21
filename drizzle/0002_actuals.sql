ALTER TABLE "actuals" ADD COLUMN "imported_by" uuid;--> statement-breakpoint
ALTER TABLE "actuals" ADD COLUMN "imported_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "actuals" ADD CONSTRAINT "actuals_imported_by_users_id_fk" FOREIGN KEY ("imported_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actuals" ADD CONSTRAINT "actuals_one_value" UNIQUE NULLS NOT DISTINCT("process_id","step_id","metric","period_start","source");