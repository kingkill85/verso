import { describe, it, expect, beforeEach } from "vitest";
import { createTestContext } from "../test-utils.js";
import { books, authors, bookAuthors } from "@verso/shared";

describe("authors router", () => {
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

  async function insertAuthorWithBooks(name: string, bookCount: number) {
    const [author] = await ctx.db
      .insert(authors)
      .values({ name, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .returning();

    for (let i = 0; i < bookCount; i++) {
      const bookId = crypto.randomUUID();
      await ctx.db.insert(books).values({
        id: bookId,
        title: `${name} Book ${i + 1}`,
        author: name,
        filePath: `books/${bookId}.epub`,
        fileFormat: "epub",
        fileSize: 1024,
        addedBy: userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await ctx.db.insert(bookAuthors).values({ bookId, authorId: author.id, position: 0 });
    }

    return author;
  }

  describe("list", () => {
    it("returns empty list when no authors exist", async () => {
      const result = await authedCaller.authors.list({});
      expect(result).toHaveLength(0);
    });

    it("returns authors with book counts, sorted by count desc", async () => {
      await insertAuthorWithBooks("Frank Herbert", 3);
      await insertAuthorWithBooks("Neal Stephenson", 1);

      const result = await authedCaller.authors.list({});
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("Frank Herbert");
      expect(result[0].bookCount).toBe(3);
      expect(result[1].name).toBe("Neal Stephenson");
      expect(result[1].bookCount).toBe(1);
    });

    it("excludes authors with zero books", async () => {
      await ctx.db.insert(authors).values({
        name: "No Books Author",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await insertAuthorWithBooks("Has Books", 1);

      const result = await authedCaller.authors.list({});
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Has Books");
    });

    it("filters by search term", async () => {
      await insertAuthorWithBooks("Frank Herbert", 2);
      await insertAuthorWithBooks("Neal Stephenson", 1);

      const result = await authedCaller.authors.list({ search: "frank" });
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Frank Herbert");
    });
  });

  describe("byId", () => {
    it("returns author with books", async () => {
      const author = await insertAuthorWithBooks("Frank Herbert", 2);

      const result = await authedCaller.authors.byId({ id: author.id });
      expect(result.name).toBe("Frank Herbert");
      expect(result.books).toHaveLength(2);
    });

    it("throws NOT_FOUND for missing author", async () => {
      await expect(
        authedCaller.authors.byId({ id: crypto.randomUUID() })
      ).rejects.toThrow("Author not found");
    });
  });
});
