import { describe, it, expect, vi, beforeEach } from "vitest";
import * as wikidataModule from "../services/wikidata-authors.js";
import * as openlibraryModule from "../services/openlibrary-authors.js";
import { enrichAuthorV2 } from "../services/enrich-author-v2.js";
import { createTestContext } from "../test-utils.js";
import { authors, authorDescriptions } from "@verso/shared";
import { eq } from "drizzle-orm";

vi.mock("../services/wikidata-authors.js");
vi.mock("../services/openlibrary-authors.js");

describe("enrichAuthorV2", () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;
  let authorId: string;

  const mockStorage = {
    put: vi.fn().mockResolvedValue(undefined),
    get: vi.fn(),
    delete: vi.fn(),
    exists: vi.fn(),
    stream: vi.fn(),
    size: vi.fn(),
    fullPath: vi.fn(),
    removeDir: vi.fn(),
  };

  beforeEach(async () => {
    ctx = await createTestContext();
    const [author] = await ctx.db.insert(authors).values({
      name: "Douglas Adams",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).returning();
    authorId = author.id;
    vi.resetAllMocks();
  });

  it("enriches from Wikidata when available", async () => {
    const searchWikidata = vi.mocked(wikidataModule.searchWikidata);
    const fetchWikipediaSummaries = vi.mocked(wikidataModule.fetchWikipediaSummaries);
    const getCommonsImageUrl = vi.mocked(wikidataModule.getCommonsImageUrl);

    searchWikidata.mockResolvedValue({
      entityId: "Q42",
      birthDate: "1952-03-11",
      deathDate: "2001-05-11",
      imageFilename: "photo.jpg",
      sitelinks: { en: "Douglas Adams", de: "Douglas Adams" },
    });
    fetchWikipediaSummaries.mockResolvedValue([
      { locale: "en", description: "English author" },
      { locale: "de", description: "Englischer Autor" },
    ]);
    getCommonsImageUrl.mockReturnValue("https://commons.example.com/photo.jpg");

    // Mock photo download
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(Buffer.from("fake-image-data"))
    );

    const result = await enrichAuthorV2(ctx.db, authorId, "Douglas Adams", mockStorage as any);
    expect(result).toBe(true);

    // Check descriptions were stored
    const descriptions = ctx.db
      .select()
      .from(authorDescriptions)
      .where(eq(authorDescriptions.authorId, authorId))
      .all();
    expect(descriptions).toHaveLength(2);
    expect(descriptions.find((d) => d.locale === "en")?.description).toBe("English author");
    expect(descriptions.find((d) => d.locale === "de")?.description).toBe("Englischer Autor");

    // Check author record updated
    const updated = ctx.db.select().from(authors).where(eq(authors.id, authorId)).get();
    expect(updated?.birthDate).toBe("1952-03-11");
    expect(updated?.imagePath).toBe(`authors/${authorId}/photo.jpg`);
  });

  it("falls back to OpenLibrary when Wikidata returns nothing", async () => {
    vi.mocked(wikidataModule.searchWikidata).mockResolvedValue(null);
    vi.mocked(openlibraryModule.searchAuthor).mockResolvedValue("OL123A");
    vi.mocked(openlibraryModule.fetchAuthorMetadata).mockResolvedValue({
      description: "English author from OpenLibrary",
      birthDate: "1952-03-11",
      photoUrl: null,
    });

    const result = await enrichAuthorV2(ctx.db, authorId, "Douglas Adams", mockStorage as any);
    expect(result).toBe(true);

    const descriptions = ctx.db
      .select()
      .from(authorDescriptions)
      .where(eq(authorDescriptions.authorId, authorId))
      .all();
    expect(descriptions).toHaveLength(1);
    expect(descriptions[0].locale).toBe("en");
    expect(descriptions[0].description).toBe("English author from OpenLibrary");
  });

  it("skips manually edited descriptions during enrichment", async () => {
    // Pre-insert a manually edited description
    await ctx.db.insert(authorDescriptions).values({
      authorId,
      locale: "en",
      description: "My custom bio",
      manuallyEdited: true,
    });

    vi.mocked(wikidataModule.searchWikidata).mockResolvedValue({
      entityId: "Q42",
      birthDate: "1952-03-11",
      deathDate: null,
      imageFilename: null,
      sitelinks: { en: "Douglas Adams", de: "Douglas Adams" },
    });
    vi.mocked(wikidataModule.fetchWikipediaSummaries).mockResolvedValue([
      { locale: "en", description: "Should not overwrite" },
      { locale: "de", description: "German bio" },
    ]);

    await enrichAuthorV2(ctx.db, authorId, "Douglas Adams", mockStorage as any);

    const descriptions = ctx.db
      .select()
      .from(authorDescriptions)
      .where(eq(authorDescriptions.authorId, authorId))
      .all();
    const enDesc = descriptions.find((d) => d.locale === "en");
    expect(enDesc?.description).toBe("My custom bio"); // Preserved
    expect(enDesc?.manuallyEdited).toBe(true);
    const deDesc = descriptions.find((d) => d.locale === "de");
    expect(deDesc?.description).toBe("German bio"); // Added
  });

  it("returns false when both sources fail", async () => {
    vi.mocked(wikidataModule.searchWikidata).mockResolvedValue(null);
    vi.mocked(openlibraryModule.searchAuthor).mockResolvedValue(null);

    const result = await enrichAuthorV2(ctx.db, authorId, "Unknown Author", mockStorage as any);
    expect(result).toBe(false);
  });
});
