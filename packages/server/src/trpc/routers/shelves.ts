import { TRPCError } from "@trpc/server";
import { eq, and, sql, desc } from "drizzle-orm";
import { isNotNull, isNull } from "drizzle-orm";
import {
  shelves,
  shelfBooks,
  books,
  readingProgress,
  shelfCreateInput,
  shelfUpdateInput,
  shelfByIdInput,
  shelfReorderInput,
  shelfBookInput,
} from "@verso/shared";
import type { SmartFilter } from "@verso/shared";
import { router, protectedProcedure } from "../index.js";
import { buildFilterConditions } from "./build-filter.js";

export const shelvesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const userShelves = await ctx.db
      .select()
      .from(shelves)
      .where(eq(shelves.userId, ctx.user.sub))
      .orderBy(shelves.position);

    // Add book counts for manual shelves
    const result = await Promise.all(
      userShelves.map(async (shelf) => {
        if (shelf.isSmart) {
          return { ...shelf, bookCount: 0 };
        }
        const countResult = ctx.db
          .select({ count: sql<number>`count(*)` })
          .from(shelfBooks)
          .where(eq(shelfBooks.shelfId, shelf.id))
          .get();
        return { ...shelf, bookCount: countResult?.count ?? 0 };
      })
    );

    return result;
  }),

  byId: protectedProcedure.input(shelfByIdInput).query(async ({ ctx, input }) => {
    const shelf = await ctx.db.query.shelves.findFirst({
      where: and(eq(shelves.id, input.id), eq(shelves.userId, ctx.user.sub)),
    });

    if (!shelf) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Shelf not found" });
    }

    if (shelf.isSmart) {
      // Smart shelf: evaluate filter
      const filter = JSON.parse(shelf.smartFilter!) as SmartFilter;

      // Check for special sentinels
      const hasCurrentlyReading = filter.conditions.some(
        (c: any) => c.field === "_currentlyReading"
      );
      const hasRecentlyAdded = filter.conditions.some(
        (c: any) => c.field === "_recentlyAdded"
      );

      let shelfBooks;
      if (hasCurrentlyReading) {
        // Books with active reading progress (started but not finished)
        shelfBooks = await ctx.db
          .select({
            id: books.id,
            title: books.title,
            author: books.author,
            isbn: books.isbn,
            publisher: books.publisher,
            year: books.year,
            language: books.language,
            description: books.description,
            genre: books.genre,
            tags: books.tags,
            coverPath: books.coverPath,
            filePath: books.filePath,
            fileFormat: books.fileFormat,
            fileSize: books.fileSize,
            fileHash: books.fileHash,
            pageCount: books.pageCount,
            addedBy: books.addedBy,
            metadataSource: books.metadataSource,
            metadataLocked: books.metadataLocked,
            createdAt: books.createdAt,
            updatedAt: books.updatedAt,
          })
          .from(readingProgress)
          .innerJoin(books, eq(books.id, readingProgress.bookId))
          .where(
            and(
              eq(readingProgress.userId, ctx.user.sub),
              isNotNull(readingProgress.startedAt),
              isNull(readingProgress.finishedAt),
            )
          )
          .orderBy(desc(readingProgress.lastReadAt));
      } else if (hasRecentlyAdded) {
        const days = filter.conditions.find(
          (c: any) => c.field === "_recentlyAdded"
        )!.value;
        shelfBooks = await ctx.db
          .select()
          .from(books)
          .where(
            and(
              eq(books.addedBy, ctx.user.sub),
              sql`${books.createdAt} >= datetime('now', ${`-${days} days`})`
            )
          )
          .orderBy(desc(books.createdAt));
      } else {
        const filterCondition = buildFilterConditions(filter);
        shelfBooks = await ctx.db
          .select()
          .from(books)
          .where(and(eq(books.addedBy, ctx.user.sub), filterCondition))
          .orderBy(desc(books.createdAt));
      }

      return { ...shelf, books: shelfBooks };
    } else {
      // Manual shelf: join through shelfBooks
      const rows = await ctx.db
        .select({
          id: books.id,
          title: books.title,
          author: books.author,
          isbn: books.isbn,
          publisher: books.publisher,
          year: books.year,
          language: books.language,
          description: books.description,
          genre: books.genre,
          tags: books.tags,
          coverPath: books.coverPath,
          filePath: books.filePath,
          fileFormat: books.fileFormat,
          fileSize: books.fileSize,
          fileHash: books.fileHash,
          pageCount: books.pageCount,
          addedBy: books.addedBy,
          metadataSource: books.metadataSource,
          metadataLocked: books.metadataLocked,
          createdAt: books.createdAt,
          updatedAt: books.updatedAt,
        })
        .from(shelfBooks)
        .innerJoin(books, eq(books.id, shelfBooks.bookId))
        .where(eq(shelfBooks.shelfId, shelf.id))
        .orderBy(shelfBooks.position);

      return { ...shelf, books: rows };
    }
  }),

  create: protectedProcedure.input(shelfCreateInput).mutation(async ({ ctx, input }) => {
    // Get next position
    const maxPos = ctx.db
      .select({ max: sql<number>`coalesce(max(${shelves.position}), -1)` })
      .from(shelves)
      .where(eq(shelves.userId, ctx.user.sub))
      .get();

    const position = (maxPos?.max ?? -1) + 1;

    const [created] = await ctx.db
      .insert(shelves)
      .values({
        name: input.name,
        emoji: input.emoji,
        description: input.description,
        isSmart: input.isSmart,
        smartFilter: input.smartFilter ? JSON.stringify(input.smartFilter) : null,
        userId: ctx.user.sub,
        position,
      })
      .returning();

    return created;
  }),

  update: protectedProcedure.input(shelfUpdateInput).mutation(async ({ ctx, input }) => {
    const existing = await ctx.db.query.shelves.findFirst({
      where: and(eq(shelves.id, input.id), eq(shelves.userId, ctx.user.sub)),
    });

    if (!existing) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Shelf not found" });
    }

    const updateData: Record<string, any> = {
      updatedAt: new Date().toISOString(),
    };
    if (input.name !== undefined) updateData.name = input.name;
    if (input.emoji !== undefined) updateData.emoji = input.emoji;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.smartFilter !== undefined) updateData.smartFilter = JSON.stringify(input.smartFilter);

    const [updated] = await ctx.db
      .update(shelves)
      .set(updateData)
      .where(eq(shelves.id, input.id))
      .returning();

    return updated;
  }),

  delete: protectedProcedure.input(shelfByIdInput).mutation(async ({ ctx, input }) => {
    const existing = await ctx.db.query.shelves.findFirst({
      where: and(eq(shelves.id, input.id), eq(shelves.userId, ctx.user.sub)),
    });

    if (!existing) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Shelf not found" });
    }

    await ctx.db.delete(shelves).where(eq(shelves.id, input.id));
    return { success: true };
  }),

  reorder: protectedProcedure.input(shelfReorderInput).mutation(async ({ ctx, input }) => {
    for (let i = 0; i < input.shelfIds.length; i++) {
      await ctx.db
        .update(shelves)
        .set({ position: i, updatedAt: new Date().toISOString() })
        .where(and(eq(shelves.id, input.shelfIds[i]), eq(shelves.userId, ctx.user.sub)));
    }
    return { success: true };
  }),

  addBook: protectedProcedure.input(shelfBookInput).mutation(async ({ ctx, input }) => {
    const shelf = await ctx.db.query.shelves.findFirst({
      where: and(eq(shelves.id, input.shelfId), eq(shelves.userId, ctx.user.sub)),
    });

    if (!shelf) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Shelf not found" });
    }

    if (shelf.isSmart) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Cannot manually add books to a smart shelf",
      });
    }

    // Get next position
    const maxPos = ctx.db
      .select({ max: sql<number>`coalesce(max(${shelfBooks.position}), -1)` })
      .from(shelfBooks)
      .where(eq(shelfBooks.shelfId, input.shelfId))
      .get();

    const position = (maxPos?.max ?? -1) + 1;

    await ctx.db.insert(shelfBooks).values({
      shelfId: input.shelfId,
      bookId: input.bookId,
      position,
    });

    return { success: true };
  }),

  removeBook: protectedProcedure.input(shelfBookInput).mutation(async ({ ctx, input }) => {
    const shelf = await ctx.db.query.shelves.findFirst({
      where: and(eq(shelves.id, input.shelfId), eq(shelves.userId, ctx.user.sub)),
    });

    if (!shelf) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Shelf not found" });
    }

    await ctx.db
      .delete(shelfBooks)
      .where(
        and(eq(shelfBooks.shelfId, input.shelfId), eq(shelfBooks.bookId, input.bookId))
      );

    return { success: true };
  }),
});
