import { describe, it, expect, beforeEach } from "vitest";
import { createTestContext } from "../test-utils.js";
import { books } from "@verso/shared";

describe("metadata router", () => {
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

  describe("apply", () => {
    it("updates book fields in database", async () => {
      const book = await insertBook();

      const result = await authedCaller.metadata.applyFields({
        bookId: book.id,
        fields: {
          title: "Updated Title",
          author: "Updated Author",
          year: 2023,
        },
      });

      expect(result.title).toBe("Updated Title");
      expect(result.author).toBe("Updated Author");
      expect(result.year).toBe(2023);
    });

    it("does not overwrite fields not in the update", async () => {
      const book = await insertBook({
        title: "Original Title",
        author: "Original Author",
        genre: "Fiction",
        publisher: "Test Publisher",
      });

      const result = await authedCaller.metadata.applyFields({
        bookId: book.id,
        fields: {
          title: "New Title",
        },
      });

      expect(result.title).toBe("New Title");
      expect(result.author).toBe("Original Author");
      expect(result.genre).toBe("Fiction");
      expect(result.publisher).toBe("Test Publisher");
    });

    it("rejects for non-existent book", async () => {
      await expect(
        authedCaller.metadata.applyFields({
          bookId: crypto.randomUUID(),
          fields: { title: "Nope" },
        })
      ).rejects.toThrow("Book not found");
    });

    it("sets metadataSource when source provided", async () => {
      const book = await insertBook();

      const result = await authedCaller.metadata.applyFields({
        bookId: book.id,
        fields: { title: "From Google" },
        source: "google",
      });

      expect(result.metadataSource).toBe("google");
    });
  });
});
