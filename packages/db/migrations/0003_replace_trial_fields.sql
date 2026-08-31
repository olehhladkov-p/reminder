ALTER TABLE "subscriptions" ADD COLUMN "is_trial" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "subscriptions"
SET
  "next_renewal_date" = "trial_ends_at",
  "lead_days" = COALESCE("trial_lead_days", "lead_days"),
  "is_trial" = true
WHERE "trial_ends_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" DROP COLUMN "trial_ends_at";--> statement-breakpoint
ALTER TABLE "subscriptions" DROP COLUMN "trial_lead_days";
