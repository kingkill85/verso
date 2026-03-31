CREATE TABLE `book_hashes` (
	`id` text PRIMARY KEY NOT NULL,
	`book_id` text NOT NULL,
	`md5_hash` text(32) NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade
);
