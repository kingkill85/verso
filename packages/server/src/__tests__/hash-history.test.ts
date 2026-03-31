import { describe, it, expect, beforeEach } from "vitest";
import { createTestContext } from "../test-utils.js";
import { bookHashes, books } from "@verso/shared";
import { eq } from "drizzle-orm";
import { saveHash } from "../services/hash-history.js";

describe("hash-history", () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;
  let bookId: string;

  beforeEach(async () => {
    ctx = await createTestContext();
    // Create a test user + book
    const reg = await ctx.caller.auth.register({
      email: "test@example.com",
      password: "password123",
      displayName: "Test",
    });
    const [book] = await ctx.db
      .insert(books)
      .values({
        title: "Test Book",
        author: "Author",
        filePath: "books/test/book.epub",
        fileFormat: "epub",
        fileSize: 1000,
        md5Hash: "original_hash_abc",
        addedBy: reg.user.id,
      })
      .returning();
    bookId = book.id;
  });

  it("saves a hash", () => {
    saveHash(ctx.db, bookId, "abc123def456");
    const rows = ctx.db.select().from(bookHashes).where(eq(bookHashes.bookId, bookId)).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].md5Hash).toBe("abc123def456");
  });

  it("skips duplicate hashes", () => {
    saveHash(ctx.db, bookId, "abc123def456");
    saveHash(ctx.db, bookId, "abc123def456");
    const rows = ctx.db.select().from(bookHashes).where(eq(bookHashes.bookId, bookId)).all();
    expect(rows).toHaveLength(1);
  });

  it("saves multiple different hashes for same book", () => {
    saveHash(ctx.db, bookId, "hash_one");
    saveHash(ctx.db, bookId, "hash_two");
    const rows = ctx.db.select().from(bookHashes).where(eq(bookHashes.bookId, bookId)).all();
    expect(rows).toHaveLength(2);
  });

  it("does not throw on error", () => {
    // Pass invalid bookId — should not throw
    expect(() => saveHash(ctx.db, "nonexistent-book-id", "some_hash")).not.toThrow();
  });
});
