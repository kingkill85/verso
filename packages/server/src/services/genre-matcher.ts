import { eq } from "drizzle-orm";
import { genres } from "@verso/shared";
import type { AppDatabase } from "../db/client.js";

/** Common aliases that map to canonical genre slugs */
const GENRE_ALIASES: Record<string, string> = {
  "sci-fi": "science-fiction",
  "scifi": "science-fiction",
  "sf": "science-fiction",
  "science fiction & fantasy": "science-fiction",
  "bio": "biography",
  "nonfiction": "non-fiction",
  "non fiction": "non-fiction",
  "ya": "young-adult",
  "young adult fiction": "young-adult",
  "kids": "childrens",
  "children": "childrens",
  "self help": "self-help",
  "selfhelp": "self-help",
  "sci fi": "science-fiction",
  "histfic": "historical-fiction",
  "literary": "literary-fiction",
  "tech": "technology",
  "comp sci": "technology",
  "computer science": "technology",
  "comics": "graphic-novel",
  "manga": "graphic-novel",
  "suspense": "thriller",
  "detective": "mystery",
  "whodunit": "mystery",
  "autobio": "autobiography",
  "true crime": "true-crime",
  "truecrime": "true-crime",
};

function toSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Match a raw genre string against the genres table.
 * Returns the genre ID if matched, or null if no match.
 */
export async function matchGenreString(
  db: AppDatabase,
  raw: string,
): Promise<string | null> {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();
  const slug = toSlug(trimmed);

  // 1. Check alias map
  const aliasSlug = GENRE_ALIASES[lower];
  if (aliasSlug) {
    const row = await db.select({ id: genres.id }).from(genres).where(eq(genres.slug, aliasSlug)).get();
    if (row) return row.id;
  }

  // 2. Try exact slug match
  const bySlug = await db.select({ id: genres.id }).from(genres).where(eq(genres.slug, slug)).get();
  if (bySlug) return bySlug.id;

  // 3. Try case-insensitive name match
  const allGenres = await db.select({ id: genres.id, name: genres.name }).from(genres);
  const byName = allGenres.find((g) => g.name.toLowerCase() === lower);
  if (byName) return byName.id;

  // 4. Contains match — if input contains a known genre name
  // e.g., "Historical Fiction & Drama" → historical-fiction
  const byContains = allGenres.find((g) => lower.includes(g.name.toLowerCase()));
  if (byContains) return byContains.id;

  return null;
}

/**
 * Match multiple raw genre strings. Returns array of matched genre IDs.
 * Skips unmatched strings (does not create custom genres).
 */
export async function matchGenreStrings(
  db: AppDatabase,
  rawGenres: string[],
): Promise<string[]> {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const raw of rawGenres) {
    const id = await matchGenreString(db, raw);
    if (id && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

/**
 * Match a raw genre string, creating a custom genre if no match found.
 * Used during migration of existing data.
 */
export async function matchOrCreateGenre(
  db: AppDatabase,
  raw: string,
): Promise<string | null> {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const matched = await matchGenreString(db, trimmed);
  if (matched) return matched;

  // Create as custom genre
  const slug = toSlug(trimmed);
  const existing = await db.select({ id: genres.id }).from(genres).where(eq(genres.slug, slug)).get();
  if (existing) return existing.id;

  const [created] = await db
    .insert(genres)
    .values({ slug, name: trimmed, isDefault: false })
    .returning({ id: genres.id });
  return created.id;
}
