CREATE TABLE `shelf_books` (
	`shelf_id` text NOT NULL,
	`book_id` text NOT NULL,
	`position` integer NOT NULL,
	`added_at` text DEFAULT (datetime('now')) NOT NULL,
	PRIMARY KEY(`shelf_id`, `book_id`),
	FOREIGN KEY (`shelf_id`) REFERENCES `shelves`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `shelves` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text(100) NOT NULL,
	`description` text,
	`emoji` text(10),
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
-- FTS5 virtual table for full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS books_fts USING fts5(
  title,
  author,
  description,
  content='books',
  content_rowid='rowid'
);
--> statement-breakpoint
-- Populate FTS from existing books
INSERT INTO books_fts(rowid, title, author, description)
SELECT rowid, title, author, COALESCE(description, '') FROM books;
--> statement-breakpoint
-- Keep FTS in sync with books table
CREATE TRIGGER books_fts_insert AFTER INSERT ON books BEGIN
  INSERT INTO books_fts(rowid, title, author, description)
  VALUES (NEW.rowid, NEW.title, NEW.author, COALESCE(NEW.description, ''));
END;
--> statement-breakpoint
CREATE TRIGGER books_fts_delete AFTER DELETE ON books BEGIN
  INSERT INTO books_fts(books_fts, rowid, title, author, description)
  VALUES ('delete', OLD.rowid, OLD.title, OLD.author, COALESCE(OLD.description, ''));
END;
--> statement-breakpoint
CREATE TRIGGER books_fts_update AFTER UPDATE ON books BEGIN
  INSERT INTO books_fts(books_fts, rowid, title, author, description)
  VALUES ('delete', OLD.rowid, OLD.title, OLD.author, COALESCE(OLD.description, ''));
  INSERT INTO books_fts(rowid, title, author, description)
  VALUES (NEW.rowid, NEW.title, NEW.author, COALESCE(NEW.description, ''));
END;
