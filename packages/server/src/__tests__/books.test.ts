import { describe, it, expect, beforeEach } from "vitest";
import { createTestContext } from "../test-utils.js";
import { books, readingProgress, genres, bookGenres } from "@verso/shared";
import { eq } from "drizzle-orm";

describe("books router", () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;
  let authedCaller: ReturnType<typeof ctx.createAuthedCaller>;
  let userId: string;

  beforeEach(async () => {
    ctx = await createTestContext();

    // Register a user and get an authed caller
    const reg = await ctx.caller.auth.register({
      email: "test@example.com",
      password: "password123",
      displayName: "Test User",
    });
    authedCaller = ctx.createAuthedCaller(reg.accessToken);
    userId = reg.user.id;
  });

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

  async function linkGenre(bookId: string, slug: string, name: string) {
    const existing = await ctx.db.select().from(genres).where(eq(genres.slug, slug)).get();
    let genreId: string;
    if (existing) {
      genreId = existing.id;
    } else {
      const [created] = await ctx.db.insert(genres).values({ slug, name, isDefault: true }).returning();
      genreId = created.id;
    }
    await ctx.db.insert(bookGenres).values({ bookId, genreId }).onConflictDoNothing();
  }

  describe("list", () => {
    it("returns empty list initially", async () => {
      const result = await authedCaller.books.list({});
      expect(result.books).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.page).toBe(1);
    });

    it("returns books after creating one", async () => {
      await insertBook({ title: "My Book" });
      const result = await authedCaller.books.list({});
      expect(result.books).toHaveLength(1);
      expect(result.books[0].title).toBe("My Book");
      expect(result.total).toBe(1);
    });

    it("filters by search term", async () => {
      await insertBook({ title: "Rust Programming" });
      await insertBook({ title: "JavaScript Guide" });

      const result = await authedCaller.books.list({ search: "Rust" });
      expect(result.books).toHaveLength(1);
      expect(result.books[0].title).toBe("Rust Programming");
    });

    it("filters by format", async () => {
      await insertBook({ title: "EPUB Book", fileFormat: "epub" });
      await insertBook({ title: "PDF Book", fileFormat: "pdf" });

      const result = await authedCaller.books.list({ format: "pdf" });
      expect(result.books).toHaveLength(1);
      expect(result.books[0].title).toBe("PDF Book");
    });

    it("paginates results", async () => {
      for (let i = 0; i < 5; i++) {
        await insertBook({ title: `Book ${i}` });
      }

      const page1 = await authedCaller.books.list({ limit: 2, page: 1 });
      expect(page1.books).toHaveLength(2);
      expect(page1.total).toBe(5);

      const page2 = await authedCaller.books.list({ limit: 2, page: 2 });
      expect(page2.books).toHaveLength(2);
    });

    it("search with % wildcard does not match everything", async () => {
      await insertBook({ title: "Alpha" });
      await insertBook({ title: "Beta" });

      const result = await authedCaller.books.list({ search: "%" });
      // "%" should be escaped — literal search for "%", not a wildcard matching all
      expect(result.books).toHaveLength(0);
    });
  });

  describe("byId", () => {
    it("returns a book by id", async () => {
      const inserted = await insertBook({ title: "Found Book" });
      const book = await authedCaller.books.byId({ id: inserted.id });
      expect(book.title).toBe("Found Book");
      expect(book.id).toBe(inserted.id);
    });

    it("throws NOT_FOUND for missing id", async () => {
      await expect(
        authedCaller.books.byId({ id: crypto.randomUUID() })
      ).rejects.toThrow("Book not found");
    });
  });

  describe("update", () => {
    it("updates title and author", async () => {
      const inserted = await insertBook();
      const updated = await authedCaller.books.update({
        id: inserted.id,
        title: "New Title",
        author: "New Author",
      });
      expect(updated.title).toBe("New Title");
      expect(updated.author).toBe("New Author");
    });

    it("sets metadataLocked to true on update", async () => {
      const inserted = await insertBook();
      const updated = await authedCaller.books.update({
        id: inserted.id,
        title: "Updated",
      });
      expect(updated.metadataLocked).toBe(true);
    });

    it("updates tags as JSON", async () => {
      const inserted = await insertBook();
      const updated = await authedCaller.books.update({
        id: inserted.id,
        tags: ["fiction", "sci-fi"],
      });
      expect(JSON.parse(updated.tags!)).toEqual(["fiction", "sci-fi"]);
    });

    it("throws NOT_FOUND for missing book", async () => {
      await expect(
        authedCaller.books.update({ id: crypto.randomUUID(), title: "X" })
      ).rejects.toThrow("Book not found");
    });
  });

  describe("delete", () => {
    it("deletes a book", async () => {
      const inserted = await insertBook();
      // Create the file so storage.delete doesn't fail
      const result = await authedCaller.books.delete({ id: inserted.id });
      expect(result.success).toBe(true);

      // Verify it's gone
      await expect(
        authedCaller.books.byId({ id: inserted.id })
      ).rejects.toThrow("Book not found");
    });

    it("throws NOT_FOUND for missing book", async () => {
      await expect(
        authedCaller.books.delete({ id: crypto.randomUUID() })
      ).rejects.toThrow("Book not found");
    });
  });

  describe("recentlyAdded", () => {
    it("returns books sorted by creation date", async () => {
      await insertBook({
        title: "Old Book",
        createdAt: "2024-01-01T00:00:00.000Z",
      });
      await insertBook({
        title: "New Book",
        createdAt: "2024-06-01T00:00:00.000Z",
      });

      const result = await authedCaller.books.recentlyAdded({ limit: 10 });
      expect(result).toHaveLength(2);
      expect(result[0].title).toBe("New Book");
      expect(result[1].title).toBe("Old Book");
    });

    it("respects limit", async () => {
      for (let i = 0; i < 5; i++) {
        await insertBook({ title: `Book ${i}` });
      }
      const result = await authedCaller.books.recentlyAdded({ limit: 3 });
      expect(result).toHaveLength(3);
    });
  });

  describe("almostFinished", () => {
    it("returns empty array when no progress exists", async () => {
      await insertBook();
      const result = await authedCaller.books.almostFinished();
      expect(result).toHaveLength(0);
    });

    it("returns books with 75%+ progress that are not finished", async () => {
      const book1 = await insertBook({ title: "Almost Done" });
      const book2 = await insertBook({ title: "Just Started" });
      const book3 = await insertBook({ title: "Finished Book" });

      await ctx.db.insert(readingProgress).values([
        {
          userId,
          bookId: book1.id,
          percentage: 82,
          currentPage: 246,
          totalPages: 300,
          startedAt: new Date().toISOString(),
          lastReadAt: new Date().toISOString(),
        },
        {
          userId,
          bookId: book2.id,
          percentage: 20,
          currentPage: 60,
          totalPages: 300,
          startedAt: new Date().toISOString(),
          lastReadAt: new Date().toISOString(),
        },
        {
          userId,
          bookId: book3.id,
          percentage: 100,
          currentPage: 300,
          totalPages: 300,
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          lastReadAt: new Date().toISOString(),
        },
      ]);

      const result = await authedCaller.books.almostFinished();
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("Almost Done");
      expect(result[0].percentage).toBe(82);
      expect(result[0].currentPage).toBe(246);
      expect(result[0].totalPages).toBe(300);
    });

    it("orders by percentage descending", async () => {
      const book1 = await insertBook({ title: "78 percent" });
      const book2 = await insertBook({ title: "95 percent" });

      await ctx.db.insert(readingProgress).values([
        {
          userId,
          bookId: book1.id,
          percentage: 78,
          currentPage: 234,
          totalPages: 300,
          startedAt: new Date().toISOString(),
          lastReadAt: new Date().toISOString(),
        },
        {
          userId,
          bookId: book2.id,
          percentage: 95,
          currentPage: 285,
          totalPages: 300,
          startedAt: new Date().toISOString(),
          lastReadAt: new Date().toISOString(),
        },
      ]);

      const result = await authedCaller.books.almostFinished();
      expect(result).toHaveLength(2);
      expect(result[0].title).toBe("95 percent");
      expect(result[1].title).toBe("78 percent");
    });
  });

  describe("recommended", () => {
    it("returns empty array when no reading history exists", async () => {
      const book = await insertBook({});
      await linkGenre(book.id, "sci-fi", "Sci-Fi");
      const result = await authedCaller.books.recommended({});
      expect(result).toHaveLength(0);
    });

    it("recommends unread books by same author as currently reading", async () => {
      const reading = await insertBook({ title: "Dune", author: "Frank Herbert" });
      await linkGenre(reading.id, "sci-fi", "Sci-Fi");
      const unread = await insertBook({ title: "Children of Dune", author: "Frank Herbert" });
      await linkGenre(unread.id, "sci-fi", "Sci-Fi");
      const other = await insertBook({ title: "1984", author: "George Orwell" });
      await linkGenre(other.id, "dystopian", "Dystopian");

      await ctx.db.insert(readingProgress).values({
        userId,
        bookId: reading.id,
        percentage: 40,
        startedAt: new Date().toISOString(),
        lastReadAt: new Date().toISOString(),
      });

      const result = await authedCaller.books.recommended({});
      expect(result.length).toBeGreaterThanOrEqual(1);
      // First result should be the author match
      expect(result[0].title).toBe("Children of Dune");
      expect(result[0].reason).toContain("Frank Herbert");
      // Backfilled books (if any) should have empty reason
      const backfilled = result.filter((r: any) => r.reason === "");
      for (const b of backfilled) {
        expect(b.title).not.toBe("Dune"); // should not include the reading book
      }
    });

    it("recommends unread books by same genre as finished books", async () => {
      const finished = await insertBook({ title: "Dune", author: "Frank Herbert" });
      await linkGenre(finished.id, "sci-fi", "Sci-Fi");
      const unread = await insertBook({ title: "Snow Crash", author: "Neal Stephenson" });
      await linkGenre(unread.id, "sci-fi", "Sci-Fi");
      const other = await insertBook({ title: "Pride and Prejudice", author: "Jane Austen" });
      await linkGenre(other.id, "romance", "Romance");

      await ctx.db.insert(readingProgress).values({
        userId,
        bookId: finished.id,
        percentage: 100,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        lastReadAt: new Date().toISOString(),
      });

      const result = await authedCaller.books.recommended({});
      expect(result.length).toBeGreaterThanOrEqual(1);
      // First result should be the genre match
      expect(result[0].title).toBe("Snow Crash");
      expect(result[0].reason).toContain("Sci-Fi");
    });

    it("excludes books the user has already started", async () => {
      const reading = await insertBook({ title: "Dune", author: "Frank Herbert" });
      await linkGenre(reading.id, "sci-fi", "Sci-Fi");
      const alsoStarted = await insertBook({ title: "Children of Dune", author: "Frank Herbert" });
      await linkGenre(alsoStarted.id, "sci-fi", "Sci-Fi");

      await ctx.db.insert(readingProgress).values([
        {
          userId,
          bookId: reading.id,
          percentage: 40,
          startedAt: new Date().toISOString(),
          lastReadAt: new Date().toISOString(),
        },
        {
          userId,
          bookId: alsoStarted.id,
          percentage: 10,
          startedAt: new Date().toISOString(),
          lastReadAt: new Date().toISOString(),
        },
      ]);

      const result = await authedCaller.books.recommended({});
      expect(result).toHaveLength(0);
    });

    it("prioritises same-author over same-genre", async () => {
      const reading = await insertBook({ title: "Dune", author: "Frank Herbert" });
      await linkGenre(reading.id, "sci-fi", "Sci-Fi");
      const sameAuthor = await insertBook({ title: "Children of Dune", author: "Frank Herbert" });
      await linkGenre(sameAuthor.id, "sci-fi", "Sci-Fi");
      const sameGenre = await insertBook({ title: "Snow Crash", author: "Neal Stephenson" });
      await linkGenre(sameGenre.id, "sci-fi", "Sci-Fi");

      await ctx.db.insert(readingProgress).values({
        userId,
        bookId: reading.id,
        percentage: 40,
        startedAt: new Date().toISOString(),
        lastReadAt: new Date().toISOString(),
      });

      const result = await authedCaller.books.recommended({ limit: 2 });
      expect(result.length).toBeLessThanOrEqual(2);
      expect(result[0].title).toBe("Children of Dune");
    });

    it("respects the limit parameter", async () => {
      const reading = await insertBook({ title: "Dune", author: "Frank Herbert" });
      await linkGenre(reading.id, "sci-fi", "Sci-Fi");

      for (let i = 0; i < 5; i++) {
        const b = await insertBook({ title: `Sci-Fi Book ${i}`, author: `Author ${i}` });
        await linkGenre(b.id, "sci-fi", "Sci-Fi");
      }

      await ctx.db.insert(readingProgress).values({
        userId,
        bookId: reading.id,
        percentage: 40,
        startedAt: new Date().toISOString(),
        lastReadAt: new Date().toISOString(),
      });

      const result = await authedCaller.books.recommended({ limit: 3 });
      expect(result.length).toBeLessThanOrEqual(3);
    });
  });

  describe("currentlyReading", () => {
    it("returns empty when no books are in progress", async () => {
      await insertBook({ title: "Idle Book" });
      const result = await authedCaller.books.currentlyReading();
      expect(result).toHaveLength(0);
    });

    it("returns books with active progress", async () => {
      const book = await insertBook({ title: "Active Book" });
      const { readingProgress } = await import("@verso/shared");
      await ctx.db.insert(readingProgress).values({
        userId,
        bookId: book.id,
        percentage: 42,
        startedAt: new Date().toISOString(),
        lastReadAt: new Date().toISOString(),
      });

      const result = await authedCaller.books.currentlyReading();
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("Active Book");
      expect(result[0].percentage).toBe(42);
    });

    it("excludes finished books", async () => {
      const book = await insertBook({ title: "Finished Book" });
      const { readingProgress } = await import("@verso/shared");
      await ctx.db.insert(readingProgress).values({
        userId,
        bookId: book.id,
        percentage: 100,
        startedAt: new Date().toISOString(),
        lastReadAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
      });

      const result = await authedCaller.books.currentlyReading();
      expect(result).toHaveLength(0);
    });
  });
});
