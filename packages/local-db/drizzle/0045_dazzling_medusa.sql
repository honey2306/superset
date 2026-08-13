DROP TABLE `browser_history`;--> statement-breakpoint
DROP TABLE `v1_migration_state`;--> statement-breakpoint
DROP TABLE `organization_members`;--> statement-breakpoint
DROP TABLE `organizations`;--> statement-breakpoint
DROP TABLE `projects`;--> statement-breakpoint
DROP TABLE `tasks`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
DROP TABLE `workspace_sections`;--> statement-breakpoint
DROP TABLE `workspaces`;--> statement-breakpoint
DROP TABLE `worktrees`;--> statement-breakpoint
ALTER TABLE `settings` DROP COLUMN `active_organization_id`;--> statement-breakpoint
ALTER TABLE `settings` DROP COLUMN `persist_terminal`;--> statement-breakpoint
ALTER TABLE `settings` DROP COLUMN `branch_prefix_mode`;--> statement-breakpoint
ALTER TABLE `settings` DROP COLUMN `branch_prefix_custom`;--> statement-breakpoint
ALTER TABLE `settings` DROP COLUMN `open_links_in_app`;--> statement-breakpoint
ALTER TABLE `settings` DROP COLUMN `expose_host_service_via_relay`;--> statement-breakpoint
ALTER TABLE `settings` DROP COLUMN `worktree_base_dir`;