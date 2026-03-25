import { TRPCError } from "@trpc/server";
import { eq, and, desc, asc, sql, isNull, isNotNull } from "drizzle-orm";
import { books, readingProgress, bookListInput, bookByIdInput, bookUpdateInput, bookDeleteInput, searchInput } from "@verso/shared";
import { router, protectedProcedure } from "../index.js";
import { updateEpubMetadata, getEpubFileHash } from "../../services/epub-writer.js";
import sharp from "sharp";

const timestamp = () => ({ updatedAt: new Date().toISOString() });

function escapeLike(str: string): string {
  return str.replace(/[%_\\]/g, (ch) => `\\${ch}`);
}

/** Escape a user query for FTS5 MATCH — wraps each token in double quotes. */
function escapeFts5(query: string): string {
  return query
    .split(/\s+/)
    .filter(Boolean)
    .map((tok) => `"${tok.replace(/"/g, '""')}"`)
    .join(" ");
}

export const booksRouter = router({
  list: protectedProcedure.input(bookListInput).query(async ({ ctx, input }) => {
    const { sort, page, limit, search, genre, author, format } = input;
    const offset = (page - 1) * limit;

    const conditions = [eq(books.addedBy, ctx.user.sub)];
    if (search) {
      const term = "%" + escapeLike(search) + "%";
      conditions.push(sql`(${books.title} LIKE ${term} ESCAPE '\\' OR ${books.author} LIKE ${term} ESCAPE '\\')`);
    }
    if (genre) conditions.push(eq(books.genre, genre));
    if (author) conditions.push(sql`${books.author} LIKE ${"%" + escapeLike(author) + "%"} ESCAPE '\\'`);
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
    const { id, tags, coverUrl, ...fields } = input;
    const existing = await ctx.db.query.books.findFirst({
      where: and(eq(books.id, id), eq(books.addedBy, ctx.user.sub)),
    });
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Book not found" });

    const updateData: Record<string, any> = { ...fields, ...timestamp(), metadataLocked: true };
    if (tags !== undefined) updateData.tags = JSON.stringify(tags);

    // Handle cover URL — fetch and store
    if (coverUrl) {
      try {
        const response = await fetch(coverUrl);
        if (response.ok) {
          const buffer = Buffer.from(await response.arrayBuffer());
          const processed = await sharp(buffer)
            .resize(600, undefined, { withoutEnlargement: true })
            .jpeg({ quality: 85 })
            .toBuffer();
          const coverPath = `covers/${id}.jpg`;
          await ctx.storage.put(coverPath, processed);
          updateData.coverPath = coverPath;
        }
      } catch (err) {
        console.error("Cover fetch failed:", err);
      }
    }

    const [book] = await ctx.db.update(books).set(updateData).where(eq(books.id, id)).returning();

    // EPUB write-back (non-fatal)
    if (existing.fileFormat === "epub") {
      try {
        const filePath = ctx.storage.fullPath(existing.filePath);
        const { coverUrl: _, tags: __, ...metaFields } = input;
        await updateEpubMetadata(filePath, metaFields, existing.fileHash ?? undefined);
        const newHash = await getEpubFileHash(filePath);
        await ctx.db.update(books).set({ fileHash: newHash }).where(eq(books.id, id));
      } catch (err) {
        console.error("EPUB write-back failed:", err);
      }
    }

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
    await ctx.storage.removeDir(`books/${input.id}`);

    return { success: true };
  }),

  recentlyAdded: protectedProcedure
    .input(bookListInput.pick({ limit: true }))
    .query(async ({ ctx, input }) => {
      return ctx.db.select().from(books).where(eq(books.addedBy, ctx.user.sub))
        .orderBy(desc(books.createdAt)).limit(input.limit || 20);
    }),

  currentlyReading: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        id: books.id,
        title: books.title,
        author: books.author,
        coverPath: books.coverPath,
        fileFormat: books.fileFormat,
        fileSize: books.fileSize,
        pageCount: books.pageCount,
        percentage: readingProgress.percentage,
        cfiPosition: readingProgress.cfiPosition,
        lastReadAt: readingProgress.lastReadAt,
        startedAt: readingProgress.startedAt,
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
    return rows;
  }),

  search: protectedProcedure.input(searchInput).query(async ({ ctx, input }) => {
    const { query, genre, author, format, page = 1, limit = 50 } = input;
    const offset = (page - 1) * limit;

    // Build dynamic WHERE conditions using Drizzle sql template chunks
    const conditions = [
      sql`books_fts MATCH ${escapeFts5(query)}`,
      sql`b.added_by = ${ctx.user.sub}`,
    ];

    if (genre) {
      conditions.push(sql`b.genre = ${genre}`);
    }
    if (author) {
      conditions.push(sql`b.author LIKE ${"%" + escapeLike(author) + "%"} ESCAPE '\\'`);
    }
    if (format) {
      conditions.push(sql`b.file_format = ${format}`);
    }

    const whereClause = sql.join(conditions, sql` AND `);

    const countRow = ctx.db.get<{ total: number }>(sql`
      SELECT count(*) AS total
      FROM books_fts
      JOIN books b ON b.rowid = books_fts.rowid
      WHERE ${whereClause}
    `);

    const rows = ctx.db.all<any>(sql`
      SELECT b.*, bm25(books_fts, 10, 5, 1) AS rank
      FROM books_fts
      JOIN books b ON b.rowid = books_fts.rowid
      WHERE ${whereClause}
      ORDER BY rank
      LIMIT ${limit} OFFSET ${offset}
    `);

    // Map snake_case columns to camelCase to match Drizzle schema
    const bookResults = rows.map((row) => ({
      id: row.id,
      title: row.title,
      author: row.author,
      description: row.description,
      isbn: row.isbn,
      genre: row.genre,
      language: row.language,
      publisher: row.publisher,
      publishedDate: row.published_date,
      coverPath: row.cover_path,
      filePath: row.file_path,
      fileFormat: row.file_format,
      fileSize: row.file_size,
      pageCount: row.page_count,
      tags: row.tags,
      addedBy: row.added_by,
      metadataLocked: row.metadata_locked,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return { books: bookResults, total: countRow?.total ?? 0, page };
  }),
});
