import { describe, it, expect, beforeEach } from "vitest";
import { createTestContext } from "../test-utils.js";
import { books, publishers } from "@verso/shared";
import { eq } from "drizzle-orm";
import { syncBookPublisher } from "../services/sync-book-publisher.js";

describe("syncBookPublisher", () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;
  let userId: string;

  beforeEach(async () => {
    ctx = await createTestContext();
    const reg = await ctx.caller.auth.register({
      email: "test@example.com",
      password: "password123",
      displayName: "Test User",
    });
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

  it("creates a publisher and links to book", async () => {
    const book = await insertBook({ publisher: "Penguin Books" });
    const result = await syncBookPublisher(ctx.db, book.id, "Penguin Books");

    expect(result).not.toBeNull();
    expect(result!.name).toBe("Penguin Books");

    const allPublishers = await ctx.db.select().from(publishers);
    expect(allPublishers).toHaveLength(1);

    const [updatedBook] = await ctx.db.select().from(books).where(eq(books.id, book.id));
    expect(updatedBook.publisherId).toBe(result!.id);
    expect(updatedBook.publisher).toBe("Penguin Books");
  });

  it("reuses existing publisher (case-insensitive)", async () => {
    const book1 = await insertBook({ title: "Book 1", publisher: "Penguin Books" });
    const book2 = await insertBook({ title: "Book 2", publisher: "penguin books" });

    await syncBookPublisher(ctx.db, book1.id, "Penguin Books");
    await syncBookPublisher(ctx.db, book2.id, "penguin books");

    const allPublishers = await ctx.db.select().from(publishers);
    expect(allPublishers).toHaveLength(1);

    const [b1] = await ctx.db.select().from(books).where(eq(books.id, book1.id));
    const [b2] = await ctx.db.select().from(books).where(eq(books.id, book2.id));
    expect(b1.publisherId).toBe(b2.publisherId);
    // Display name should use canonical (first-created) name
    expect(b2.publisher).toBe("Penguin Books");
  });

  it("clears publisherId when given null", async () => {
    const book = await insertBook({ publisher: "Penguin Books" });
    await syncBookPublisher(ctx.db, book.id, "Penguin Books");
    await syncBookPublisher(ctx.db, book.id, null);

    const [updatedBook] = await ctx.db.select().from(books).where(eq(books.id, book.id));
    expect(updatedBook.publisherId).toBeNull();
    expect(updatedBook.publisher).toBeNull();
  });

  it("clears publisherId when given empty string", async () => {
    const book = await insertBook({ publisher: "Penguin Books" });
    await syncBookPublisher(ctx.db, book.id, "Penguin Books");
    await syncBookPublisher(ctx.db, book.id, "");

    const [updatedBook] = await ctx.db.select().from(books).where(eq(books.id, book.id));
    expect(updatedBook.publisherId).toBeNull();
    expect(updatedBook.publisher).toBeNull();
  });

  it("trims whitespace from publisher names", async () => {
    const book = await insertBook({ publisher: "  Penguin Books  " });
    const result = await syncBookPublisher(ctx.db, book.id, "  Penguin Books  ");

    expect(result!.name).toBe("Penguin Books");
  });
});
