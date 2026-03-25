import { TRPCError } from "@trpc/server";
import { eq, and, asc } from "drizzle-orm";
import {
  annotations,
  books,
  annotationListInput,
  annotationCreateInput,
  annotationUpdateInput,
  annotationDeleteInput,
} from "@verso/shared";
import { router, protectedProcedure } from "../index.js";

export const annotationsRouter = router({
  list: protectedProcedure.input(annotationListInput).query(async ({ ctx, input }) => {
    return ctx.db
      .select()
      .from(annotations)
      .where(
        and(eq(annotations.bookId, input.bookId), eq(annotations.userId, ctx.user.sub)),
      )
      .orderBy(asc(annotations.cfiPosition));
  }),

  create: protectedProcedure.input(annotationCreateInput).mutation(async ({ ctx, input }) => {
    const book = await ctx.db.query.books.findFirst({
      where: and(eq(books.id, input.bookId), eq(books.addedBy, ctx.user.sub)),
    });
    if (!book) throw new TRPCError({ code: "NOT_FOUND", message: "Book not found" });

    const [created] = await ctx.db
      .insert(annotations)
      .values({
        userId: ctx.user.sub,
        ...input,
      })
      .returning();
    return created;
  }),

  update: protectedProcedure.input(annotationUpdateInput).mutation(async ({ ctx, input }) => {
    const { id, ...fields } = input;
    const existing = await ctx.db.query.annotations.findFirst({
      where: and(eq(annotations.id, id), eq(annotations.userId, ctx.user.sub)),
    });
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Annotation not found" });

    const [updated] = await ctx.db
      .update(annotations)
      .set({ ...fields, updatedAt: new Date().toISOString() })
      .where(eq(annotations.id, id))
      .returning();
    return updated;
  }),

  delete: protectedProcedure.input(annotationDeleteInput).mutation(async ({ ctx, input }) => {
    const existing = await ctx.db.query.annotations.findFirst({
      where: and(eq(annotations.id, input.id), eq(annotations.userId, ctx.user.sub)),
    });
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Annotation not found" });

    await ctx.db.delete(annotations).where(eq(annotations.id, input.id));
    return { success: true };
  }),
});
