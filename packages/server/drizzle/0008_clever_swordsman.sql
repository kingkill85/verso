DROP TABLE `api_keys`;--> statement-breakpoint
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
	`page_number` text,
	`device_id` text,
	`source` text(20) DEFAULT 'web',
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_annotations`("id", "user_id", "book_id", "type", "content", "note", "cfi_position", "cfi_end", "color", "chapter", "page_number", "device_id", "source", "created_at", "updated_at") SELECT "id", "user_id", "book_id", "type", "content", "note", "cfi_position", "cfi_end", "color", "chapter", "page_number", "device_id", "source", "created_at", "updated_at" FROM `annotations`;--> statement-breakpoint
DROP TABLE `annotations`;--> statement-breakpoint
ALTER TABLE `__new_annotations` RENAME TO `annotations`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `users` ADD `app_password_hash` text;--> statement-breakpoint
ALTER TABLE `users` ADD `app_password_md5` text(32);