import { TRPCError } from "@trpc/server";
import { eq, sql, like } from "drizzle-orm";
import { books, bookSeries, seriesListInput, seriesUpdateInput } from "@verso/shared";
import { router, protectedProcedure, adminProcedure } from "../index.js";

export const seriesRouter = router({
  list: protectedProcedure.input(seriesListInput).query(async ({ ctx, input }) => {
    const rows = await ctx.db
      .select({
        id: bookSeries.id,
        name: bookSeries.name,
        bookCount: sql<number>`count(${books.id})`,
      })
      .from(bookSeries)
      .leftJoin(books, eq(books.seriesId, bookSeries.id))
      .where(
        input.search
          ? like(bookSeries.name, `%${input.search}%`)
          : undefined
      )
      .groupBy(bookSeries.id)
      .orderBy(sql`count(${books.id}) DESC`, bookSeries.name);

    return rows;
  }),

  update: adminProcedure.input(seriesUpdateInput).mutation(async ({ ctx, input }) => {
    const series = await ctx.db
      .select()
      .from(bookSeries)
      .where(eq(bookSeries.id, input.id))
      .get();

    if (!series) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Series not found" });
    }

    const existing = await ctx.db
      .select()
      .from(bookSeries)
      .where(sql`${bookSeries.name} COLLATE NOCASE = ${input.name} AND ${bookSeries.id} != ${input.id}`)
      .get();

    if (existing) {
      await ctx.db
        .update(books)
        .set({ seriesId: existing.id, series: existing.name })
        .where(eq(books.seriesId, input.id));
      await ctx.db.delete(bookSeries).where(eq(bookSeries.id, input.id));
      return existing;
    }

    await ctx.db
      .update(bookSeries)
      .set({ name: input.name })
      .where(eq(bookSeries.id, input.id));
    await ctx.db
      .update(books)
      .set({ series: input.name })
      .where(eq(books.seriesId, input.id));

    return ctx.db.select().from(bookSeries).where(eq(bookSeries.id, input.id)).get()!;
  }),
});
