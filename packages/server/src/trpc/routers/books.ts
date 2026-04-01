import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq, and, or, desc, asc, sql, isNull, isNotNull } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { books, readingProgress, bookGenres, genres, bookListInput, bookByIdInput, bookUpdateInput, bookDeleteInput, searchInput } from "@verso/shared";
import { router, protectedProcedure, adminProcedure } from "../index.js";
import { writeMetadata, writeCover, getFileHash } from "../../services/calibre.js";
import { syncBookAuthors } from "../../services/sync-book-authors.js";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
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
    const { sort, page, limit, search, genreSlug, author, format } = input;
    const offset = (page - 1) * limit;

    const conditions: SQL[] = [];
    if (search) {
      const term = "%" + escapeLike(search) + "%";
      conditions.push(sql`(${books.title} LIKE ${term} ESCAPE '\\' OR ${books.author} LIKE ${term} ESCAPE '\\')`);
    }
    if (genreSlug) {
      conditions.push(
        sql`${books.id} IN (SELECT bg.book_id FROM book_genres bg JOIN genres g ON g.id = bg.genre_id WHERE g.slug = ${genreSlug})`
      );
    }
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

    // Fetch genres for each book
    const bookIds = bookList.map((b) => b.id);
    const genreRows = bookIds.length > 0
      ? await ctx.db
          .select({
            bookId: bookGenres.bookId,
            genreId: genres.id,
            slug: genres.slug,
            name: genres.name,
          })
          .from(bookGenres)
          .innerJoin(genres, eq(genres.id, bookGenres.genreId))
          .where(sql`${bookGenres.bookId} IN (${sql.join(bookIds.map(id => sql`${id}`), sql`, `)})`)
      : [];

    const genresByBook = new Map<string, { id: string; slug: string; name: string }[]>();
    for (const row of genreRows) {
      const list = genresByBook.get(row.bookId) ?? [];
      list.push({ id: row.genreId, slug: row.slug, name: row.name });
      genresByBook.set(row.bookId, list);
    }

    return {
      books: bookList.map((b) => ({ ...b, genres: genresByBook.get(b.id) ?? [] })),
      total: countResult[0].total,
      page,
    };
  }),

  byId: protectedProcedure.input(bookByIdInput).query(async ({ ctx, input }) => {
    const book = await ctx.db.query.books.findFirst({
      where: eq(books.id, input.id),
    });
    if (!book) throw new TRPCError({ code: "NOT_FOUND", message: "Book not found" });

    const bookGenreRows = await ctx.db
      .select({ id: genres.id, slug: genres.slug, name: genres.name })
      .from(bookGenres)
      .innerJoin(genres, eq(genres.id, bookGenres.genreId))
      .where(eq(bookGenres.bookId, input.id));

    return { ...book, genres: bookGenreRows };
  }),

  update: adminProcedure.input(bookUpdateInput).mutation(async ({ ctx, input }) => {
    const { id, tags, coverUrl, genreIds, ...fields } = input;
    const existing = await ctx.db.query.books.findFirst({
      where: eq(books.id, id),
    });
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Book not found" });

    const updateData: Record<string, any> = { ...fields, ...timestamp(), metadataLocked: true };
    if (tags !== undefined) updateData.tags = JSON.stringify(tags);

    // Handle cover URL — fetch and store
    let coverImageBuffer: Buffer | undefined;
    if (coverUrl) {
      try {
        const response = await fetch(coverUrl);
        if (response.ok) {
          const buffer = Buffer.from(await response.arrayBuffer());
          coverImageBuffer = await sharp(buffer)
            .resize(600, undefined, { withoutEnlargement: true })
            .jpeg({ quality: 85 })
            .toBuffer();
          const coverPath = `covers/${id}.jpg`;
          await ctx.storage.put(coverPath, coverImageBuffer);
          updateData.coverPath = coverPath;
        }
      } catch (err) {
        console.error("Cover fetch failed:", err);
      }
    }

    const [book] = await ctx.db.update(books).set(updateData).where(eq(books.id, id)).returning();

    // Re-sync author links from the final author string
    const finalAuthor = fields.author ?? existing.author;
    if (finalAuthor) {
      await syncBookAuthors(ctx.db, id, finalAuthor);
    }

    // Sync genre associations
    if (genreIds !== undefined) {
      await ctx.db.delete(bookGenres).where(eq(bookGenres.bookId, id));
      if (genreIds.length > 0) {
        await ctx.db.insert(bookGenres).values(
          genreIds.map((genreId) => ({ bookId: id, genreId }))
        );
      }
    }

    // EPUB write-back (non-fatal)
    if (existing.fileFormat === "epub") {
      try {
        const filePath = ctx.storage.fullPath(existing.filePath);
        const { coverUrl: _, tags: __, ...metaFields } = input;
        await writeMetadata(filePath, metaFields);

        if (coverImageBuffer) {
          const tempCoverPath = path.join(tmpdir(), `verso-cover-${id}-${Date.now()}.jpg`);
          await writeFile(tempCoverPath, coverImageBuffer);
          try {
            await writeCover(filePath, tempCoverPath);
          } finally {
            await unlink(tempCoverPath).catch(() => {});
          }
        }

        const newHash = await getFileHash(filePath);
        await ctx.db.update(books).set({ fileHash: newHash }).where(eq(books.id, id));
      } catch (err) {
        console.error("EPUB write-back failed:", err);
      }
    }

    return book;
  }),

  delete: adminProcedure.input(bookDeleteInput).mutation(async ({ ctx, input }) => {
    const existing = await ctx.db.query.books.findFirst({
      where: eq(books.id, input.id),
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
      return ctx.db.select().from(books)
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

  almostFinished: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        id: books.id,
        title: books.title,
        author: books.author,
        coverPath: books.coverPath,
        fileFormat: books.fileFormat,
        pageCount: books.pageCount,
        percentage: readingProgress.percentage,
        currentPage: readingProgress.currentPage,
        totalPages: readingProgress.totalPages,
        lastReadAt: readingProgress.lastReadAt,
      })
      .from(readingProgress)
      .innerJoin(books, eq(books.id, readingProgress.bookId))
      .where(
        and(
          eq(readingProgress.userId, ctx.user.sub),
          sql`${readingProgress.percentage} >= 75`,
          isNotNull(readingProgress.startedAt),
          isNull(readingProgress.finishedAt),
        )
      )
      .orderBy(desc(readingProgress.percentage))
      .limit(10);
    return rows;
  }),

  recommended: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(20).default(8) }).default({}))
    .query(async ({ ctx, input }) => {
      // 1. Get authors from books the user has read or is reading
      const activeBookRows = await ctx.db
        .select({ bookId: books.id, author: books.author })
        .from(readingProgress)
        .innerJoin(books, eq(books.id, readingProgress.bookId))
        .where(
          and(
            eq(readingProgress.userId, ctx.user.sub),
            isNotNull(readingProgress.startedAt),
          )
        );

      if (activeBookRows.length === 0) return [];

      const activeBookIds = activeBookRows.map((b) => b.bookId);
      const authorsList = [...new Set(activeBookRows.map((b) => b.author).filter(Boolean))];

      // Get genre IDs from active books via book_genres join
      const activeGenreRows = activeBookIds.length > 0
        ? await ctx.db
            .select({ genreId: bookGenres.genreId })
            .from(bookGenres)
            .where(sql`${bookGenres.bookId} IN (${sql.join(activeBookIds.map(id => sql`${id}`), sql`, `)})`)
        : [];
      const genreIds = [...new Set(activeGenreRows.map((r) => r.genreId))];

      if (authorsList.length === 0 && genreIds.length === 0) return [];

      // 2. Get IDs of books the user has already started (to exclude)
      const startedRows = await ctx.db
        .select({ bookId: readingProgress.bookId })
        .from(readingProgress)
        .where(
          and(
            eq(readingProgress.userId, ctx.user.sub),
            isNotNull(readingProgress.startedAt),
          )
        );
      const startedIds = new Set(startedRows.map((r) => r.bookId));

      // 3. Find candidate books matching author or genre
      const authorConditions = authorsList.map((a) => eq(books.author, a!));
      const genreCondition = genreIds.length > 0
        ? [sql`${books.id} IN (SELECT bg.book_id FROM book_genres bg WHERE bg.genre_id IN (${sql.join(genreIds.map(id => sql`${id}`), sql`, `)}))`]
        : [];
      const allConditions = [...authorConditions, ...genreCondition];

      const candidates = await ctx.db
        .select()
        .from(books)
        .where(or(...allConditions))
        .limit(50);

      // 4. Filter out started books, score and attach reason
      const authorsSet = new Set(authorsList);

      // Fetch genres for candidate books to determine match reasons
      const candidateIds = candidates.filter((c) => !startedIds.has(c.id)).map((c) => c.id);
      const candidateGenreRows = candidateIds.length > 0
        ? await ctx.db
            .select({ bookId: bookGenres.bookId, genreId: bookGenres.genreId })
            .from(bookGenres)
            .where(sql`${bookGenres.bookId} IN (${sql.join(candidateIds.map(id => sql`${id}`), sql`, `)})`)
        : [];
      const candidateGenreMap = new Map<string, Set<string>>();
      for (const row of candidateGenreRows) {
        const set = candidateGenreMap.get(row.bookId) ?? new Set();
        set.add(row.genreId);
        candidateGenreMap.set(row.bookId, set);
      }

      const genreIdSet = new Set(genreIds);
      // Fetch genre names for reason text
      const genreNameRows = genreIds.length > 0
        ? await ctx.db.select({ id: genres.id, name: genres.name }).from(genres)
            .where(sql`${genres.id} IN (${sql.join(genreIds.map(id => sql`${id}`), sql`, `)})`)
        : [];
      const genreNameMap = new Map(genreNameRows.map((r) => [r.id, r.name]));

      const scored = candidates
        .filter((b) => !startedIds.has(b.id))
        .map((b) => {
          const isAuthorMatch = b.author && authorsSet.has(b.author);
          const bookGenreIdSet = candidateGenreMap.get(b.id) ?? new Set();
          const matchedGenreId = [...bookGenreIdSet].find((gid) => genreIdSet.has(gid));
          const isGenreMatch = !!matchedGenreId;
          const priority = isAuthorMatch ? 1 : 2;
          const reason = isAuthorMatch
            ? `More by ${b.author}`
            : isGenreMatch
              ? `${genreNameMap.get(matchedGenreId!) ?? "Genre"} in your library`
              : "Recommended";
          return { ...b, reason, priority };
        });

      // 5. Shuffle within each priority tier
      const tier1 = scored.filter((b) => b.priority === 1).sort(() => Math.random() - 0.5);
      const tier2 = scored.filter((b) => b.priority === 2).sort(() => Math.random() - 0.5);
      let combined = [...tier1, ...tier2];

      // 6. Backfill with random unread books if fewer than 3 matches
      if (combined.length < 3) {
        const usedIds = new Set([...startedIds, ...combined.map((b) => b.id)]);
        const fillers = await ctx.db
          .select()
          .from(books)
          .limit(input.limit - combined.length + 10);
        const available = fillers
          .filter((b) => !usedIds.has(b.id))
          .sort(() => Math.random() - 0.5)
          .slice(0, input.limit - combined.length)
          .map((b) => ({ ...b, reason: "", priority: 3 as const }));
        combined = [...combined, ...available];
      }

      // 7. Limit and strip internal fields
      const result = combined.slice(0, input.limit);
      return result.map(({ priority, ...rest }) => rest);
    }),

  search: protectedProcedure.input(searchInput).query(async ({ ctx, input }) => {
    const { query, genreSlug, author, format, page = 1, limit = 50 } = input;
    const offset = (page - 1) * limit;

    // Build dynamic WHERE conditions using Drizzle sql template chunks
    const conditions = [
      sql`books_fts MATCH ${escapeFts5(query)}`,
    ];

    if (genreSlug) {
      conditions.push(
        sql`b.id IN (SELECT bg.book_id FROM book_genres bg JOIN genres g ON g.id = bg.genre_id WHERE g.slug = ${genreSlug})`
      );
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
