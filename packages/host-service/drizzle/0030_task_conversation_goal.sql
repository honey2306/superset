DROP INDEX `task_runs_session_id_unique`;--> statement-breakpoint
ALTER TABLE `task_runs` ADD `from_conversation` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `task_runs` ADD `session_released_at` integer;--> statement-breakpoint
ALTER TABLE `task_runs` ADD `initial_attachments_json` text;--> statement-breakpoint
ALTER TABLE `task_runs` ADD `continuation_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `task_runs` ADD `report_recovery_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `task_runs` ADD `coverage_recovery_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `task_runs` ADD `last_progress_key` text;--> statement-breakpoint
ALTER TABLE `task_runs` ADD `stalled_continuation_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `task_runs_session_history_idx` ON `task_runs` (`session_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `task_runs_session_owner_idx` ON `task_runs` (`session_id`) WHERE session_released_at IS NULL;--> statement-breakpoint
ALTER TABLE `task_guidance` ADD `attachments_json` text;