CREATE TABLE `task_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`iteration` integer NOT NULL,
	`check_index` integer NOT NULL,
	`name` text NOT NULL,
	`command` text NOT NULL,
	`cwd` text NOT NULL,
	`status` text NOT NULL,
	`pid` integer,
	`exit_code` integer,
	`output` text DEFAULT '' NOT NULL,
	`fingerprint` text,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	FOREIGN KEY (`run_id`) REFERENCES `task_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `task_checks_run_idx` ON `task_checks` (`run_id`,`iteration`);--> statement-breakpoint
CREATE TABLE `task_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` text NOT NULL,
	`kind` text NOT NULL,
	`message` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `task_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `task_events_run_idx` ON `task_events` (`run_id`,`id`);--> statement-breakpoint
CREATE TABLE `task_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`contract_json` text NOT NULL,
	`session_id` text NOT NULL,
	`cwd` text NOT NULL,
	`lease_path` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`phase` text DEFAULT 'preparing' NOT NULL,
	`desired_state` text DEFAULT 'running' NOT NULL,
	`stop_outcome` text,
	`iteration` integer DEFAULT 0 NOT NULL,
	`repair_count` integer DEFAULT 0 NOT NULL,
	`candidate_fingerprint` text,
	`command_id` text NOT NULL,
	`dispatched_at` integer,
	`before_seq` integer DEFAULT 0 NOT NULL,
	`deadline_at` integer,
	`candidate_json` text,
	`instruction` text,
	`reason` text,
	`baseline_ref` text,
	`baseline_fingerprint` text,
	`verified_fingerprint` text,
	`completion_source` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`ended_at` integer,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `task_runs_session_id_unique` ON `task_runs` (`session_id`);--> statement-breakpoint
CREATE INDEX `task_runs_task_idx` ON `task_runs` (`task_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `task_runs_status_idx` ON `task_runs` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `task_runs_lease_idx` ON `task_runs` (`lease_path`) WHERE lease_path IS NOT NULL;--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`title` text NOT NULL,
	`contract_json` text NOT NULL,
	`request_hash` text NOT NULL,
	`current_run_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `tasks_project_created_idx` ON `tasks` (`project_id`,`created_at`);