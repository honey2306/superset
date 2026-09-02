CREATE TABLE `project_memories` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`category` text NOT NULL,
	`source` text NOT NULL,
	`source_session_id` text,
	`pinned` integer DEFAULT false NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_used_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `project_memories_project_enabled_idx` ON `project_memories` (`project_id`,`enabled`);--> statement-breakpoint
CREATE INDEX `project_memories_project_updated_idx` ON `project_memories` (`project_id`,`updated_at`);