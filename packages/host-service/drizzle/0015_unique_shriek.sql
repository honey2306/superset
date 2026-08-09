ALTER TABLE `projects` ADD `sparse_checkout_paths` text;--> statement-breakpoint
ALTER TABLE `workspaces` ADD `suppressed_pull_request_id` text REFERENCES pull_requests(id) ON DELETE SET NULL;
