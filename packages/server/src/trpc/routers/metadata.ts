import { TRPCError } from "@trpc/server";
import { eq, and } from "drizzle-orm";
import { books, metadataCache, metadataSearchInput, metadataApplyInput } from "@verso/shared";
import type { ExternalBook } from "@verso/shared";
import { router, protectedProcedure } from "../index.js";
import { searchExternalMetadata } from "../../services/metadata-enrichment.js";
import { updateEpubMetadata, getEpubFileHash } from "../../services/epub-writer.js";
import sharp from "sharp";

const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export const metadataRouter = router({
  search: protectedProcedure.input(metadataSearchInput).query(async ({ ctx, input }) => {
    // Verify book exists and belongs to user
    const book = await ctx.db.query.books.findFirst({
      where: and(eq(books.id, input.bookId), eq(books.addedBy, ctx.user.sub)),
    });
    if (!book) throw new TRPCError({ code: "NOT_FOUND", message: "Book not found" });

    // Build query string
    const query = input.query ?? `${book.title} ${book.author}`.trim();

    // Build cache key
    const cacheKey = book.isbn || `${book.title}::${book.author}`;

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

    // Search external APIs
    const results = await searchExternalMetadata(
      { title: book.title, author: book.author, isbn: book.isbn ?? undefined },
      book.year ?? undefined,
    );

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

  applyFields: protectedProcedure.input(metadataApplyInput).mutation(async ({ ctx, input }) => {
    // Verify book exists and belongs to user
    const book = await ctx.db.query.books.findFirst({
      where: and(eq(books.id, input.bookId), eq(books.addedBy, ctx.user.sub)),
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
      const response = await fetch(coverUrl);
      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const processed = await sharp(buffer)
          .resize(600, null, { withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toBuffer();

        const coverPath = `books/${input.bookId}/cover.jpg`;
        await ctx.storage.put(coverPath, processed);
        updateData.coverPath = coverPath;
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
