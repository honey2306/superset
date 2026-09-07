CREATE TABLE `discussion_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`source_session_id` text NOT NULL,
	`topic` text NOT NULL,
	`status` text NOT NULL,
	`current_round` integer NOT NULL,
	`max_rounds` integer NOT NULL,
	`participants_json` text NOT NULL,
	`rounds_json` text DEFAULT '[]' NOT NULL,
	`final_positions_json` text DEFAULT '[]' NOT NULL,
	`failure_message` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer
);
--> statement-breakpoint
CREATE INDEX `discussion_runs_workspace_history_idx` ON `discussion_runs` (`workspace_id`,`created_at`);