CREATE TABLE `smtp_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text(20) DEFAULT 'custom' NOT NULL,
	`host` text(255) NOT NULL,
	`port` integer NOT NULL,
	`username` text(255) NOT NULL,
	`encrypted_password` text NOT NULL,
	`encryption` text(10) DEFAULT 'ssl' NOT NULL,
	`kindle_email` text(255) NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `smtp_settings_user_id_unique` ON `smtp_settings` (`user_id`);