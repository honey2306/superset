CREATE TABLE `workspace_operation_artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`operation_id` text NOT NULL,
	`kind` text NOT NULL,
	`identity` text NOT NULL,
	`ownership` text NOT NULL,
	`expected_head_sha` text,
	`cleanup_state` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`operation_id`) REFERENCES `workspace_operations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_operation_artifacts_unique` ON `workspace_operation_artifacts` (`operation_id`,`kind`,`identity`);--> statement-breakpoint
CREATE INDEX `workspace_operation_artifacts_operation_idx` ON `workspace_operation_artifacts` (`operation_id`);--> statement-breakpoint
CREATE TABLE `workspace_operation_locks` (
	`lock_key` text PRIMARY KEY NOT NULL,
	`operation_id` text NOT NULL,
	`lease_owner` text NOT NULL,
	`lease_expires_at` integer NOT NULL,
	FOREIGN KEY (`operation_id`) REFERENCES `workspace_operations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `workspace_operation_steps` (
	`operation_id` text NOT NULL,
	`step_key` text NOT NULL,
	`status` text NOT NULL,
	`attempt` integer DEFAULT 0 NOT NULL,
	`input_json` text,
	`output_json` text,
	`started_at` integer,
	`completed_at` integer,
	FOREIGN KEY (`operation_id`) REFERENCES `workspace_operations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_operation_steps_pk` ON `workspace_operation_steps` (`operation_id`,`step_key`);--> statement-breakpoint
CREATE TABLE `workspace_operations` (
	`id` text PRIMARY KEY NOT NULL,
	`idempotency_key` text NOT NULL,
	`request_hash` text NOT NULL,
	`request_json` text NOT NULL,
	`launch_payload_json` text,
	`requested_by_machine_id` text,
	`state` text NOT NULL,
	`stage` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`project_id` text,
	`workspace_id` text,
	`planned_project_id` text,
	`planned_workspace_id` text,
	`catalog_committed_at` integer,
	`lease_owner` text,
	`lease_expires_at` integer,
	`cancel_requested_at` integer,
	`failure_code` text,
	`failure_class` text,
	`failure_retryable` integer,
	`failure_message` text,
	`cleanup_state` text,
	`result_json` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_operations_idempotency_key_unique` ON `workspace_operations` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `workspace_operations_state_idx` ON `workspace_operations` (`state`);--> statement-breakpoint
CREATE INDEX `workspace_operations_requested_by_machine_idx` ON `workspace_operations` (`requested_by_machine_id`);