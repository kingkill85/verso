import { describe, it, expect, beforeEach } from "vitest";
import { createTestContext } from "../test-utils.js";
import { books, authors, bookAuthors, authorDescriptions } from "@verso/shared";
import { eq } from "drizzle-orm";

describe("authors router", () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;
  let authedCaller: ReturnType<typeof ctx.createAuthedCaller>;
  let adminCaller: ReturnType<typeof ctx.createAuthedCaller>;
  let userId: string;

  beforeEach(async () => {
    ctx = await createTestContext();
    // First user is admin
    const reg = await ctx.caller.auth.register({
      email: "admin@example.com",
      password: "password123",
      displayName: "Admin User",
    });
    adminCaller = ctx.createAuthedCaller(reg.accessToken);
    userId = reg.user.id;

    // Second user is regular
    await adminCaller.admin.createUser({
      email: "user@example.com",
      password: "password123",
      displayName: "Regular User",
      role: "user",
    });
    const login = await ctx.caller.auth.login({
      email: "user@example.com",
      password: "password123",
    });
    authedCaller = ctx.createAuthedCaller(login.accessToken);
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
    it("returns author with books and descriptions", async () => {
      const author = await insertAuthorWithBooks("Frank Herbert", 2);
      await ctx.db.insert(authorDescriptions).values([
        { authorId: author.id, locale: "en", description: "English bio" },
        { authorId: author.id, locale: "de", description: "German bio" },
      ]);

      const result = await authedCaller.authors.byId({ id: author.id });
      expect(result.name).toBe("Frank Herbert");
      expect(result.books).toHaveLength(2);
      expect(result.descriptions).toHaveLength(2);
      expect(result.descriptions.find((d: any) => d.locale === "en")?.description).toBe("English bio");
    });

    it("throws NOT_FOUND for missing author", async () => {
      await expect(
        authedCaller.authors.byId({ id: crypto.randomUUID() })
      ).rejects.toThrow("Author not found");
    });
  });

  describe("update (admin only)", () => {
    it("updates author name", async () => {
      const author = await insertAuthorWithBooks("Old Name", 1);
      await adminCaller.authors.update({ id: author.id, name: "New Name" });

      const updated = ctx.db.select().from(authors).where(eq(authors.id, author.id)).get();
      expect(updated?.name).toBe("New Name");
    });

    it("rejects non-admin users", async () => {
      const author = await insertAuthorWithBooks("Test", 1);
      await expect(
        authedCaller.authors.update({ id: author.id, name: "Nope" })
      ).rejects.toThrow("Admin access required");
    });
  });

  describe("updateDescription (admin only)", () => {
    it("creates a new description with manuallyEdited=true", async () => {
      const author = await insertAuthorWithBooks("Test Author", 1);
      await adminCaller.authors.updateDescription({
        authorId: author.id,
        locale: "de",
        description: "German bio written by admin",
      });

      const desc = ctx.db
        .select()
        .from(authorDescriptions)
        .where(eq(authorDescriptions.authorId, author.id))
        .all();
      expect(desc).toHaveLength(1);
      expect(desc[0].locale).toBe("de");
      expect(desc[0].description).toBe("German bio written by admin");
      expect(desc[0].manuallyEdited).toBe(true);
    });

    it("updates existing description and sets manuallyEdited=true", async () => {
      const author = await insertAuthorWithBooks("Test Author", 1);
      await ctx.db.insert(authorDescriptions).values({
        authorId: author.id,
        locale: "en",
        description: "Auto bio",
        manuallyEdited: false,
      });

      await adminCaller.authors.updateDescription({
        authorId: author.id,
        locale: "en",
        description: "Admin bio",
      });

      const desc = ctx.db
        .select()
        .from(authorDescriptions)
        .where(eq(authorDescriptions.authorId, author.id))
        .all();
      expect(desc[0].description).toBe("Admin bio");
      expect(desc[0].manuallyEdited).toBe(true);
    });

    it("rejects non-admin users", async () => {
      const author = await insertAuthorWithBooks("Test", 1);
      await expect(
        authedCaller.authors.updateDescription({
          authorId: author.id,
          locale: "en",
          description: "Nope",
        })
      ).rejects.toThrow("Admin access required");
    });
  });
});
