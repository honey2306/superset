CREATE TABLE `task_file_edits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` text NOT NULL,
	`tool_call_id` text NOT NULL,
	`path` text NOT NULL,
	`before_hash` text,
	`after_hash` text,
	`reliable` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `task_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `task_file_edits_call_idx` ON `task_file_edits` (`run_id`,`tool_call_id`);--> statement-breakpoint
CREATE INDEX `task_file_edits_run_idx` ON `task_file_edits` (`run_id`,`id`);--> statement-breakpoint
CREATE TABLE `task_operations` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`revision` integer NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`plan_json` text NOT NULL,
	`commit_oid` text,
	`pid` integer,
	`exit_code` integer,
	`lease_key` text,
	`error` text,
	`output` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `task_runs`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `task_operations_run_kind_idx` ON `task_operations` (`run_id`,`kind`);--> statement-breakpoint
CREATE UNIQUE INDEX `task_operations_lease_idx` ON `task_operations` (`lease_key`) WHERE lease_key IS NOT NULL;--> statement-breakpoint
ALTER TABLE `task_runs` ADD `accepted_revision` integer;--> statement-breakpoint
ALTER TABLE `task_runs` ADD `delivery_revoked` integer DEFAULT false NOT NULL;