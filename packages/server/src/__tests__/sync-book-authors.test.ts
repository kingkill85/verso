import { describe, it, expect, beforeEach } from "vitest";
import { createTestContext } from "../test-utils.js";
import { books, authors, bookAuthors } from "@verso/shared";
import { asc, eq } from "drizzle-orm";
import { syncBookAuthors } from "../services/sync-book-authors.js";

describe("syncBookAuthors", () => {
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

  it("creates an author and links to book for a single author string", async () => {
    const book = await insertBook({ author: "Frank Herbert" });
    await syncBookAuthors(ctx.db, book.id, "Frank Herbert");

    const allAuthors = await ctx.db.select().from(authors);
    expect(allAuthors).toHaveLength(1);
    expect(allAuthors[0].name).toBe("Frank Herbert");

    const links = await ctx.db.select().from(bookAuthors).where(eq(bookAuthors.bookId, book.id));
    expect(links).toHaveLength(1);
    expect(links[0].authorId).toBe(allAuthors[0].id);
    expect(links[0].position).toBe(0);
  });

  it("returns isNew flag for new vs existing authors", async () => {
    const book1 = await insertBook({ title: "Dune", author: "Frank Herbert" });
    const result1 = await syncBookAuthors(ctx.db, book1.id, "Frank Herbert");
    expect(result1).toHaveLength(1);
    expect(result1[0].isNew).toBe(true);
    expect(result1[0].name).toBe("Frank Herbert");

    const book2 = await insertBook({ title: "Dune Messiah", author: "Frank Herbert" });
    const result2 = await syncBookAuthors(ctx.db, book2.id, "Frank Herbert");
    expect(result2[0].isNew).toBe(false);
  });

  it("splits comma-separated authors and creates multiple links", async () => {
    const book = await insertBook({ author: "Brian Herbert, Kevin J. Anderson" });
    await syncBookAuthors(ctx.db, book.id, "Brian Herbert, Kevin J. Anderson");

    const allAuthors = await ctx.db.select().from(authors);
    expect(allAuthors).toHaveLength(2);

    const links = await ctx.db.select().from(bookAuthors).where(eq(bookAuthors.bookId, book.id)).orderBy(asc(bookAuthors.position));
    expect(links).toHaveLength(2);
    expect(links[0].position).toBe(0);
    expect(links[1].position).toBe(1);
  });

  it("reuses existing author records (case-insensitive)", async () => {
    const book1 = await insertBook({ title: "Dune", author: "Frank Herbert" });
    const book2 = await insertBook({ title: "Dune Messiah", author: "frank herbert" });

    await syncBookAuthors(ctx.db, book1.id, "Frank Herbert");
    await syncBookAuthors(ctx.db, book2.id, "frank herbert");

    const allAuthors = await ctx.db.select().from(authors);
    expect(allAuthors).toHaveLength(1);

    const links1 = await ctx.db.select().from(bookAuthors).where(eq(bookAuthors.bookId, book1.id));
    const links2 = await ctx.db.select().from(bookAuthors).where(eq(bookAuthors.bookId, book2.id));
    expect(links1[0].authorId).toBe(links2[0].authorId);
  });

  it("replaces old links when called again with a different author string", async () => {
    const book = await insertBook({ author: "Frank Herbert" });
    await syncBookAuthors(ctx.db, book.id, "Frank Herbert");
    await syncBookAuthors(ctx.db, book.id, "Brian Herbert, Kevin J. Anderson");

    const links = await ctx.db.select().from(bookAuthors).where(eq(bookAuthors.bookId, book.id));
    expect(links).toHaveLength(2);

    const allAuthors = await ctx.db.select().from(authors);
    expect(allAuthors.length).toBeGreaterThanOrEqual(2);
  });

  it("trims whitespace from author names", async () => {
    const book = await insertBook({ author: "  Frank Herbert , Brian Herbert  " });
    await syncBookAuthors(ctx.db, book.id, "  Frank Herbert , Brian Herbert  ");

    const allAuthors = await ctx.db.select().from(authors);
    expect(allAuthors).toHaveLength(2);
    expect(allAuthors.map((a) => a.name).sort()).toEqual(["Brian Herbert", "Frank Herbert"]);
  });
});
