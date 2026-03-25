CREATE TABLE `reading_progress` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`book_id` text NOT NULL,
	`current_page` integer,
	`total_pages` integer,
	`percentage` real DEFAULT 0 NOT NULL,
	`cfi_position` text,
	`started_at` text,
	`last_read_at` text,
	`finished_at` text,
	`time_spent_minutes` integer DEFAULT 0,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade
);
