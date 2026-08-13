DROP TABLE `workspace_cloud_deletes`;--> statement-breakpoint
ALTER TABLE `local_automations` DROP COLUMN `target_host_id`;--> statement-breakpoint
ALTER TABLE `local_todos` DROP COLUMN `target_host_id`;--> statement-breakpoint
ALTER TABLE `workspaces` DROP COLUMN `created_by_user_id`;--> statement-breakpoint
ALTER TABLE `workspaces` DROP COLUMN `cloud_synced_at`;