CREATE TABLE `books` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text(500) NOT NULL,
	`author` text(500) NOT NULL,
	`isbn` text(20),
	`publisher` text(255),
	`year` integer,
	`language` text(10),
	`description` text,
	`genre` text(100),
	`tags` text,
	`cover_path` text,
	`file_path` text NOT NULL,
	`file_format` text(10) NOT NULL,
	`file_size` integer NOT NULL,
	`file_hash` text(64),
	`page_count` integer,
	`added_by` text NOT NULL,
	`metadata_source` text(20),
	`metadata_locked` integer DEFAULT false,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`added_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`refresh_token_hash` text(255) NOT NULL,
	`device_info` text(255),
	`ip_address` text(45),
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text(255) NOT NULL,
	`display_name` text(100) NOT NULL,
	`avatar_url` text,
	`role` text(20) DEFAULT 'user' NOT NULL,
	`password_hash` text,
	`oidc_provider` text(255),
	`oidc_subject` text(255),
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`last_login_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);