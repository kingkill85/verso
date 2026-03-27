CREATE TABLE `annotations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`book_id` text NOT NULL,
	`type` text(20) DEFAULT 'highlight' NOT NULL,
	`content` text,
	`note` text,
	`cfi_position` text NOT NULL,
	`cfi_end` text,
	`color` text(20) DEFAULT 'yellow',
	`chapter` text(255),
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `metadata_cache` (
	`id` text PRIMARY KEY NOT NULL,
	`query_key` text(255) NOT NULL,
	`source` text(20) NOT NULL,
	`data` text NOT NULL,
	`fetched_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `metadata_cache_query_source_idx` ON `metadata_cache` (`query_key`,`source`);--> statement-breakpoint
ALTER TABLE `books` ADD `series` text(255);--> statement-breakpoint
ALTER TABLE `books` ADD `series_index` real;