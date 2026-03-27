UPDATE shelves SET emoji = 'icon:book-open' WHERE is_default = 1 AND name = 'Currently Reading';
--> statement-breakpoint
UPDATE shelves SET emoji = 'icon:bookmark-plus' WHERE is_default = 1 AND name = 'Want to Read';
--> statement-breakpoint
UPDATE shelves SET emoji = 'icon:star' WHERE is_default = 1 AND name = 'Favorites';
--> statement-breakpoint
UPDATE shelves SET emoji = 'icon:clock' WHERE is_default = 1 AND name = 'Recently Added';
--> statement-breakpoint
UPDATE shelves SET emoji = 'icon:check-circle' WHERE is_default = 1 AND name = 'Finished';
