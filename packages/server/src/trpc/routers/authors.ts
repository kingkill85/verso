import { TRPCError } from "@trpc/server";
import { eq, sql, desc, like } from "drizzle-orm";
import {
  authors,
  bookAuthors,
  books,
  authorListInput,
  authorByIdInput,
  authorRefreshInput,
} from "@verso/shared";
import { router, protectedProcedure } from "../index.js";
import { enrichAuthor } from "../../services/enrich-author.js";

export const authorsRouter = router({
  list: protectedProcedure.input(authorListInput).query(async ({ ctx, input }) => {
    const rows = await ctx.db
      .select({
        id: authors.id,
        name: authors.name,
        imagePath: authors.imagePath,
        bookCount: sql<number>`count(${bookAuthors.bookId})`,
      })
      .from(authors)
      .innerJoin(bookAuthors, eq(bookAuthors.authorId, authors.id))
      .where(
        input.search
          ? like(authors.name, `%${input.search}%`)
          : undefined
      )
      .groupBy(authors.id)
      .orderBy(desc(sql`count(${bookAuthors.bookId})`), authors.name);

    return rows;
  }),

  byId: protectedProcedure.input(authorByIdInput).query(async ({ ctx, input }) => {
    const author = await ctx.db.select().from(authors).where(eq(authors.id, input.id)).get();

    if (!author) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Author not found" });
    }

    // If no metadata yet, try enriching in background
    if (!author.description && !author.openLibraryKey) {
      enrichAuthor(ctx.db, author.id, author.name, ctx.storage).catch(() => {});
    }

    const authorBooks = await ctx.db
      .select({
        id: books.id,
        title: books.title,
        author: books.author,
        coverPath: books.coverPath,
        year: books.year,
        fileFormat: books.fileFormat,
      })
      .from(bookAuthors)
      .innerJoin(books, eq(books.id, bookAuthors.bookId))
      .where(eq(bookAuthors.authorId, input.id))
      .orderBy(books.year, books.title);

    return { ...author, books: authorBooks };
  }),

  refreshMetadata: protectedProcedure.input(authorRefreshInput).mutation(async ({ ctx, input }) => {
    const author = await ctx.db.select().from(authors).where(eq(authors.id, input.id)).get();

    if (!author) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Author not found" });
    }

    await enrichAuthor(ctx.db, author.id, author.name, ctx.storage);

    const updated = await ctx.db.select().from(authors).where(eq(authors.id, input.id)).get();

    return updated!;
  }),
});
