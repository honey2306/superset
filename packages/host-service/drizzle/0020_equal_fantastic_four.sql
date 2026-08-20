ALTER TABLE `acp_sessions` ADD `role` text DEFAULT 'root-coordinator' NOT NULL;--> statement-breakpoint
ALTER TABLE `host_settings` ADD `delegation_profiles` text;