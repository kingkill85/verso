import { eq, isNotNull, sql } from "drizzle-orm";
import { genres, books, bookGenres } from "@verso/shared";
import type { AppDatabase } from "../db/client.js";
import { matchOrCreateGenre } from "./genre-matcher.js";

export const DEFAULT_GENRES = [
  // Fiction
  { slug: "fiction", name: "Fiction" },
  { slug: "literary-fiction", name: "Literary Fiction" },
  { slug: "science-fiction", name: "Science Fiction" },
  { slug: "fantasy", name: "Fantasy" },
  { slug: "mystery", name: "Mystery" },
  { slug: "thriller", name: "Thriller" },
  { slug: "romance", name: "Romance" },
  { slug: "horror", name: "Horror" },
  { slug: "historical-fiction", name: "Historical Fiction" },
  { slug: "adventure", name: "Adventure" },
  { slug: "crime", name: "Crime" },
  { slug: "drama", name: "Drama" },
  { slug: "young-adult", name: "Young Adult" },
  { slug: "childrens", name: "Children's" },
  { slug: "humor", name: "Humor" },
  { slug: "satire", name: "Satire" },
  { slug: "western", name: "Western" },
  { slug: "dystopian", name: "Dystopian" },
  { slug: "urban-fantasy", name: "Urban Fantasy" },
  { slug: "paranormal", name: "Paranormal" },
  { slug: "graphic-novel", name: "Graphic Novel" },
  { slug: "short-stories", name: "Short Stories" },
  { slug: "fairy-tales", name: "Fairy Tales" },
  { slug: "mythology", name: "Mythology" },
  { slug: "magical-realism", name: "Magical Realism" },
  { slug: "cyberpunk", name: "Cyberpunk" },
  { slug: "steampunk", name: "Steampunk" },
  { slug: "space-opera", name: "Space Opera" },
  { slug: "military-fiction", name: "Military Fiction" },
  { slug: "espionage", name: "Espionage" },
  { slug: "erotic-fiction", name: "Erotic Fiction" },
  { slug: "cozy-mystery", name: "Cozy Mystery" },
  { slug: "dark-fantasy", name: "Dark Fantasy" },
  { slug: "epic-fantasy", name: "Epic Fantasy" },
  { slug: "psychological-thriller", name: "Psychological Thriller" },
  { slug: "romantic-suspense", name: "Romantic Suspense" },
  { slug: "coming-of-age", name: "Coming of Age" },
  { slug: "alternate-history", name: "Alternate History" },
  { slug: "post-apocalyptic", name: "Post-Apocalyptic" },
  // Non-Fiction
  { slug: "non-fiction", name: "Non-Fiction" },
  { slug: "biography", name: "Biography" },
  { slug: "memoir", name: "Memoir" },
  { slug: "autobiography", name: "Autobiography" },
  { slug: "self-help", name: "Self-Help" },
  { slug: "science", name: "Science" },
  { slug: "history", name: "History" },
  { slug: "philosophy", name: "Philosophy" },
  { slug: "poetry", name: "Poetry" },
  { slug: "psychology", name: "Psychology" },
  { slug: "sociology", name: "Sociology" },
  { slug: "politics", name: "Politics" },
  { slug: "economics", name: "Economics" },
  { slug: "business", name: "Business" },
  { slug: "technology", name: "Technology" },
  { slug: "religion", name: "Religion" },
  { slug: "spirituality", name: "Spirituality" },
  { slug: "art", name: "Art" },
  { slug: "music", name: "Music" },
  { slug: "travel", name: "Travel" },
  { slug: "cooking", name: "Cooking" },
  { slug: "health", name: "Health" },
  { slug: "fitness", name: "Fitness" },
  { slug: "education", name: "Education" },
  { slug: "parenting", name: "Parenting" },
  { slug: "nature", name: "Nature" },
  { slug: "true-crime", name: "True Crime" },
  { slug: "journalism", name: "Journalism" },
  { slug: "essays", name: "Essays" },
  { slug: "reference", name: "Reference" },
] as const;

export async function seedDefaultGenres(db: AppDatabase) {
  for (const genre of DEFAULT_GENRES) {
    await db
      .insert(genres)
      .values({
        slug: genre.slug,
        name: genre.name,
        isDefault: true,
      })
      .onConflictDoNothing();
  }
}

export async function migrateExistingGenres(db: AppDatabase) {
  // Check if migration already ran
  const existing = await db.select({ count: sql<number>`count(*)` }).from(bookGenres);
  if (existing[0].count > 0) return;

  const booksWithGenre = await db
    .select({ id: books.id, genre: books.genre })
    .from(books)
    .where(isNotNull(books.genre));

  for (const book of booksWithGenre) {
    if (!book.genre) continue;

    // Split comma/slash/semicolon separated values
    const parts = book.genre.split(/[,/;]/).map((s) => s.trim()).filter(Boolean);

    for (const part of parts) {
      const genreId = await matchOrCreateGenre(db, part);
      if (genreId) {
        await db
          .insert(bookGenres)
          .values({ bookId: book.id, genreId })
          .onConflictDoNothing();
      }
    }
  }
}
