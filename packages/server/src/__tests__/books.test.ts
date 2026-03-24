import { describe, it, expect, beforeEach } from "vitest";
import { createTestContext } from "../test-utils.js";
import { books } from "@verso/shared";

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
      await ctx.db.insert(books).values; // no-op, just need the book in DB
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
});
