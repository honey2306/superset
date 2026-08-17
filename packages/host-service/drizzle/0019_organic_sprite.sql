CREATE TABLE `delegation_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_session_id` text NOT NULL,
	`parent_workspace_id` text NOT NULL,
	`child_session_id` text NOT NULL,
	`child_workspace_id` text NOT NULL,
	`handoff` text NOT NULL,
	`actual_agent` text,
	`actual_model` text,
	`harness` text NOT NULL,
	`status` text NOT NULL,
	`failure_message` text,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	`failed_at` integer,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `delegation_runs_child_session_id_unique` ON `delegation_runs` (`child_session_id`);--> statement-breakpoint
CREATE INDEX `delegation_runs_parent_session_history_idx` ON `delegation_runs` (`parent_session_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `host_settings` ADD `delegated_execution_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `host_settings` ADD `delegated_execution_agent_config_id` text;--> statement-breakpoint
ALTER TABLE `host_settings` ADD `delegated_execution_model_id` text;