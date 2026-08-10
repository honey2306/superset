CREATE TABLE `acp_session_commands` (
	`session_id` text NOT NULL,
	`command_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`session_id`, `command_id`)
);
--> statement-breakpoint
CREATE TABLE `acp_session_journal` (
	`session_id` text NOT NULL,
	`epoch` text NOT NULL,
	`seq` integer NOT NULL,
	`ts` integer NOT NULL,
	`frame_json` text NOT NULL,
	PRIMARY KEY(`session_id`, `epoch`, `seq`)
);
--> statement-breakpoint
ALTER TABLE `acp_sessions` ADD `epoch` text DEFAULT 'legacy' NOT NULL;