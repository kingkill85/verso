import { eq, like, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../index.js";
import {
  genres,
  bookGenres,
  genreListInput,
  genreCreateInput,
  genreUpdateInput,
  genreDeleteInput,
  genreMergeInput,
} from "@verso/shared";

function toSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export const genresRouter = router({
  list: protectedProcedure.input(genreListInput).query(async ({ ctx, input }) => {
    const conditions = input.search
      ? like(genres.name, `%${input.search}%`)
      : undefined;

    const rows = await ctx.db
      .select({
        id: genres.id,
        slug: genres.slug,
        name: genres.name,
        isDefault: genres.isDefault,
        createdBy: genres.createdBy,
        bookCount: sql<number>`(SELECT count(*) FROM book_genres WHERE book_genres.genre_id = ${genres.id})`,
      })
      .from(genres)
      .where(conditions)
      .orderBy(
        sql`(SELECT count(*) FROM book_genres WHERE book_genres.genre_id = ${genres.id}) DESC`,
        genres.name,
      );

    return rows;
  }),

  create: protectedProcedure.input(genreCreateInput).mutation(async ({ ctx, input }) => {
    const slug = toSlug(input.name);

    const existing = await ctx.db.select({ id: genres.id }).from(genres).where(eq(genres.slug, slug)).get();
    if (existing) {
      throw new TRPCError({ code: "CONFLICT", message: "A genre with this name already exists" });
    }

    const [created] = await ctx.db
      .insert(genres)
      .values({
        slug,
        name: input.name,
        isDefault: false,
        createdBy: ctx.user.sub,
      })
      .returning();

    return created;
  }),

  update: protectedProcedure.input(genreUpdateInput).mutation(async ({ ctx, input }) => {
    const genre = await ctx.db.select().from(genres).where(eq(genres.id, input.id)).get();
    if (!genre) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Genre not found" });
    }

    const newSlug = toSlug(input.name);

    if (newSlug !== genre.slug) {
      const conflict = await ctx.db.select({ id: genres.id }).from(genres).where(eq(genres.slug, newSlug)).get();
      if (conflict) {
        throw new TRPCError({ code: "CONFLICT", message: "A genre with this name already exists" });
      }
    }

    const [updated] = await ctx.db
      .update(genres)
      .set({ name: input.name, slug: newSlug })
      .where(eq(genres.id, input.id))
      .returning();

    return updated;
  }),

  delete: protectedProcedure.input(genreDeleteInput).mutation(async ({ ctx, input }) => {
    const genre = await ctx.db.select().from(genres).where(eq(genres.id, input.id)).get();
    if (!genre) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Genre not found" });
    }

    await ctx.db.delete(bookGenres).where(eq(bookGenres.genreId, input.id));
    await ctx.db.delete(genres).where(eq(genres.id, input.id));

    return { success: true };
  }),

  merge: protectedProcedure.input(genreMergeInput).mutation(async ({ ctx, input }) => {
    if (input.sourceId === input.targetId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot merge a genre into itself" });
    }

    const source = await ctx.db.select().from(genres).where(eq(genres.id, input.sourceId)).get();
    const target = await ctx.db.select().from(genres).where(eq(genres.id, input.targetId)).get();
    if (!source || !target) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Genre not found" });
    }

    // Get all books linked to source
    const sourceBooks = await ctx.db
      .select({ bookId: bookGenres.bookId })
      .from(bookGenres)
      .where(eq(bookGenres.genreId, input.sourceId));

    // Get books that already have the target genre
    const targetBooks = await ctx.db
      .select({ bookId: bookGenres.bookId })
      .from(bookGenres)
      .where(eq(bookGenres.genreId, input.targetId));
    const targetBookIds = new Set(targetBooks.map((r) => r.bookId));

    // Move books that don't already have the target genre
    for (const { bookId } of sourceBooks) {
      if (!targetBookIds.has(bookId)) {
        await ctx.db
          .insert(bookGenres)
          .values({ bookId, genreId: input.targetId });
      }
    }

    // Delete source genre and its associations
    await ctx.db.delete(bookGenres).where(eq(bookGenres.genreId, input.sourceId));
    await ctx.db.delete(genres).where(eq(genres.id, input.sourceId));

    return { success: true };
  }),
});
