CREATE TABLE "billing_events" (
	"provider" text NOT NULL,
	"event_id" text NOT NULL,
	"type" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_events_provider_event_id_pk" PRIMARY KEY("provider","event_id")
);
--> statement-breakpoint
CREATE TABLE "credit_settings" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"auto_recharge" boolean DEFAULT false NOT NULL,
	"threshold_micros" bigint DEFAULT 2000000 NOT NULL,
	"amount_micros" bigint DEFAULT 10000000 NOT NULL,
	"monthly_cap_micros" bigint DEFAULT 50000000 NOT NULL,
	"provider" text,
	"payment_method_enc" text,
	"pending_since" timestamp with time zone,
	"failures" integer DEFAULT 0 NOT NULL,
	"disabled_reason" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_settings_provider" CHECK ("credit_settings"."provider" is null or "credit_settings"."provider" in ('stripe', 'paypal')),
	CONSTRAINT "credit_settings_positive" CHECK ("credit_settings"."amount_micros" > 0 and "credit_settings"."threshold_micros" >= 0)
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"customer_ref" text,
	"plan" text NOT NULL,
	"status" text NOT NULL,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_provider" CHECK ("subscriptions"."provider" in ('stripe', 'paypal')),
	CONSTRAINT "subscriptions_plan" CHECK ("subscriptions"."plan" in ('pro', 'allevamento'))
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "plan_grant" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "auto_deliver" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "adoptions" ADD COLUMN "payment_provider" text;--> statement-breakpoint
ALTER TABLE "credit_settings" ADD CONSTRAINT "credit_settings_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_plan_grant" CHECK ("accounts"."plan_grant" is null or "accounts"."plan_grant" in ('free', 'pro', 'allevamento'));