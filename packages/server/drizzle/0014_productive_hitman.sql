CREATE TABLE `book_genres` (
	`book_id` text NOT NULL,
	`genre_id` text NOT NULL,
	PRIMARY KEY(`book_id`, `genre_id`),
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`genre_id`) REFERENCES `genres`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `genres` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text(100) NOT NULL,
	`name` text(200) NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_by` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `genres_slug_unique` ON `genres` (`slug`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_shelves` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text(100) NOT NULL,
	`description` text,
	`emoji` text(50),
	`user_id` text NOT NULL,
	`is_smart` integer DEFAULT false,
	`is_default` integer DEFAULT false,
	`smart_filter` text,
	`position` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_shelves`("id", "name", "description", "emoji", "user_id", "is_smart", "is_default", "smart_filter", "position", "created_at", "updated_at") SELECT "id", "name", "description", "emoji", "user_id", "is_smart", "is_default", "smart_filter", "position", "created_at", "updated_at" FROM `shelves`;--> statement-breakpoint
DROP TABLE `shelves`;--> statement-breakpoint
ALTER TABLE `__new_shelves` RENAME TO `shelves`;--> statement-breakpoint
PRAGMA foreign_keys=ON;