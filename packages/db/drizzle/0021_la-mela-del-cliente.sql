ALTER TYPE "public"."event_source" ADD VALUE 'reception';--> statement-breakpoint
CREATE TABLE "customer_rewards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"gosino_id" uuid NOT NULL,
	"message_id" uuid,
	"ts" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "weekly_reward_limit" integer;--> statement-breakpoint
ALTER TABLE "customer_rewards" ADD CONSTRAINT "customer_rewards_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_rewards" ADD CONSTRAINT "customer_rewards_household_customer_fk" FOREIGN KEY ("household_id","customer_id") REFERENCES "public"."customers"("household_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_rewards" ADD CONSTRAINT "customer_rewards_household_gosino_fk" FOREIGN KEY ("household_id","gosino_id") REFERENCES "public"."gosini"("household_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_rewards_customer_ts_idx" ON "customer_rewards" USING btree ("customer_id","ts");