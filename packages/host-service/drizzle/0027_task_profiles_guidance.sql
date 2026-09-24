CREATE TABLE `task_guidance` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`revision` integer NOT NULL,
	`kind` text NOT NULL,
	`text` text NOT NULL,
	`status` text NOT NULL,
	`request_hash` text NOT NULL,
	`delivery_mode` text,
	`created_at` integer NOT NULL,
	`delivered_at` integer,
	FOREIGN KEY (`run_id`) REFERENCES `task_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `task_guidance_revision_idx` ON `task_guidance` (`run_id`,`revision`);--> statement-breakpoint
CREATE TABLE `task_profiles` (
	`project_id` text PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`config_json` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `task_checks` ADD `revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `task_checks` ADD `check_key` text;--> statement-breakpoint
ALTER TABLE `task_checks` ADD `selection_reason` text;--> statement-breakpoint
ALTER TABLE `task_runs` ADD `revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `task_runs` ADD `acceptance_mode` text;--> statement-breakpoint
ALTER TABLE `task_runs` ADD `profile_json` text;--> statement-breakpoint
ALTER TABLE `task_runs` ADD `effective_strategy` text;--> statement-breakpoint
ALTER TABLE `task_runs` ADD `policy_reason` text;--> statement-breakpoint
ALTER TABLE `task_runs` ADD `baseline_changes_json` text;--> statement-breakpoint
ALTER TABLE `task_runs` ADD `selected_checks_json` text;--> statement-breakpoint
ALTER TABLE `task_runs` ADD `last_failure_key` text;--> statement-breakpoint
ALTER TABLE `task_runs` ADD `no_progress_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `task_runs` ADD `metrics_json` text;--> statement-breakpoint
ALTER TABLE `task_runs` ADD `phase_started_at` integer;