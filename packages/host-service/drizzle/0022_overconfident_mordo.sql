CREATE TABLE `acp_session_turns` (
	`session_id` text NOT NULL,
	`turn_number` integer NOT NULL,
	`epoch` text NOT NULL,
	`start_seq` integer NOT NULL,
	`end_seq` integer NOT NULL,
	`user_message_json` text NOT NULL,
	`assistant_message_json` text,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`completed_at` integer NOT NULL,
	`duration_ms` integer NOT NULL,
	`message_count` integer NOT NULL,
	`tool_call_count` integer NOT NULL,
	`tool_summaries_json` text DEFAULT '[]' NOT NULL,
	PRIMARY KEY(`session_id`, `turn_number`)
);
