import { TRPCError } from "@trpc/server";
import { eq, and } from "drizzle-orm";
import { books, metadataCache, metadataSearchInput, metadataApplyInput } from "@verso/shared";
import type { ExternalBook } from "@verso/shared";
import { router, protectedProcedure, adminProcedure } from "../index.js";
import { searchExternalMetadata, scoreMatch } from "../../services/metadata-enrichment.js";
import { searchMetadata as calibreSearchMetadata } from "../../services/calibre.js";
import { updateEpubMetadata, getEpubFileHash } from "../../services/epub-writer.js";
import sharp from "sharp";

const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export const metadataRouter = router({
  search: adminProcedure.input(metadataSearchInput).query(async ({ ctx, input }) => {
    // Verify book exists and belongs to user
    const book = await ctx.db.query.books.findFirst({
      where: eq(books.id, input.bookId),
    });
    if (!book) throw new TRPCError({ code: "NOT_FOUND", message: "Book not found" });

    // Use explicit fields if provided, fall back to book data
    const searchTitle = input.title ?? book.title;
    const searchAuthor = input.author ?? book.author;
    const searchIsbn = input.isbn ?? book.isbn ?? undefined;

    // Build cache key
    const cacheKey = searchIsbn || `${searchTitle}::${searchAuthor}`;

    // Check cache (only for auto-search, not manual queries)
    if (!input.query) {
      const cached = await ctx.db.query.metadataCache.findFirst({
        where: and(
          eq(metadataCache.queryKey, cacheKey),
          eq(metadataCache.source, "combined"),
        ),
      });

      if (cached) {
        const fetchedAt = new Date(cached.fetchedAt).getTime();
        const age = Date.now() - fetchedAt;
        if (age < CACHE_MAX_AGE_MS) {
          return JSON.parse(cached.data) as ExternalBook[];
        }
      }
    }

    // Run Calibre metadata search and external cover search in parallel
    const bookQuery = { title: searchTitle, author: searchAuthor, isbn: searchIsbn };
    const [calibreResults, coverResults] = await Promise.all([
      calibreSearchMetadata(bookQuery).catch(() => []),
      searchExternalMetadata(bookQuery, book.year ?? undefined).catch(() => []),
    ]);

    // Convert Calibre results to ExternalBook[], merging in high-res covers
    const results: ExternalBook[] = calibreResults.map((meta, idx) => {
      const ext: ExternalBook = {
        source: "calibre",
        sourceId: `calibre-${idx}`,
        title: meta.title,
        author: meta.author,
        isbn: meta.isbn,
        publisher: meta.publisher,
        year: meta.year,
        description: meta.description,
        genre: meta.genre,
        language: meta.language,
        pageCount: meta.pageCount,
        series: meta.series,
        seriesIndex: meta.seriesIndex,
        confidence: 0,
      };

      // Try to find a matching cover from external sources
      // First try ISBN match, then title+author similarity
      let bestCover: string | undefined;
      let bestScore = 0;

      for (const cover of coverResults) {
        if (!cover.coverUrl) continue;
        const score = scoreMatch(
          { title: meta.title, author: meta.author, isbn: meta.isbn },
          cover,
          meta.year,
        );
        if (score > bestScore) {
          bestScore = score;
          bestCover = cover.coverUrl;
        }
      }

      if (bestCover && bestScore >= 0.3) {
        ext.coverUrl = bestCover;
      }

      return ext;
    });

    // Score each result against the local book data
    for (const result of results) {
      result.confidence = scoreMatch(bookQuery, result, book.year ?? undefined);
    }

    // Sort by confidence descending
    results.sort((a, b) => b.confidence - a.confidence);

    // Cache results (only for auto-search)
    if (!input.query) {
      await ctx.db
        .insert(metadataCache)
        .values({
          queryKey: cacheKey,
          source: "combined",
          data: JSON.stringify(results),
          fetchedAt: new Date().toISOString(),
        })
        .onConflictDoUpdate({
          target: [metadataCache.queryKey, metadataCache.source],
          set: {
            data: JSON.stringify(results),
            fetchedAt: new Date().toISOString(),
          },
        });
    }

    return results;
  }),

  applyFields: adminProcedure.input(metadataApplyInput).mutation(async ({ ctx, input }) => {
    // Verify book exists and belongs to user
    const book = await ctx.db.query.books.findFirst({
      where: eq(books.id, input.bookId),
    });
    if (!book) throw new TRPCError({ code: "NOT_FOUND", message: "Book not found" });

    // Extract coverUrl, handle separately
    const { coverUrl, ...metadataFields } = input.fields;

    const updateData: Record<string, any> = {
      ...metadataFields,
      updatedAt: new Date().toISOString(),
    };

    if (input.source) {
      updateData.metadataSource = input.source;
    }

    // Handle cover image download and processing
    if (coverUrl) {
      try {
        const response = await fetch(coverUrl);
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);

          const processed = await sharp(buffer)
            .resize(600, undefined, { withoutEnlargement: true })
            .jpeg({ quality: 85 })
            .toBuffer();

          const coverPath = `covers/${input.bookId}.jpg`;
          await ctx.storage.put(coverPath, processed);
          updateData.coverPath = coverPath;
        }
      } catch (err) {
        console.error("Cover fetch/processing failed:", err);
      }
    }

    // Update database
    const [updated] = await ctx.db
      .update(books)
      .set(updateData)
      .where(eq(books.id, input.bookId))
      .returning();

    // EPUB write-back (non-fatal)
    if (book.fileFormat === "epub") {
      try {
        const filePath = ctx.storage.fullPath(book.filePath);
        await updateEpubMetadata(filePath, {
          ...metadataFields,
        }, book.fileHash ?? undefined);

        // Update file hash after modification
        const newHash = await getEpubFileHash(filePath);
        await ctx.db
          .update(books)
          .set({ fileHash: newHash })
          .where(eq(books.id, input.bookId));
      } catch (err) {
        console.error(`Failed to write metadata back to EPUB for book ${input.bookId}:`, err);
      }
    }

    return updated;
  }),
});
