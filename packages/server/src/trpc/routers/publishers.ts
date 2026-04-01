import { TRPCError } from "@trpc/server";
import { eq, sql, like } from "drizzle-orm";
import { books, publishers, publisherListInput, publisherUpdateInput } from "@verso/shared";
import { router, protectedProcedure, adminProcedure } from "../index.js";

export const publishersRouter = router({
  list: protectedProcedure.input(publisherListInput).query(async ({ ctx, input }) => {
    const rows = await ctx.db
      .select({
        id: publishers.id,
        name: publishers.name,
        bookCount: sql<number>`count(${books.id})`,
      })
      .from(publishers)
      .leftJoin(books, eq(books.publisherId, publishers.id))
      .where(
        input.search
          ? like(publishers.name, `%${input.search}%`)
          : undefined
      )
      .groupBy(publishers.id)
      .orderBy(sql`count(${books.id}) DESC`, publishers.name);

    return rows;
  }),

  update: adminProcedure.input(publisherUpdateInput).mutation(async ({ ctx, input }) => {
    const publisher = await ctx.db
      .select()
      .from(publishers)
      .where(eq(publishers.id, input.id))
      .get();

    if (!publisher) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Publisher not found" });
    }

    // Check if a publisher with the new name already exists (case-insensitive)
    const existing = await ctx.db
      .select()
      .from(publishers)
      .where(sql`${publishers.name} COLLATE NOCASE = ${input.name} AND ${publishers.id} != ${input.id}`)
      .get();

    if (existing) {
      // Merge: reassign all books from this publisher to the existing one
      await ctx.db
        .update(books)
        .set({ publisherId: existing.id, publisher: existing.name })
        .where(eq(books.publisherId, input.id));

      // Delete the old publisher
      await ctx.db.delete(publishers).where(eq(publishers.id, input.id));

      return existing;
    }

    // Simple rename
    await ctx.db
      .update(publishers)
      .set({ name: input.name })
      .where(eq(publishers.id, input.id));

    // Update denormalized publisher field on all books
    await ctx.db
      .update(books)
      .set({ publisher: input.name })
      .where(eq(books.publisherId, input.id));

    return ctx.db.select().from(publishers).where(eq(publishers.id, input.id)).get()!;
  }),
});
