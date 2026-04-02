import { TRPCError } from "@trpc/server";
import { eq, sql, desc, like, and } from "drizzle-orm";
import {
  authors,
  bookAuthors,
  books,
  authorDescriptions,
  authorListInput,
  authorByIdInput,
  authorRefreshInput,
  authorUpdateInput,
  authorUpdateDescriptionInput,
} from "@verso/shared";
import { router, protectedProcedure, adminProcedure } from "../index.js";
import { enrichAuthorV2 } from "../../services/enrich-author-v2.js";

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

    // Fetch localized descriptions
    const descriptions = ctx.db
      .select({
        locale: authorDescriptions.locale,
        description: authorDescriptions.description,
        manuallyEdited: authorDescriptions.manuallyEdited,
      })
      .from(authorDescriptions)
      .where(eq(authorDescriptions.authorId, input.id))
      .all();

    // If no descriptions yet, try enriching in background
    if (descriptions.length === 0 && !author.openLibraryKey) {
      enrichAuthorV2(ctx.db, author.id, author.name, ctx.storage).catch(() => {});
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

    return { ...author, descriptions, books: authorBooks };
  }),

  update: adminProcedure.input(authorUpdateInput).mutation(async ({ ctx, input }) => {
    const author = await ctx.db.select().from(authors).where(eq(authors.id, input.id)).get();

    if (!author) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Author not found" });
    }

    const updates: Record<string, any> = { updatedAt: new Date().toISOString() };
    if (input.name) updates.name = input.name;

    await ctx.db.update(authors).set(updates).where(eq(authors.id, input.id));

    return ctx.db.select().from(authors).where(eq(authors.id, input.id)).get()!;
  }),

  updateDescription: adminProcedure.input(authorUpdateDescriptionInput).mutation(async ({ ctx, input }) => {
    const author = await ctx.db.select().from(authors).where(eq(authors.id, input.authorId)).get();

    if (!author) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Author not found" });
    }

    const existing = ctx.db
      .select()
      .from(authorDescriptions)
      .where(
        and(
          eq(authorDescriptions.authorId, input.authorId),
          eq(authorDescriptions.locale, input.locale),
        )
      )
      .get();

    if (!input.description.trim()) {
      // Empty description — delete the row
      if (existing) {
        ctx.db
          .delete(authorDescriptions)
          .where(
            and(
              eq(authorDescriptions.authorId, input.authorId),
              eq(authorDescriptions.locale, input.locale),
            )
          )
          .run();
      }
    } else if (existing) {
      ctx.db
        .update(authorDescriptions)
        .set({ description: input.description, manuallyEdited: true })
        .where(
          and(
            eq(authorDescriptions.authorId, input.authorId),
            eq(authorDescriptions.locale, input.locale),
          )
        )
        .run();
    } else {
      ctx.db
        .insert(authorDescriptions)
        .values({
          authorId: input.authorId,
          locale: input.locale,
          description: input.description,
          manuallyEdited: true,
        })
        .run();
    }

    return { success: true };
  }),

  refreshMetadata: adminProcedure.input(authorRefreshInput).mutation(async ({ ctx, input }) => {
    const author = await ctx.db.select().from(authors).where(eq(authors.id, input.id)).get();

    if (!author) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Author not found" });
    }

    await enrichAuthorV2(ctx.db, author.id, author.name, ctx.storage);

    const updated = await ctx.db.select().from(authors).where(eq(authors.id, input.id)).get();

    return updated!;
  }),
});
