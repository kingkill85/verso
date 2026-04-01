CREATE TABLE `book_series` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text(255) NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `books` ADD `series_id` text REFERENCES book_series(id);