import { eq, and } from "drizzle-orm";
import { authors, authorDescriptions } from "@verso/shared";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { searchWikidata, fetchWikipediaSummaries, getCommonsImageUrl } from "./wikidata-authors.js";
import { searchAuthor, fetchAuthorMetadata } from "./openlibrary-authors.js";

export async function enrichAuthorV2(
  db: BetterSQLite3Database<any>,
  authorId: string,
  authorName: string,
  storage: { put: (path: string, data: Buffer) => Promise<void> },
): Promise<boolean> {
  // Try Wikidata first
  const wikiResult = await searchWikidata(authorName);

  if (wikiResult) {
    return enrichFromWikidata(db, authorId, wikiResult, storage);
  }

  // Fall back to OpenLibrary
  return enrichFromOpenLibrary(db, authorId, authorName, storage);
}

async function enrichFromWikidata(
  db: BetterSQLite3Database<any>,
  authorId: string,
  wikiResult: NonNullable<Awaited<ReturnType<typeof searchWikidata>>>,
  storage: { put: (path: string, data: Buffer) => Promise<void> },
): Promise<boolean> {
  try {
    // Fetch localized summaries
    const summaries = await fetchWikipediaSummaries(wikiResult.sitelinks);

    // Get manually edited locales to skip
    const manualEdits = db
      .select({ locale: authorDescriptions.locale })
      .from(authorDescriptions)
      .where(
        and(
          eq(authorDescriptions.authorId, authorId),
          eq(authorDescriptions.manuallyEdited, true),
        )
      )
      .all()
      .map((r) => r.locale);

    const manualSet = new Set(manualEdits);

    // Upsert descriptions for non-manually-edited locales
    for (const { locale, description } of summaries) {
      if (manualSet.has(locale)) continue;

      const existing = db
        .select()
        .from(authorDescriptions)
        .where(
          and(
            eq(authorDescriptions.authorId, authorId),
            eq(authorDescriptions.locale, locale),
          )
        )
        .get();

      if (existing) {
        db.update(authorDescriptions)
          .set({ description })
          .where(
            and(
              eq(authorDescriptions.authorId, authorId),
              eq(authorDescriptions.locale, locale),
            )
          )
          .run();
      } else {
        db.insert(authorDescriptions)
          .values({ authorId, locale, description, manuallyEdited: false })
          .run();
      }
    }

    // Download photo
    let imagePath: string | null = null;
    if (wikiResult.imageFilename) {
      try {
        const photoUrl = getCommonsImageUrl(wikiResult.imageFilename);
        const photoRes = await fetch(photoUrl);
        if (photoRes.ok) {
          const buffer = Buffer.from(await photoRes.arrayBuffer());
          imagePath = `authors/${authorId}/photo.jpg`;
          await storage.put(imagePath, buffer);
        }
      } catch {
        // Photo download failed — continue without
      }
    }

    // Update author record
    const updates: Record<string, any> = {
      updatedAt: new Date().toISOString(),
    };
    if (wikiResult.birthDate) updates.birthDate = wikiResult.birthDate;
    if (wikiResult.deathDate) updates.deathDate = wikiResult.deathDate;
    if (imagePath) updates.imagePath = imagePath;

    db.update(authors)
      .set(updates)
      .where(eq(authors.id, authorId))
      .run();

    return summaries.length > 0 || imagePath !== null;
  } catch {
    return false;
  }
}

async function enrichFromOpenLibrary(
  db: BetterSQLite3Database<any>,
  authorId: string,
  authorName: string,
  storage: { put: (path: string, data: Buffer) => Promise<void> },
): Promise<boolean> {
  try {
    const olKey = await searchAuthor(authorName);
    if (!olKey) return false;

    const meta = await fetchAuthorMetadata(olKey);
    if (!meta) return false;

    // Store English description if available
    if (meta.description) {
      const manualEn = db
        .select()
        .from(authorDescriptions)
        .where(
          and(
            eq(authorDescriptions.authorId, authorId),
            eq(authorDescriptions.locale, "en"),
            eq(authorDescriptions.manuallyEdited, true),
          )
        )
        .get();

      if (!manualEn) {
        const existing = db
          .select()
          .from(authorDescriptions)
          .where(
            and(
              eq(authorDescriptions.authorId, authorId),
              eq(authorDescriptions.locale, "en"),
            )
          )
          .get();

        if (existing) {
          db.update(authorDescriptions)
            .set({ description: meta.description })
            .where(
              and(
                eq(authorDescriptions.authorId, authorId),
                eq(authorDescriptions.locale, "en"),
              )
            )
            .run();
        } else {
          db.insert(authorDescriptions)
            .values({ authorId, locale: "en", description: meta.description, manuallyEdited: false })
            .run();
        }
      }
    }

    // Download photo
    let imagePath: string | null = null;
    if (meta.photoUrl) {
      try {
        const photoRes = await fetch(meta.photoUrl);
        if (photoRes.ok) {
          const buffer = Buffer.from(await photoRes.arrayBuffer());
          imagePath = `authors/${authorId}/photo.jpg`;
          await storage.put(imagePath, buffer);
        }
      } catch {
        // Photo download failed
      }
    }

    // Update author record
    const updates: Record<string, any> = {
      openLibraryKey: olKey,
      updatedAt: new Date().toISOString(),
    };
    if (meta.birthDate) updates.birthDate = meta.birthDate;
    if (imagePath) updates.imagePath = imagePath;

    db.update(authors)
      .set(updates)
      .where(eq(authors.id, authorId))
      .run();

    return true;
  } catch {
    return false;
  }
}
