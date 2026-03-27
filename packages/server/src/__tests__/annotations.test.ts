import { describe, it, expect, beforeEach } from "vitest";
import { createTestContext } from "../test-utils.js";
import { books } from "@verso/shared";

describe("annotations router", () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;
  let authedCaller: ReturnType<typeof ctx.createAuthedCaller>;
  let userId: string;
  let bookId: string;

  beforeEach(async () => {
    ctx = await createTestContext();
    const reg = await ctx.caller.auth.register({
      email: "test@example.com",
      password: "password123",
      displayName: "Test User",
    });
    authedCaller = ctx.createAuthedCaller(reg.accessToken);
    userId = reg.user.id;

    bookId = crypto.randomUUID();
    await ctx.db.insert(books).values({
      id: bookId,
      title: "Test Book",
      author: "Test Author",
      filePath: `books/${bookId}.epub`,
      fileFormat: "epub",
      fileSize: 1024,
      addedBy: userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  describe("create", () => {
    it("creates a highlight annotation", async () => {
      const result = await authedCaller.annotations.create({
        bookId,
        cfiPosition: "epubcfi(/6/4!/4/2/1:0)",
        content: "highlighted text",
      });
      expect(result.id).toBeDefined();
      expect(result.bookId).toBe(bookId);
      expect(result.userId).toBe(userId);
      expect(result.type).toBe("highlight");
      expect(result.color).toBe("yellow");
      expect(result.content).toBe("highlighted text");
      expect(result.cfiPosition).toBe("epubcfi(/6/4!/4/2/1:0)");
    });

    it("creates an annotation with a note", async () => {
      const result = await authedCaller.annotations.create({
        bookId,
        cfiPosition: "epubcfi(/6/4!/4/2/1:0)",
        content: "some text",
        note: "My thoughts on this passage",
        color: "blue",
        chapter: "Chapter 1",
      });
      expect(result.note).toBe("My thoughts on this passage");
      expect(result.color).toBe("blue");
      expect(result.chapter).toBe("Chapter 1");
    });

    it("throws NOT_FOUND for a non-existent book", async () => {
      await expect(
        authedCaller.annotations.create({
          bookId: crypto.randomUUID(),
          cfiPosition: "epubcfi(/6/4!/4/2/1:0)",
        }),
      ).rejects.toThrow("Book not found");
    });
  });

  describe("list", () => {
    it("returns empty array when no annotations exist", async () => {
      const result = await authedCaller.annotations.list({ bookId });
      expect(result).toEqual([]);
    });

    it("returns annotations ordered by cfiPosition", async () => {
      await authedCaller.annotations.create({
        bookId,
        cfiPosition: "epubcfi(/6/8!/4/2/1:0)",
        content: "second",
      });
      await authedCaller.annotations.create({
        bookId,
        cfiPosition: "epubcfi(/6/4!/4/2/1:0)",
        content: "first",
      });

      const result = await authedCaller.annotations.list({ bookId });
      expect(result).toHaveLength(2);
      expect(result[0].content).toBe("first");
      expect(result[1].content).toBe("second");
    });
  });

  describe("update", () => {
    it("updates the note on an annotation", async () => {
      const created = await authedCaller.annotations.create({
        bookId,
        cfiPosition: "epubcfi(/6/4!/4/2/1:0)",
      });

      const updated = await authedCaller.annotations.update({
        id: created.id,
        note: "Added a note",
      });
      expect(updated.note).toBe("Added a note");
      expect(updated.id).toBe(created.id);
    });

    it("updates the color on an annotation", async () => {
      const created = await authedCaller.annotations.create({
        bookId,
        cfiPosition: "epubcfi(/6/4!/4/2/1:0)",
        color: "yellow",
      });

      const updated = await authedCaller.annotations.update({
        id: created.id,
        color: "pink",
      });
      expect(updated.color).toBe("pink");
    });

    it("throws NOT_FOUND for a non-existent annotation", async () => {
      await expect(
        authedCaller.annotations.update({
          id: crypto.randomUUID(),
          note: "nope",
        }),
      ).rejects.toThrow("Annotation not found");
    });
  });

  describe("delete", () => {
    it("deletes an annotation", async () => {
      const created = await authedCaller.annotations.create({
        bookId,
        cfiPosition: "epubcfi(/6/4!/4/2/1:0)",
      });

      const result = await authedCaller.annotations.delete({ id: created.id });
      expect(result).toEqual({ success: true });

      const remaining = await authedCaller.annotations.list({ bookId });
      expect(remaining).toHaveLength(0);
    });

    it("throws NOT_FOUND for a non-existent annotation", async () => {
      await expect(
        authedCaller.annotations.delete({ id: crypto.randomUUID() }),
      ).rejects.toThrow("Annotation not found");
    });
  });
});
