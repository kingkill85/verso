CREATE TABLE `devices` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text(255),
	`model` text(255),
	`last_seen` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `kosync_progress` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`document_hash` text(32) NOT NULL,
	`progress` text NOT NULL,
	`percentage` real NOT NULL,
	`device_id` text NOT NULL,
	`device` text(255),
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `kosync_progress_user_doc_idx` ON `kosync_progress` (`user_id`,`document_hash`);--> statement-breakpoint
CREATE TABLE `page_stats` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`book_id` text,
	`book_md5` text NOT NULL,
	`device_id` text NOT NULL,
	`page` integer NOT NULL,
	`start_time` integer NOT NULL,
	`duration` integer NOT NULL,
	`total_pages` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `page_stats_dedup_idx` ON `page_stats` (`device_id`,`book_md5`,`page`,`start_time`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_annotations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`book_id` text NOT NULL,
	`type` text(20) DEFAULT 'highlight' NOT NULL,
	`content` text,
	`note` text,
	`cfi_position` text,
	`cfi_end` text,
	`color` text(20) DEFAULT 'yellow',
	`chapter` text(255),
	`page_number` integer,
	`device_id` text,
	`source` text(20) DEFAULT 'web',
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_annotations`("id", "user_id", "book_id", "type", "content", "note", "cfi_position", "cfi_end", "color", "chapter", "created_at", "updated_at") SELECT "id", "user_id", "book_id", "type", "content", "note", "cfi_position", "cfi_end", "color", "chapter", "created_at", "updated_at" FROM `annotations`;--> statement-breakpoint
DROP TABLE `annotations`;--> statement-breakpoint
ALTER TABLE `__new_annotations` RENAME TO `annotations`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `books` ADD `md5_hash` text(32);--> statement-breakpoint
ALTER TABLE `reading_progress` ADD `device_id` text REFERENCES devices(id) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `reading_sessions` ADD `device_id` text REFERENCES devices(id) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `reading_sessions` ADD `source` text(20) DEFAULT 'web';--> statement-breakpoint
ALTER TABLE `reading_sessions` ADD `book_title` text;