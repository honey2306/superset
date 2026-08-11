CREATE TABLE `local_automation_prompt_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`automation_id` text NOT NULL,
	`content` text NOT NULL,
	`content_hash` text NOT NULL,
	`source` text NOT NULL,
	`restored_from_version_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`automation_id`) REFERENCES `local_automations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `local_automation_prompt_versions_history_idx` ON `local_automation_prompt_versions` (`automation_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `local_automation_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`automation_id` text NOT NULL,
	`title` text NOT NULL,
	`scheduled_for` integer NOT NULL,
	`v2_workspace_id` text,
	`session_kind` text,
	`chat_session_id` text,
	`terminal_session_id` text,
	`status` text NOT NULL,
	`error` text,
	`dispatched_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`automation_id`) REFERENCES `local_automations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `local_automation_runs_dedup_idx` ON `local_automation_runs` (`automation_id`,`scheduled_for`);--> statement-breakpoint
CREATE INDEX `local_automation_runs_history_idx` ON `local_automation_runs` (`automation_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `local_automations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`prompt` text NOT NULL,
	`agent` text NOT NULL,
	`target_host_id` text,
	`v2_project_id` text,
	`v2_workspace_id` text,
	`rrule` text NOT NULL,
	`dtstart` integer NOT NULL,
	`timezone` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`mcp_scope_json` text DEFAULT '[]' NOT NULL,
	`next_run_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `local_automations_due_idx` ON `local_automations` (`enabled`,`next_run_at`);--> statement-breakpoint
CREATE INDEX `local_automations_workspace_idx` ON `local_automations` (`v2_workspace_id`);--> statement-breakpoint
CREATE TABLE `local_todos` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`note` text,
	`mode` text NOT NULL,
	`due_at` integer NOT NULL,
	`timezone` text NOT NULL,
	`v2_project_id` text,
	`v2_workspace_id` text,
	`target_host_id` text,
	`agent` text,
	`prompt` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`session_kind` text,
	`chat_session_id` text,
	`terminal_session_id` text,
	`notified_at` integer,
	`dispatched_at` integer,
	`done_at` integer,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `local_todos_due_idx` ON `local_todos` (`status`,`due_at`);--> statement-breakpoint
CREATE INDEX `local_todos_workspace_idx` ON `local_todos` (`v2_workspace_id`);