import { describe, it, expect, beforeEach } from "vitest";
import { createTestContext } from "../test-utils.js";
import { books, bookSeries } from "@verso/shared";
import { eq } from "drizzle-orm";
import { syncBookSeries } from "../services/sync-book-series.js";

describe("syncBookSeries", () => {
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
      id, title: "Test Book", author: "Test Author",
      filePath: `books/${id}.epub`, fileFormat: "epub", fileSize: 1024,
      addedBy: userId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    await ctx.db.insert(books).values({ ...defaults, ...overrides });
    return { ...defaults, ...overrides };
  }

  it("creates a series and links to book", async () => {
    const book = await insertBook({ series: "Dune" });
    const result = await syncBookSeries(ctx.db, book.id, "Dune");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("Dune");
    const allSeries = await ctx.db.select().from(bookSeries);
    expect(allSeries).toHaveLength(1);
    const [updatedBook] = await ctx.db.select().from(books).where(eq(books.id, book.id));
    expect(updatedBook.seriesId).toBe(result!.id);
    expect(updatedBook.series).toBe("Dune");
  });

  it("reuses existing series (case-insensitive)", async () => {
    const book1 = await insertBook({ title: "Dune", series: "Dune Chronicles" });
    const book2 = await insertBook({ title: "Dune Messiah", series: "dune chronicles" });
    await syncBookSeries(ctx.db, book1.id, "Dune Chronicles");
    await syncBookSeries(ctx.db, book2.id, "dune chronicles");
    const allSeries = await ctx.db.select().from(bookSeries);
    expect(allSeries).toHaveLength(1);
    const [b1] = await ctx.db.select().from(books).where(eq(books.id, book1.id));
    const [b2] = await ctx.db.select().from(books).where(eq(books.id, book2.id));
    expect(b1.seriesId).toBe(b2.seriesId);
    expect(b2.series).toBe("Dune Chronicles");
  });

  it("clears seriesId when given null", async () => {
    const book = await insertBook({ series: "Dune" });
    await syncBookSeries(ctx.db, book.id, "Dune");
    await syncBookSeries(ctx.db, book.id, null);
    const [updatedBook] = await ctx.db.select().from(books).where(eq(books.id, book.id));
    expect(updatedBook.seriesId).toBeNull();
    expect(updatedBook.series).toBeNull();
  });

  it("clears seriesId when given empty string", async () => {
    const book = await insertBook({ series: "Dune" });
    await syncBookSeries(ctx.db, book.id, "Dune");
    await syncBookSeries(ctx.db, book.id, "");
    const [updatedBook] = await ctx.db.select().from(books).where(eq(books.id, book.id));
    expect(updatedBook.seriesId).toBeNull();
    expect(updatedBook.series).toBeNull();
  });

  it("trims whitespace from series names", async () => {
    const book = await insertBook({ series: "  Dune  " });
    const result = await syncBookSeries(ctx.db, book.id, "  Dune  ");
    expect(result!.name).toBe("Dune");
  });
});
