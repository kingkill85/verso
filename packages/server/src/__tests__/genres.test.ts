import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestContext } from "../test-utils.js";
import { genres, bookGenres, books } from "@verso/shared";

describe("genres router", () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;
  let authedCaller: ReturnType<typeof ctx.createAuthedCaller>;
  let userId: string;

  beforeEach(async () => {
    ctx = await createTestContext();
    const reg = await ctx.caller.auth.register({
      email: "test@example.com",
      password: "password123",
      displayName: "Test User",
    });
    authedCaller = ctx.createAuthedCaller(reg.accessToken);
    userId = reg.user.id;
  });

  async function insertGenre(slug: string, name: string, isDefault = true) {
    const [genre] = await ctx.db
      .insert(genres)
      .values({ slug, name, isDefault })
      .returning();
    return genre;
  }

  async function insertBook(overrides: Partial<typeof books.$inferInsert> = {}) {
    const id = crypto.randomUUID();
    const defaults = {
      id,
      title: "Test Book",
      author: "Test Author",
      filePath: `books/${id}.epub`,
      fileFormat: "epub",
      fileSize: 1024,
      addedBy: userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await ctx.db.insert(books).values({ ...defaults, ...overrides });
    return { ...defaults, ...overrides };
  }

  describe("list", () => {
    it("returns empty list when no genres exist", async () => {
      const result = await authedCaller.genres.list({});
      expect(result).toHaveLength(0);
    });

    it("returns genres with book counts sorted by count desc", async () => {
      const scifi = await insertGenre("science-fiction", "Science Fiction");
      const fantasy = await insertGenre("fantasy", "Fantasy");
      const book1 = await insertBook({ title: "Book 1" });
      const book2 = await insertBook({ title: "Book 2" });
      const book3 = await insertBook({ title: "Book 3" });

      await ctx.db.insert(bookGenres).values([
        { bookId: book1.id, genreId: scifi.id },
        { bookId: book2.id, genreId: scifi.id },
        { bookId: book3.id, genreId: fantasy.id },
      ]);

      const result = await authedCaller.genres.list({});
      expect(result).toHaveLength(2);
      expect(result[0].slug).toBe("science-fiction");
      expect(result[0].bookCount).toBe(2);
      expect(result[1].slug).toBe("fantasy");
      expect(result[1].bookCount).toBe(1);
    });

    it("includes genres with zero books", async () => {
      await insertGenre("science-fiction", "Science Fiction");
      const result = await authedCaller.genres.list({});
      expect(result).toHaveLength(1);
      expect(result[0].bookCount).toBe(0);
    });

    it("filters by search term", async () => {
      await insertGenre("science-fiction", "Science Fiction");
      await insertGenre("fantasy", "Fantasy");

      const result = await authedCaller.genres.list({ search: "Sci" });
      expect(result).toHaveLength(1);
      expect(result[0].slug).toBe("science-fiction");
    });
  });

  describe("create", () => {
    it("creates a custom genre", async () => {
      const result = await authedCaller.genres.create({ name: "Solarpunk" });
      expect(result.slug).toBe("solarpunk");
      expect(result.name).toBe("Solarpunk");
      expect(result.isDefault).toBe(false);
      expect(result.createdBy).toBe(userId);
    });

    it("auto-generates slug from name", async () => {
      const result = await authedCaller.genres.create({ name: "Dark Romance" });
      expect(result.slug).toBe("dark-romance");
    });

    it("rejects duplicate slug", async () => {
      await insertGenre("solarpunk", "Solarpunk", false);
      await expect(
        authedCaller.genres.create({ name: "Solarpunk" })
      ).rejects.toThrow();
    });
  });

  describe("update", () => {
    it("renames a genre", async () => {
      const genre = await insertGenre("scifi", "SciFi", false);
      const result = await authedCaller.genres.update({ id: genre.id, name: "Sci-Fi" });
      expect(result.name).toBe("Sci-Fi");
      expect(result.slug).toBe("sci-fi");
    });
  });

  describe("delete", () => {
    it("deletes a genre and removes book associations", async () => {
      const genre = await insertGenre("test-genre", "Test Genre", false);
      const book = await insertBook({ title: "Book" });
      await ctx.db.insert(bookGenres).values({ bookId: book.id, genreId: genre.id });

      const result = await authedCaller.genres.delete({ id: genre.id });
      expect(result.success).toBe(true);

      const remaining = await ctx.db
        .select()
        .from(bookGenres)
        .where(eq(bookGenres.genreId, genre.id));
      expect(remaining).toHaveLength(0);
    });
  });

  describe("merge", () => {
    it("merges source genre into target", async () => {
      const source = await insertGenre("scifi", "SciFi", false);
      const target = await insertGenre("science-fiction", "Science Fiction");
      const book1 = await insertBook({ title: "Book 1" });
      const book2 = await insertBook({ title: "Book 2" });

      await ctx.db.insert(bookGenres).values([
        { bookId: book1.id, genreId: source.id },
        { bookId: book2.id, genreId: target.id },
      ]);

      await authedCaller.genres.merge({ sourceId: source.id, targetId: target.id });

      const sourceRow = await ctx.db.select().from(genres).where(eq(genres.id, source.id));
      expect(sourceRow).toHaveLength(0);

      const book1Genres = await ctx.db
        .select()
        .from(bookGenres)
        .where(eq(bookGenres.bookId, book1.id));
      expect(book1Genres).toHaveLength(1);
      expect(book1Genres[0].genreId).toBe(target.id);
    });

    it("handles books that already have the target genre", async () => {
      const source = await insertGenre("scifi", "SciFi", false);
      const target = await insertGenre("science-fiction", "Science Fiction");
      const book = await insertBook({ title: "Book" });

      await ctx.db.insert(bookGenres).values([
        { bookId: book.id, genreId: source.id },
        { bookId: book.id, genreId: target.id },
      ]);

      await authedCaller.genres.merge({ sourceId: source.id, targetId: target.id });

      const bookGenresResult = await ctx.db
        .select()
        .from(bookGenres)
        .where(eq(bookGenres.bookId, book.id));
      expect(bookGenresResult).toHaveLength(1);
      expect(bookGenresResult[0].genreId).toBe(target.id);
    });
  });

  describe("migration", () => {
    it("migrates existing genre string to book_genres", async () => {
      const { seedDefaultGenres, migrateExistingGenres } = await import("../services/seed-genres.js");
      await seedDefaultGenres(ctx.db);

      const book = await insertBook({ title: "Old Book", genre: "Science Fiction" });
      await migrateExistingGenres(ctx.db);

      const links = await ctx.db
        .select({ slug: genres.slug })
        .from(bookGenres)
        .innerJoin(genres, eq(genres.id, bookGenres.genreId))
        .where(eq(bookGenres.bookId, book.id));

      expect(links).toHaveLength(1);
      expect(links[0].slug).toBe("science-fiction");
    });

    it("splits comma-separated genres", async () => {
      const { seedDefaultGenres, migrateExistingGenres } = await import("../services/seed-genres.js");
      await seedDefaultGenres(ctx.db);

      const book = await insertBook({ title: "Multi Genre", genre: "Fiction, Romance" });
      await migrateExistingGenres(ctx.db);

      const links = await ctx.db
        .select({ slug: genres.slug })
        .from(bookGenres)
        .innerJoin(genres, eq(genres.id, bookGenres.genreId))
        .where(eq(bookGenres.bookId, book.id));

      expect(links).toHaveLength(2);
      const slugs = links.map((l) => l.slug).sort();
      expect(slugs).toEqual(["fiction", "romance"]);
    });

    it("creates custom genre for unmatched strings", async () => {
      const { seedDefaultGenres, migrateExistingGenres } = await import("../services/seed-genres.js");
      await seedDefaultGenres(ctx.db);

      const book = await insertBook({ title: "Niche Book", genre: "Solarpunk" });
      await migrateExistingGenres(ctx.db);

      const links = await ctx.db
        .select({ slug: genres.slug, isDefault: genres.isDefault })
        .from(bookGenres)
        .innerJoin(genres, eq(genres.id, bookGenres.genreId))
        .where(eq(bookGenres.bookId, book.id));

      expect(links).toHaveLength(1);
      expect(links[0].slug).toBe("solarpunk");
      expect(links[0].isDefault).toBe(false);
    });

    it("matches aliases like Sci-Fi to science-fiction", async () => {
      const { seedDefaultGenres, migrateExistingGenres } = await import("../services/seed-genres.js");
      await seedDefaultGenres(ctx.db);

      const book = await insertBook({ title: "Alias Book", genre: "Sci-Fi" });
      await migrateExistingGenres(ctx.db);

      const links = await ctx.db
        .select({ slug: genres.slug })
        .from(bookGenres)
        .innerJoin(genres, eq(genres.id, bookGenres.genreId))
        .where(eq(bookGenres.bookId, book.id));

      expect(links).toHaveLength(1);
      expect(links[0].slug).toBe("science-fiction");
    });
  });
});
