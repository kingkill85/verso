import { TRPCError } from "@trpc/server";
import { eq, and, desc, asc, like, sql } from "drizzle-orm";
import { books, bookListInput, bookByIdInput, bookUpdateInput, bookDeleteInput } from "@verso/shared";
import { router, protectedProcedure } from "../index.js";

export const booksRouter = router({
  list: protectedProcedure.input(bookListInput).query(async ({ ctx, input }) => {
    const { sort, page, limit, search, genre, author, format } = input;
    const offset = (page - 1) * limit;

    const conditions = [eq(books.addedBy, ctx.user.sub)];
    if (search) {
      conditions.push(sql`(${books.title} LIKE ${"%" + search + "%"} OR ${books.author} LIKE ${"%" + search + "%"})`);
    }
    if (genre) conditions.push(eq(books.genre, genre));
    if (author) conditions.push(like(books.author, `%${author}%`));
    if (format) conditions.push(eq(books.fileFormat, format));

    const where = and(...conditions);

    const orderBy = {
      title: asc(books.title),
      author: asc(books.author),
      recent: desc(books.createdAt),
    }[sort || "recent"];

    const [bookList, countResult] = await Promise.all([
      ctx.db.select().from(books).where(where).orderBy(orderBy).limit(limit).offset(offset),
      ctx.db.select({ total: sql<number>`count(*)` }).from(books).where(where),
    ]);

    return { books: bookList, total: countResult[0].total, page };
  }),

  byId: protectedProcedure.input(bookByIdInput).query(async ({ ctx, input }) => {
    const book = await ctx.db.query.books.findFirst({
      where: and(eq(books.id, input.id), eq(books.addedBy, ctx.user.sub)),
    });
    if (!book) throw new TRPCError({ code: "NOT_FOUND", message: "Book not found" });
    return book;
  }),

  update: protectedProcedure.input(bookUpdateInput).mutation(async ({ ctx, input }) => {
    const { id, tags, ...fields } = input;
    const existing = await ctx.db.query.books.findFirst({
      where: and(eq(books.id, id), eq(books.addedBy, ctx.user.sub)),
    });
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Book not found" });

    const updateData: Record<string, any> = { ...fields, updatedAt: new Date().toISOString(), metadataLocked: true };
    if (tags !== undefined) updateData.tags = JSON.stringify(tags);

    const [book] = await ctx.db.update(books).set(updateData).where(eq(books.id, id)).returning();
    return book;
  }),

  delete: protectedProcedure.input(bookDeleteInput).mutation(async ({ ctx, input }) => {
    const existing = await ctx.db.query.books.findFirst({
      where: and(eq(books.id, input.id), eq(books.addedBy, ctx.user.sub)),
    });
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Book not found" });

    await ctx.db.delete(books).where(eq(books.id, input.id));
    await ctx.storage.delete(existing.filePath);
    if (existing.coverPath) await ctx.storage.delete(existing.coverPath);

    return { success: true };
  }),

  recentlyAdded: protectedProcedure
    .input(bookListInput.pick({ limit: true }))
    .query(async ({ ctx, input }) => {
      return ctx.db.select().from(books).where(eq(books.addedBy, ctx.user.sub))
        .orderBy(desc(books.createdAt)).limit(input.limit || 20);
    }),
});
