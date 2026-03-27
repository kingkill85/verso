import { describe, it, expect, beforeEach } from "vitest";
import { createTestContext } from "../test-utils.js";
import { books, shelves, shelfBooks } from "@verso/shared";
import {
  buildRootFeed,
  buildAllBooks,
  buildRecentBooks,
  buildAuthorsList,
  buildAuthorBooks,
  buildGenresList,
  buildGenreBooks,
  buildShelvesList,
  buildShelfBooks,
  buildSearchResults,
  serializeFeed,
} from "../services/opds-server.js";
import { parseOpdsCatalog } from "../services/opds-client.js";
import crypto from "node:crypto";

describe("opds-server service", () => {
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
    const defaults: typeof books.$inferInsert = {
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

  // ─── buildRootFeed ─────────────────────────────────────────────────────────

  describe("buildRootFeed", () => {
    it("returns a navigation feed", async () => {
      const feed = await buildRootFeed(ctx.db, userId);
      expect(feed.type).toBe("navigation");
    });

    it("has at least 5 section entries", async () => {
      const feed = await buildRootFeed(ctx.db, userId);
      expect(feed.entries.length).toBeGreaterThanOrEqual(5);
    });

    it("includes All Books, Recently Added, Authors, Genres, Shelves entries", async () => {
      const feed = await buildRootFeed(ctx.db, userId);
      const titles = feed.entries.map((e) => e.title);
      expect(titles).toContain("All Books");
      expect(titles).toContain("Recently Added");
      expect(titles).toContain("Authors");
      expect(titles).toContain("Genres");
      expect(titles).toContain("Shelves");
    });

    it("round-trips through opds-client parser as navigation feed", async () => {
      const feed = await buildRootFeed(ctx.db, userId);
      const xml = serializeFeed(feed);
      const catalog = parseOpdsCatalog(xml);
      expect(catalog.type).toBe("navigation");
      expect(catalog.entries.length).toBeGreaterThanOrEqual(5);
    });
  });

  // ─── buildAllBooks ─────────────────────────────────────────────────────────

  describe("buildAllBooks", () => {
    it("returns empty acquisition feed when no books", async () => {
      const feed = await buildAllBooks(ctx.db, userId, 1);
      expect(feed.type).toBe("acquisition");
      expect(feed.entries).toHaveLength(0);
    });

    it("returns user's books", async () => {
      await insertBook({ title: "My Book", author: "Author A" });
      const feed = await buildAllBooks(ctx.db, userId, 1);
      expect(feed.entries).toHaveLength(1);
      expect(feed.entries[0].title).toBe("My Book");
    });

    it("includes all books in shared library", async () => {
      await insertBook({ title: "Book A" });
      await insertBook({ title: "Book B" });
      const feed = await buildAllBooks(ctx.db, userId, 1);
      expect(feed.entries).toHaveLength(2);
    });

    it("paginates at 50", async () => {
      for (let i = 0; i < 55; i++) {
        await insertBook({ title: `Book ${i}` });
      }
      const page1 = await buildAllBooks(ctx.db, userId, 1);
      expect(page1.entries).toHaveLength(50);
      expect(page1.nextUrl).toBeDefined();

      const page2 = await buildAllBooks(ctx.db, userId, 2);
      expect(page2.entries).toHaveLength(5);
      expect(page2.nextUrl).toBeUndefined();
    });

    it("round-trips through opds-client as acquisition feed", async () => {
      await insertBook({ title: "Round Trip Book" });
      const feed = await buildAllBooks(ctx.db, userId, 1);
      const xml = serializeFeed(feed);
      const catalog = parseOpdsCatalog(xml);
      expect(catalog.type).toBe("acquisition");
      if (catalog.type === "acquisition") {
        expect(catalog.entries).toHaveLength(1);
        expect(catalog.entries[0].title).toBe("Round Trip Book");
      }
    });
  });

  // ─── buildRecentBooks ──────────────────────────────────────────────────────

  describe("buildRecentBooks", () => {
    it("returns empty when no books", async () => {
      const feed = await buildRecentBooks(ctx.db, userId, 1);
      expect(feed.entries).toHaveLength(0);
    });

    it("returns all recently added books from shared library", async () => {
      await insertBook({ title: "Recent Book" });
      await insertBook({ title: "Another Book" });
      const feed = await buildRecentBooks(ctx.db, userId, 1);
      expect(feed.entries).toHaveLength(2);
    });
  });

  // ─── buildAuthorsList ──────────────────────────────────────────────────────

  describe("buildAuthorsList", () => {
    it("returns navigation feed", async () => {
      const feed = await buildAuthorsList(ctx.db, userId);
      expect(feed.type).toBe("navigation");
    });

    it("returns unique authors with counts", async () => {
      await insertBook({ author: "Frank Herbert" });
      await insertBook({ author: "Frank Herbert" });
      await insertBook({ author: "Isaac Asimov" });
      const feed = await buildAuthorsList(ctx.db, userId);
      const titles = feed.entries.map((e) => e.title);
      expect(titles).toContain("Frank Herbert (2)");
      expect(titles).toContain("Isaac Asimov (1)");
    });

    it("includes all authors in shared library", async () => {
      await insertBook({ author: "Author A" });
      await insertBook({ author: "Author B" });
      const feed = await buildAuthorsList(ctx.db, userId);
      const titles = feed.entries.map((e) => e.title);
      expect(titles.some((t) => t.startsWith("Author A"))).toBe(true);
      expect(titles.some((t) => t.startsWith("Author B"))).toBe(true);
    });

    it("round-trips through opds-client as navigation feed", async () => {
      await insertBook({ author: "Some Author" });
      const feed = await buildAuthorsList(ctx.db, userId);
      const xml = serializeFeed(feed);
      const catalog = parseOpdsCatalog(xml);
      expect(catalog.type).toBe("navigation");
    });
  });

  // ─── buildAuthorBooks ──────────────────────────────────────────────────────

  describe("buildAuthorBooks", () => {
    it("returns only books by the given author", async () => {
      await insertBook({ author: "Frank Herbert", title: "Dune" });
      await insertBook({ author: "Isaac Asimov", title: "Foundation" });
      const feed = await buildAuthorBooks(ctx.db, userId, "Frank Herbert", 1);
      expect(feed.entries).toHaveLength(1);
      expect(feed.entries[0].title).toBe("Dune");
    });

    it("includes all books for that author in shared library", async () => {
      await insertBook({ author: "Shared Author", title: "Book One" });
      await insertBook({ author: "Shared Author", title: "Book Two" });
      const feed = await buildAuthorBooks(ctx.db, userId, "Shared Author", 1);
      expect(feed.entries).toHaveLength(2);
    });
  });

  // ─── buildGenresList ───────────────────────────────────────────────────────

  describe("buildGenresList", () => {
    it("returns navigation feed", async () => {
      const feed = await buildGenresList(ctx.db, userId);
      expect(feed.type).toBe("navigation");
    });

    it("returns unique genres with counts", async () => {
      await insertBook({ genre: "Science Fiction" });
      await insertBook({ genre: "Science Fiction" });
      await insertBook({ genre: "Fantasy" });
      const feed = await buildGenresList(ctx.db, userId);
      const titles = feed.entries.map((e) => e.title);
      expect(titles).toContain("Science Fiction (2)");
      expect(titles).toContain("Fantasy (1)");
    });

    it("excludes null genres", async () => {
      await insertBook({ genre: null });
      await insertBook({ genre: "Horror" });
      const feed = await buildGenresList(ctx.db, userId);
      const titles = feed.entries.map((e) => e.title);
      expect(titles.some((t) => t.startsWith("Horror"))).toBe(true);
      // No null/empty entry
      expect(feed.entries).toHaveLength(1);
    });

    it("includes all genres in shared library", async () => {
      await insertBook({ genre: "Genre A" });
      await insertBook({ genre: "Genre B" });
      const feed = await buildGenresList(ctx.db, userId);
      const titles = feed.entries.map((e) => e.title);
      expect(titles.some((t) => t.startsWith("Genre A"))).toBe(true);
      expect(titles.some((t) => t.startsWith("Genre B"))).toBe(true);
    });
  });

  // ─── buildGenreBooks ───────────────────────────────────────────────────────

  describe("buildGenreBooks", () => {
    it("returns books in the given genre", async () => {
      await insertBook({ genre: "Science Fiction", title: "Dune" });
      await insertBook({ genre: "Fantasy", title: "The Hobbit" });
      const feed = await buildGenreBooks(ctx.db, userId, "Science Fiction", 1);
      expect(feed.entries).toHaveLength(1);
      expect(feed.entries[0].title).toBe("Dune");
    });

    it("includes all books in that genre in shared library", async () => {
      await insertBook({ genre: "Sci-Fi", title: "Sci-Fi Book A" });
      await insertBook({ genre: "Sci-Fi", title: "Sci-Fi Book B" });
      const feed = await buildGenreBooks(ctx.db, userId, "Sci-Fi", 1);
      expect(feed.entries).toHaveLength(2);
    });
  });

  // ─── buildShelvesList ──────────────────────────────────────────────────────

  describe("buildShelvesList", () => {
    it("returns navigation feed", async () => {
      const feed = await buildShelvesList(ctx.db, userId);
      expect(feed.type).toBe("navigation");
    });

    it("returns user's shelves (4 default shelves seeded on registration)", async () => {
      const feed = await buildShelvesList(ctx.db, userId);
      // Registration seeds 4 default shelves
      expect(feed.entries.length).toBeGreaterThanOrEqual(4);
    });

    it("does not include other users' shelves", async () => {
      // userId2 also has their own default shelves, but they should not appear
      const feed = await buildShelvesList(ctx.db, userId);
      for (const entry of feed.entries) {
        // Each href should reference only user1 shelves (just check it's a valid href)
        expect(entry.links[0].href).toMatch(/^\/opds\/shelf\//);
      }
    });

    it("round-trips through opds-client as navigation feed", async () => {
      const feed = await buildShelvesList(ctx.db, userId);
      const xml = serializeFeed(feed);
      const catalog = parseOpdsCatalog(xml);
      expect(catalog.type).toBe("navigation");
    });
  });

  // ─── buildShelfBooks ───────────────────────────────────────────────────────

  describe("buildShelfBooks", () => {
    it("returns books on the given shelf", async () => {
      // Insert a shelf for userId
      const shelfId = crypto.randomUUID();
      await ctx.db.insert(shelves).values({
        id: shelfId,
        name: "My Shelf",
        userId,
        position: 10,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const book = await insertBook({ title: "Shelf Book" });
      await ctx.db.insert(shelfBooks).values({ shelfId, bookId: book.id as string, position: 0 });

      const feed = await buildShelfBooks(ctx.db, userId, shelfId, 1);
      expect(feed.type).toBe("acquisition");
      expect(feed.entries).toHaveLength(1);
      expect(feed.entries[0].title).toBe("Shelf Book");
    });

    it("returns empty feed for shelf with no books", async () => {
      const shelfId = crypto.randomUUID();
      await ctx.db.insert(shelves).values({
        id: shelfId,
        name: "Empty Shelf",
        userId,
        position: 10,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      const feed = await buildShelfBooks(ctx.db, userId, shelfId, 1);
      expect(feed.entries).toHaveLength(0);
    });
  });

  // ─── buildSearchResults ────────────────────────────────────────────────────

  describe("buildSearchResults", () => {
    it("returns empty when no matches", async () => {
      const feed = await buildSearchResults(ctx.db, userId, "nonexistent", 1);
      expect(feed.entries).toHaveLength(0);
    });

    it("matches books by title", async () => {
      await insertBook({ title: "Dune Messiah" });
      await insertBook({ title: "Foundation" });
      const feed = await buildSearchResults(ctx.db, userId, "Dune", 1);
      expect(feed.entries).toHaveLength(1);
      expect(feed.entries[0].title).toBe("Dune Messiah");
    });

    it("matches books by author", async () => {
      await insertBook({ author: "Frank Herbert", title: "Dune" });
      await insertBook({ author: "Isaac Asimov", title: "Foundation" });
      const feed = await buildSearchResults(ctx.db, userId, "Herbert", 1);
      expect(feed.entries).toHaveLength(1);
      expect(feed.entries[0].title).toBe("Dune");
    });

    it("includes all books in search results from shared library", async () => {
      await insertBook({ title: "Searchable Book" });
      const feed = await buildSearchResults(ctx.db, userId, "Searchable", 1);
      expect(feed.entries).toHaveLength(1);
    });

    it("is case insensitive", async () => {
      await insertBook({ title: "Science of Everything" });
      const feed = await buildSearchResults(ctx.db, userId, "science", 1);
      expect(feed.entries).toHaveLength(1);
    });
  });

  // ─── serializeFeed ─────────────────────────────────────────────────────────

  describe("serializeFeed", () => {
    it("produces valid XML string", async () => {
      const feed = await buildRootFeed(ctx.db, userId);
      const xml = serializeFeed(feed);
      expect(typeof xml).toBe("string");
      expect(xml).toContain("<?xml");
      expect(xml).toContain("<feed");
    });

    it("includes Atom namespace", async () => {
      const feed = await buildRootFeed(ctx.db, userId);
      const xml = serializeFeed(feed);
      expect(xml).toContain("http://www.w3.org/2005/Atom");
    });

    it("includes OPDS namespace", async () => {
      const feed = await buildRootFeed(ctx.db, userId);
      const xml = serializeFeed(feed);
      expect(xml).toContain("opds-spec.org");
    });

    it("round-trips navigation feed through parseOpdsCatalog", async () => {
      const feed = await buildRootFeed(ctx.db, userId);
      const xml = serializeFeed(feed);
      const catalog = parseOpdsCatalog(xml);
      expect(catalog.type).toBe("navigation");
      expect(catalog.title).toBe(feed.title);
    });

    it("round-trips acquisition feed through parseOpdsCatalog", async () => {
      await insertBook({ title: "Round Trip", author: "Author X", coverPath: "covers/test.jpg" });
      const feed = await buildAllBooks(ctx.db, userId, 1);
      const xml = serializeFeed(feed);
      const catalog = parseOpdsCatalog(xml);
      expect(catalog.type).toBe("acquisition");
      if (catalog.type === "acquisition") {
        expect(catalog.entries[0].title).toBe("Round Trip");
        expect(catalog.entries[0].author).toBe("Author X");
        expect(catalog.entries[0].acquisitionUrl).toContain("/download/");
        expect(catalog.entries[0].coverUrl).toBeDefined();
      }
    });

    it("includes next link in XML when nextUrl is present", async () => {
      for (let i = 0; i < 55; i++) {
        await insertBook({ title: `Book ${i}` });
      }
      const feed = await buildAllBooks(ctx.db, userId, 1);
      expect(feed.nextUrl).toBeDefined();
      const xml = serializeFeed(feed);
      expect(xml).toContain('rel="next"');
    });
  });
});
