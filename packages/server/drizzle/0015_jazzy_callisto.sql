CREATE TABLE `author_descriptions` (
	`author_id` text NOT NULL,
	`locale` text(10) NOT NULL,
	`description` text NOT NULL,
	`manually_edited` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`author_id`, `locale`),
	FOREIGN KEY (`author_id`) REFERENCES `authors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `authors` DROP COLUMN `description`;