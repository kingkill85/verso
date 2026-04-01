import { describe, it, expect, beforeEach } from "vitest";
import { createTestContext } from "../test-utils.js";
import { books, publishers } from "@verso/shared";
import { eq } from "drizzle-orm";
import { syncBookPublisher } from "../services/sync-book-publisher.js";

describe("publishers router", () => {
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
    it("returns publishers with book counts", async () => {
      const book1 = await insertBook({ title: "Book 1", publisher: "Penguin" });
      const book2 = await insertBook({ title: "Book 2", publisher: "Penguin" });
      const book3 = await insertBook({ title: "Book 3", publisher: "HarperCollins" });
      await syncBookPublisher(ctx.db, book1.id, "Penguin");
      await syncBookPublisher(ctx.db, book2.id, "Penguin");
      await syncBookPublisher(ctx.db, book3.id, "HarperCollins");

      const result = await authedCaller.publishers.list({});
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("Penguin");
      expect(result[0].bookCount).toBe(2);
      expect(result[1].name).toBe("HarperCollins");
      expect(result[1].bookCount).toBe(1);
    });

    it("filters by search string", async () => {
      const book1 = await insertBook({ title: "Book 1", publisher: "Penguin" });
      const book2 = await insertBook({ title: "Book 2", publisher: "HarperCollins" });
      await syncBookPublisher(ctx.db, book1.id, "Penguin");
      await syncBookPublisher(ctx.db, book2.id, "HarperCollins");

      const result = await authedCaller.publishers.list({ search: "pen" });
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Penguin");
    });
  });

  describe("update", () => {
    it("renames a publisher", async () => {
      const book = await insertBook({ publisher: "Penguin" });
      await syncBookPublisher(ctx.db, book.id, "Penguin");

      const pubList = await authedCaller.publishers.list({});
      const pub = pubList[0];

      const updated = await adminCaller.publishers.update({ id: pub.id, name: "Penguin Random House" });
      expect(updated.name).toBe("Penguin Random House");

      // Book's denormalized publisher field should also update
      const [updatedBook] = await ctx.db.select().from(books).where(eq(books.id, book.id));
      expect(updatedBook.publisher).toBe("Penguin Random House");
    });

    it("auto-merges when renamed to match existing publisher", async () => {
      const book1 = await insertBook({ title: "Book 1", publisher: "Penguin" });
      const book2 = await insertBook({ title: "Book 2", publisher: "Penguin Books" });
      await syncBookPublisher(ctx.db, book1.id, "Penguin");
      await syncBookPublisher(ctx.db, book2.id, "Penguin Books");

      const pubList = await authedCaller.publishers.list({});
      const penguinPub = pubList.find((p) => p.name === "Penguin")!;
      const penguinBooksPub = pubList.find((p) => p.name === "Penguin Books")!;

      // Rename "Penguin" to "Penguin Books" — should merge into existing
      await adminCaller.publishers.update({ id: penguinPub.id, name: "Penguin Books" });

      const afterList = await authedCaller.publishers.list({});
      expect(afterList).toHaveLength(1);
      expect(afterList[0].name).toBe("Penguin Books");
      expect(afterList[0].bookCount).toBe(2);

      // Both books should point to the surviving publisher
      const [b1] = await ctx.db.select().from(books).where(eq(books.id, book1.id));
      const [b2] = await ctx.db.select().from(books).where(eq(books.id, book2.id));
      expect(b1.publisherId).toBe(penguinBooksPub.id);
      expect(b2.publisherId).toBe(penguinBooksPub.id);
      expect(b1.publisher).toBe("Penguin Books");
    });
  });
});
