CREATE TABLE `activity_log` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`user_id` text,
	`book_id` text,
	`book_title` text,
	`details` text,
	`level` text DEFAULT 'info' NOT NULL,
	`created_at` text NOT NULL
);
