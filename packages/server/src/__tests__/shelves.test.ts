import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestContext } from "../test-utils.js";
import { books, shelfBooks } from "@verso/shared";

describe("shelves router", () => {
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

  describe("default shelves", () => {
    it("seeds 4 default shelves on registration", async () => {
      const list = await authedCaller.shelves.list();
      expect(list).toHaveLength(4);
      expect(list.map((s) => s.name)).toEqual([
        "Currently Reading",
        "Want to Read",
        "Favorites",
        "Recently Added",
      ]);
    });

    it("default shelves have correct positions", async () => {
      const list = await authedCaller.shelves.list();
      expect(list.map((s) => s.position)).toEqual([0, 1, 2, 3]);
    });

    it("default shelves are marked as default", async () => {
      const list = await authedCaller.shelves.list();
      expect(list.every((s) => s.isDefault)).toBe(true);
    });
  });

  describe("create", () => {
    it("creates a manual shelf", async () => {
      const shelf = await authedCaller.shelves.create({
        name: "My Shelf",
        emoji: "📚",
      });
      expect(shelf.name).toBe("My Shelf");
      expect(shelf.emoji).toBe("📚");
      expect(shelf.isSmart).toBe(false);
      expect(shelf.userId).toBe(userId);
    });

    it("creates a smart shelf with filter", async () => {
      const shelf = await authedCaller.shelves.create({
        name: "Sci-Fi",
        isSmart: true,
        smartFilter: {
          operator: "AND",
          conditions: [{ field: "genre", op: "eq", value: "Science Fiction" }],
        },
      });
      expect(shelf.isSmart).toBe(true);
      expect(shelf.smartFilter).toBeTruthy();
      const filter = JSON.parse(shelf.smartFilter!);
      expect(filter.conditions[0].field).toBe("genre");
    });

    it("auto-assigns next position", async () => {
      // 4 default shelves already exist (positions 0-3)
      const shelf = await authedCaller.shelves.create({ name: "New Shelf" });
      expect(shelf.position).toBe(4);
    });
  });

  describe("byId", () => {
    it("returns a manual shelf with its books", async () => {
      const list = await authedCaller.shelves.list();
      const manualShelf = list.find((s) => s.name === "Currently Reading")!;

      const book = await insertBook({ title: "My Book" });
      await authedCaller.shelves.addBook({
        shelfId: manualShelf.id,
        bookId: book.id,
      });

      const result = await authedCaller.shelves.byId({ id: manualShelf.id });
      expect(result.name).toBe("Currently Reading");
      expect(result.books).toHaveLength(1);
      expect(result.books[0].title).toBe("My Book");
    });

    it("returns a smart shelf with filtered books", async () => {
      await insertBook({ title: "Sci-Fi Book", genre: "Science Fiction" });
      await insertBook({ title: "Romance Book", genre: "Romance" });

      const shelf = await authedCaller.shelves.create({
        name: "Sci-Fi",
        isSmart: true,
        smartFilter: {
          operator: "AND",
          conditions: [{ field: "genre", op: "eq", value: "Science Fiction" }],
        },
      });

      const result = await authedCaller.shelves.byId({ id: shelf.id });
      expect(result.books).toHaveLength(1);
      expect(result.books[0].title).toBe("Sci-Fi Book");
    });

    it("evaluates _recentlyAdded sentinel for Recently Added shelf", async () => {
      // Insert a recent book
      await insertBook({ title: "Recent Book", createdAt: new Date().toISOString() });
      // Insert an old book
      await insertBook({
        title: "Old Book",
        createdAt: "2020-01-01T00:00:00.000Z",
      });

      const list = await authedCaller.shelves.list();
      const recentlyAdded = list.find((s) => s.name === "Recently Added")!;

      const result = await authedCaller.shelves.byId({ id: recentlyAdded.id });
      expect(result.books).toHaveLength(1);
      expect(result.books[0].title).toBe("Recent Book");
    });

    it("throws NOT_FOUND for missing shelf", async () => {
      await expect(
        authedCaller.shelves.byId({ id: crypto.randomUUID() })
      ).rejects.toThrow("Shelf not found");
    });
  });

  describe("update", () => {
    it("updates name and emoji", async () => {
      const shelf = await authedCaller.shelves.create({ name: "Old Name", emoji: "📖" });
      const updated = await authedCaller.shelves.update({
        id: shelf.id,
        name: "New Name",
        emoji: "🌟",
      });
      expect(updated.name).toBe("New Name");
      expect(updated.emoji).toBe("🌟");
    });

    it("throws NOT_FOUND for missing shelf", async () => {
      await expect(
        authedCaller.shelves.update({ id: crypto.randomUUID(), name: "X" })
      ).rejects.toThrow("Shelf not found");
    });
  });

  describe("delete", () => {
    it("deletes a shelf", async () => {
      const shelf = await authedCaller.shelves.create({ name: "To Delete" });
      const result = await authedCaller.shelves.delete({ id: shelf.id });
      expect(result.success).toBe(true);

      await expect(
        authedCaller.shelves.byId({ id: shelf.id })
      ).rejects.toThrow("Shelf not found");
    });

    it("cascade deletes shelfBooks when shelf is deleted", async () => {
      const shelf = await authedCaller.shelves.create({ name: "Shelf" });
      const book = await insertBook({ title: "Book" });
      await authedCaller.shelves.addBook({ shelfId: shelf.id, bookId: book.id });

      // Verify shelfBooks entry exists
      const before = ctx.db
        .select()
        .from(shelfBooks)
        .where(eq(shelfBooks.shelfId, shelf.id))
        .all();
      expect(before).toHaveLength(1);

      await authedCaller.shelves.delete({ id: shelf.id });

      // Verify shelfBooks entry is gone
      const after = ctx.db
        .select()
        .from(shelfBooks)
        .where(eq(shelfBooks.shelfId, shelf.id))
        .all();
      expect(after).toHaveLength(0);
    });
  });

  describe("reorder", () => {
    it("updates positions from ordered ID array", async () => {
      const list = await authedCaller.shelves.list();
      // Reverse the order
      const reversed = [...list].reverse().map((s) => s.id);
      await authedCaller.shelves.reorder({ shelfIds: reversed });

      const reordered = await authedCaller.shelves.list();
      expect(reordered[0].name).toBe("Recently Added");
      expect(reordered[0].position).toBe(0);
      expect(reordered[3].name).toBe("Currently Reading");
      expect(reordered[3].position).toBe(3);
    });
  });

  describe("addBook / removeBook", () => {
    it("adds a book to a manual shelf", async () => {
      const list = await authedCaller.shelves.list();
      const shelf = list.find((s) => s.name === "Favorites")!;
      const book = await insertBook({ title: "Fav Book" });

      const result = await authedCaller.shelves.addBook({
        shelfId: shelf.id,
        bookId: book.id,
      });
      expect(result.success).toBe(true);

      const shelfData = await authedCaller.shelves.byId({ id: shelf.id });
      expect(shelfData.books).toHaveLength(1);
      expect(shelfData.books[0].title).toBe("Fav Book");
    });

    it("removes a book from a manual shelf", async () => {
      const list = await authedCaller.shelves.list();
      const shelf = list.find((s) => s.name === "Favorites")!;
      const book = await insertBook({ title: "Fav Book" });

      await authedCaller.shelves.addBook({ shelfId: shelf.id, bookId: book.id });
      await authedCaller.shelves.removeBook({ shelfId: shelf.id, bookId: book.id });

      const shelfData = await authedCaller.shelves.byId({ id: shelf.id });
      expect(shelfData.books).toHaveLength(0);
    });

    it("rejects addBook on a smart shelf", async () => {
      const shelf = await authedCaller.shelves.create({
        name: "Smart",
        isSmart: true,
        smartFilter: {
          operator: "AND",
          conditions: [{ field: "genre", op: "eq", value: "Fiction" }],
        },
      });
      const book = await insertBook({ title: "Book" });

      await expect(
        authedCaller.shelves.addBook({ shelfId: shelf.id, bookId: book.id })
      ).rejects.toThrow("Cannot manually add books to a smart shelf");
    });
  });

  describe("user isolation", () => {
    it("other user cannot see shelves", async () => {
      // Register another user
      const reg2 = await ctx.caller.auth.register({
        email: "other@example.com",
        password: "password123",
        displayName: "Other User",
      });
      const otherCaller = ctx.createAuthedCaller(reg2.accessToken);

      // First user creates a shelf
      await authedCaller.shelves.create({ name: "Private Shelf" });

      // Other user should not see it (only their default shelves)
      const otherList = await otherCaller.shelves.list();
      expect(otherList.map((s) => s.name)).not.toContain("Private Shelf");
    });
  });
});
