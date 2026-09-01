CREATE TYPE "public"."color_mode" AS ENUM('light', 'dark', 'system');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "theme" text DEFAULT 'modern-minimal' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "color_mode" "color_mode" DEFAULT 'system' NOT NULL;
