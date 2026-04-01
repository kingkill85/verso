import { describe, it, expect, beforeEach } from "vitest";
import { createTestContext } from "../test-utils.js";
import { books, bookSeries } from "@verso/shared";
import { eq } from "drizzle-orm";
import { syncBookSeries } from "../services/sync-book-series.js";

describe("series router", () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;
  let userId: string;
  let adminCaller: ReturnType<typeof ctx.createAuthedCaller>;

  beforeEach(async () => {
    ctx = await createTestContext();
    const reg = await ctx.caller.auth.register({
      email: "test@example.com",
      password: "password123",
      displayName: "Test User",
    });
    userId = reg.user.id;
    adminCaller = ctx.createAuthedCaller(reg.accessToken);
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

  describe("list", () => {
    it("returns series with book counts", async () => {
      const book1 = await insertBook({ title: "Dune", series: "Dune Chronicles" });
      const book2 = await insertBook({ title: "Dune Messiah", series: "Dune Chronicles" });
      const book3 = await insertBook({ title: "Foundation", series: "Foundation" });
      await syncBookSeries(ctx.db, book1.id, "Dune Chronicles");
      await syncBookSeries(ctx.db, book2.id, "Dune Chronicles");
      await syncBookSeries(ctx.db, book3.id, "Foundation");

      const result = await adminCaller.series.list({});
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("Dune Chronicles");
      expect(result[0].bookCount).toBe(2);
      expect(result[1].name).toBe("Foundation");
      expect(result[1].bookCount).toBe(1);
    });

    it("filters by search string", async () => {
      const book1 = await insertBook({ title: "Dune", series: "Dune Chronicles" });
      const book2 = await insertBook({ title: "Foundation", series: "Foundation" });
      await syncBookSeries(ctx.db, book1.id, "Dune Chronicles");
      await syncBookSeries(ctx.db, book2.id, "Foundation");

      const result = await adminCaller.series.list({ search: "dune" });
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Dune Chronicles");
    });
  });

  describe("update", () => {
    it("renames a series", async () => {
      const book = await insertBook({ series: "Dune" });
      await syncBookSeries(ctx.db, book.id, "Dune");

      const seriesList = await adminCaller.series.list({});
      const s = seriesList[0];
      const updated = await adminCaller.series.update({ id: s.id, name: "Dune Chronicles" });
      expect(updated.name).toBe("Dune Chronicles");

      const [updatedBook] = await ctx.db.select().from(books).where(eq(books.id, book.id));
      expect(updatedBook.series).toBe("Dune Chronicles");
    });

    it("auto-merges when renamed to match existing series", async () => {
      const book1 = await insertBook({ title: "Dune", series: "Dune" });
      const book2 = await insertBook({ title: "Dune Messiah", series: "Dune Chronicles" });
      await syncBookSeries(ctx.db, book1.id, "Dune");
      await syncBookSeries(ctx.db, book2.id, "Dune Chronicles");

      const seriesList = await adminCaller.series.list({});
      const duneSeries = seriesList.find((s) => s.name === "Dune")!;
      const duneChroniclesSeries = seriesList.find((s) => s.name === "Dune Chronicles")!;

      await adminCaller.series.update({ id: duneSeries.id, name: "Dune Chronicles" });

      const afterList = await adminCaller.series.list({});
      expect(afterList).toHaveLength(1);
      expect(afterList[0].name).toBe("Dune Chronicles");
      expect(afterList[0].bookCount).toBe(2);

      const [b1] = await ctx.db.select().from(books).where(eq(books.id, book1.id));
      const [b2] = await ctx.db.select().from(books).where(eq(books.id, book2.id));
      expect(b1.seriesId).toBe(duneChroniclesSeries.id);
      expect(b2.seriesId).toBe(duneChroniclesSeries.id);
      expect(b1.series).toBe("Dune Chronicles");
    });
  });
});
