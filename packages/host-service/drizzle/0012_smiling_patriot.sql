CREATE TABLE `catalog_changes` (
	`revision` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`schema_version` integer DEFAULT 1 NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`event_type` text NOT NULL,
	`snapshot_json` text,
	`occurred_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `catalog_identity_conflicts` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`canonical_key` text NOT NULL,
	`conflicting_id` text NOT NULL,
	`reason` text NOT NULL,
	`detected_at` integer NOT NULL,
	`resolved_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `catalog_identity_conflicts_unique` ON `catalog_identity_conflicts` (`entity_type`,`entity_id`,`canonical_key`);--> statement-breakpoint
ALTER TABLE `projects` ADD `kind` text DEFAULT 'repository' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `singleton_key` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `canonical_repo_path` text;--> statement-breakpoint
CREATE UNIQUE INDEX `projects_canonical_repo_path_unique` ON `projects` (`canonical_repo_path`);--> statement-breakpoint
CREATE UNIQUE INDEX `projects_singleton_key_unique` ON `projects` (`singleton_key`) WHERE singleton_key IS NOT NULL;--> statement-breakpoint
ALTER TABLE `workspaces` ADD `canonical_worktree_path` text;--> statement-breakpoint
CREATE UNIQUE INDEX `workspaces_canonical_worktree_path_unique` ON `workspaces` (`canonical_worktree_path`) WHERE canonical_worktree_path IS NOT NULL;