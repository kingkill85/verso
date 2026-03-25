import { describe, it, expect, beforeEach } from "vitest";
import { createTestContext } from "../test-utils.js";
import { books } from "@verso/shared";

describe("books.search (FTS5)", () => {
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

  it("finds books by title", async () => {
    await insertBook({ title: "Rust Programming" });
    await insertBook({ title: "JavaScript Guide" });
    const result = await authedCaller.books.search({ query: "Rust" });
    expect(result.books).toHaveLength(1);
    expect(result.books[0].title).toBe("Rust Programming");
  });

  it("finds books by author", async () => {
    await insertBook({ title: "Book A", author: "Alice Smith" });
    await insertBook({ title: "Book B", author: "Bob Jones" });
    const result = await authedCaller.books.search({ query: "Alice" });
    expect(result.books).toHaveLength(1);
    expect(result.books[0].author).toBe("Alice Smith");
  });

  it("finds books by description", async () => {
    await insertBook({ title: "Book A", description: "A tale of quantum mechanics" });
    await insertBook({ title: "Book B", description: "A romance novel" });
    const result = await authedCaller.books.search({ query: "quantum" });
    expect(result.books).toHaveLength(1);
    expect(result.books[0].title).toBe("Book A");
  });

  it("ranks title matches higher than description matches", async () => {
    await insertBook({ title: "Algorithms Explained", description: "A textbook" });
    await insertBook({ title: "Some Other Book", description: "Covers algorithms in depth" });
    const result = await authedCaller.books.search({ query: "Algorithms" });
    expect(result.books).toHaveLength(2);
    expect(result.books[0].title).toBe("Algorithms Explained");
  });

  it("returns empty for no match", async () => {
    await insertBook({ title: "Existing Book" });
    const result = await authedCaller.books.search({ query: "nonexistent" });
    expect(result.books).toHaveLength(0);
  });

  it("filters by genre", async () => {
    await insertBook({ title: "Sci-Fi Novel", genre: "Science Fiction" });
    await insertBook({ title: "Sci-Fi Guide", genre: "Reference" });
    const result = await authedCaller.books.search({ query: "Sci-Fi", genre: "Science Fiction" });
    expect(result.books).toHaveLength(1);
    expect(result.books[0].genre).toBe("Science Fiction");
  });

  it("filters by format", async () => {
    await insertBook({ title: "EPUB Book", fileFormat: "epub" });
    await insertBook({ title: "PDF Book", fileFormat: "pdf" });
    const result = await authedCaller.books.search({ query: "Book", format: "pdf" });
    expect(result.books).toHaveLength(1);
    expect(result.books[0].fileFormat).toBe("pdf");
  });

  it("paginates results", async () => {
    for (let i = 0; i < 5; i++) {
      await insertBook({ title: `Search Target ${i}` });
    }
    const page1 = await authedCaller.books.search({ query: "Search Target", limit: 2, page: 1 });
    expect(page1.books).toHaveLength(2);
    expect(page1.total).toBe(5);
  });
});
