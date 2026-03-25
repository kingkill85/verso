import { describe, it, expect } from "vitest";
import { scoreMatch, deduplicateResults, parseGoodreadsBookPage } from "../services/metadata-enrichment.js";
import type { ExternalBook } from "@verso/shared";

function makeCandidate(overrides: Partial<ExternalBook> = {}): ExternalBook {
  return {
    source: "google",
    sourceId: "abc123",
    title: "The Great Gatsby",
    author: "F. Scott Fitzgerald",
    confidence: 0,
    ...overrides,
  };
}

describe("scoreMatch", () => {
  const local = {
    title: "The Great Gatsby",
    author: "F. Scott Fitzgerald",
    isbn: "978-0-7432-7356-5",
  };

  it("returns 0.95 for ISBN match (ignoring dashes)", () => {
    const candidate = makeCandidate({ isbn: "9780743273565" });
    expect(scoreMatch(local, candidate)).toBe(0.95);
  });

  it("returns 0.95 for ISBN match with different dash patterns", () => {
    const candidate = makeCandidate({ isbn: "978-074327356-5" });
    expect(scoreMatch(local, candidate)).toBe(0.95);
  });

  it("does not match different ISBNs", () => {
    const candidate = makeCandidate({ isbn: "9780000000000" });
    expect(scoreMatch(local, candidate)).not.toBe(0.95);
  });

  it("scores exact title match as 0.4", () => {
    const candidate = makeCandidate({ author: "Unknown Author", isbn: undefined });
    expect(scoreMatch({ title: "The Great Gatsby", author: "Someone Else" }, candidate)).toBeCloseTo(0.4);
  });

  it("scores case-insensitive title match as 0.4", () => {
    const candidate = makeCandidate({
      title: "the great gatsby",
      author: "Unknown",
      isbn: undefined,
    });
    expect(scoreMatch({ title: "THE GREAT GATSBY", author: "Nobody" }, candidate)).toBeCloseTo(0.4);
  });

  it("scores partial title containment as 0.2", () => {
    const candidate = makeCandidate({
      title: "The Great Gatsby: A Novel",
      author: "Unknown",
      isbn: undefined,
    });
    expect(scoreMatch({ title: "The Great Gatsby", author: "Nobody" }, candidate)).toBeCloseTo(0.2);
  });

  it("scores author last name match as 0.3", () => {
    const candidate = makeCandidate({
      title: "Something Else",
      author: "Francis Scott Fitzgerald",
      isbn: undefined,
    });
    expect(scoreMatch({ title: "Different Title", author: "F. Scott Fitzgerald" }, candidate)).toBeCloseTo(0.3);
  });

  it("scores year within ±2 as 0.2", () => {
    const candidate = makeCandidate({
      title: "Different",
      author: "Unknown",
      isbn: undefined,
      year: 1926,
    });
    expect(scoreMatch({ title: "Other", author: "Nobody" }, candidate, 1925)).toBeCloseTo(0.2);
  });

  it("does not score year outside ±2", () => {
    const candidate = makeCandidate({
      title: "Different",
      author: "Unknown",
      isbn: undefined,
      year: 2020,
    });
    expect(scoreMatch({ title: "Other", author: "Nobody" }, candidate, 1925)).toBe(0);
  });

  it("combines title + author + year scores", () => {
    const candidate = makeCandidate({
      isbn: undefined,
      year: 1925,
    });
    // title exact 0.4 + author 0.3 + year 0.2 = 0.9
    expect(scoreMatch(local, candidate, 1925)).toBeCloseTo(0.9);
  });

  it("caps score at 1.0", () => {
    const candidate = makeCandidate({
      isbn: undefined,
      year: 1925,
    });
    // Even with all signals, should not exceed 1.0
    const score = scoreMatch(local, candidate, 1925);
    expect(score).toBeLessThanOrEqual(1.0);
  });

  it("returns 0 when nothing matches", () => {
    const candidate = makeCandidate({
      title: "Completely Different Book",
      author: "Someone Else",
      isbn: undefined,
      year: 2020,
    });
    expect(scoreMatch({ title: "My Book", author: "My Author" }, candidate, 1900)).toBe(0);
  });

  it("handles empty author strings gracefully", () => {
    const candidate = makeCandidate({ author: "", isbn: undefined });
    expect(() =>
      scoreMatch({ title: "Test", author: "" }, candidate)
    ).not.toThrow();
  });

  it("handles whitespace normalization in titles", () => {
    const candidate = makeCandidate({
      title: "The  Great   Gatsby",
      author: "Unknown",
      isbn: undefined,
    });
    expect(scoreMatch({ title: "The Great Gatsby", author: "Nobody" }, candidate)).toBeCloseTo(0.4);
  });

  it("skips ISBN comparison when local has no ISBN", () => {
    const candidate = makeCandidate({ isbn: "9780743273565" });
    // No ISBN on local — should fall through to title/author scoring
    const score = scoreMatch(
      { title: "The Great Gatsby", author: "F. Scott Fitzgerald" },
      candidate
    );
    // title 0.4 + author 0.3 = 0.7
    expect(score).toBeCloseTo(0.7);
  });

  it("skips ISBN comparison when candidate has no ISBN", () => {
    const candidate = makeCandidate({ isbn: undefined });
    const score = scoreMatch(local, candidate);
    // title 0.4 + author 0.3 = 0.7
    expect(score).toBeCloseTo(0.7);
  });
});

describe("deduplicateResults", () => {
  it("merges results with the same ISBN", () => {
    const results: ExternalBook[] = [
      makeCandidate({ isbn: "9780743273565", confidence: 0.8, source: "google" }),
      makeCandidate({ isbn: "9780743273565", confidence: 0.7, source: "openlibrary" }),
    ];
    const deduped = deduplicateResults(results);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].confidence).toBe(0.8);
  });

  it("keeps results with different ISBNs separate", () => {
    const results: ExternalBook[] = [
      makeCandidate({ isbn: "9780743273565", confidence: 0.8 }),
      makeCandidate({ isbn: "9780000000000", confidence: 0.7 }),
    ];
    const deduped = deduplicateResults(results);
    expect(deduped).toHaveLength(2);
  });

  it("keeps results without ISBN as separate entries", () => {
    const results: ExternalBook[] = [
      makeCandidate({ isbn: undefined, confidence: 0.6, sourceId: "a" }),
      makeCandidate({ isbn: undefined, confidence: 0.5, sourceId: "b" }),
    ];
    const deduped = deduplicateResults(results);
    expect(deduped).toHaveLength(2);
  });

  it("prefers Google cover when merging", () => {
    const results: ExternalBook[] = [
      makeCandidate({
        isbn: "9780743273565",
        confidence: 0.5,
        source: "openlibrary",
        coverUrl: "https://covers.openlibrary.org/b/id/12345-L.jpg",
      }),
      makeCandidate({
        isbn: "9780743273565",
        confidence: 0.9,
        source: "google",
        coverUrl: "https://books.google.com/cover.jpg",
      }),
    ];
    const deduped = deduplicateResults(results);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].coverUrl).toBe("https://books.google.com/cover.jpg");
  });

  it("keeps highest confidence when merging", () => {
    const results: ExternalBook[] = [
      makeCandidate({ isbn: "9780743273565", confidence: 0.3, source: "google" }),
      makeCandidate({ isbn: "9780743273565", confidence: 0.9, source: "openlibrary" }),
    ];
    const deduped = deduplicateResults(results);
    expect(deduped[0].confidence).toBe(0.9);
  });

  it("sorts by confidence descending", () => {
    const results: ExternalBook[] = [
      makeCandidate({ isbn: "1111111111111", confidence: 0.3 }),
      makeCandidate({ isbn: "2222222222222", confidence: 0.9 }),
      makeCandidate({ isbn: "3333333333333", confidence: 0.6 }),
    ];
    const deduped = deduplicateResults(results);
    expect(deduped.map((r) => r.confidence)).toEqual([0.9, 0.6, 0.3]);
  });

  it("handles empty input", () => {
    expect(deduplicateResults([])).toEqual([]);
  });

  it("normalizes ISBN dashes when deduplicating", () => {
    const results: ExternalBook[] = [
      makeCandidate({ isbn: "978-0-7432-7356-5", confidence: 0.8 }),
      makeCandidate({ isbn: "9780743273565", confidence: 0.7 }),
    ];
    const deduped = deduplicateResults(results);
    expect(deduped).toHaveLength(1);
  });

  it("prefers Google cover even when OL entry comes second", () => {
    const results: ExternalBook[] = [
      makeCandidate({
        isbn: "9780743273565",
        confidence: 0.9,
        source: "google",
        coverUrl: "https://google-cover.jpg",
      }),
      makeCandidate({
        isbn: "9780743273565",
        confidence: 0.5,
        source: "openlibrary",
        coverUrl: "https://ol-cover.jpg",
      }),
    ];
    const deduped = deduplicateResults(results);
    expect(deduped[0].coverUrl).toBe("https://google-cover.jpg");
  });

  it("prefers Goodreads cover over Google and OpenLibrary covers", () => {
    const results: ExternalBook[] = [
      makeCandidate({
        isbn: "9780743273565",
        confidence: 0.9,
        source: "google",
        coverUrl: "https://books.google.com/cover.jpg",
      }),
      makeCandidate({
        isbn: "9780743273565",
        confidence: 0.8,
        source: "goodreads",
        coverUrl: "https://i.gr-assets.com/images/S/goodreads-cover.jpg",
      }),
      makeCandidate({
        isbn: "9780743273565",
        confidence: 0.7,
        source: "openlibrary",
        coverUrl: "https://covers.openlibrary.org/b/id/99-L.jpg",
      }),
    ];
    const deduped = deduplicateResults(results);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].coverUrl).toBe("https://i.gr-assets.com/images/S/goodreads-cover.jpg");
  });
});

// ---------------------------------------------------------------------------
// Helpers for building minimal Goodreads HTML fixtures
// ---------------------------------------------------------------------------

function makeJsonLd(overrides: Record<string, unknown> = {}): string {
  const ld = {
    "@context": "https://schema.org",
    "@type": "Book",
    name: "The Mercy",
    author: [{ "@type": "Person", name: "Jussi Adler-Olsen" }],
    isbn: "9781846554483",
    numberOfPages: "517",
    inLanguage: "en",
    image: "https://i.gr-assets.com/images/S/cover.jpg",
    ...overrides,
  };
  return `<script type="application/ld+json">${JSON.stringify(ld)}</script>`;
}

function makeGoodreadsPage(options: {
  ldOverrides?: Record<string, unknown>;
  extraHtml?: string;
  omitJsonLd?: boolean;
} = {}): string {
  const { ldOverrides = {}, extraHtml = "", omitJsonLd = false } = options;
  const jsonLdBlock = omitJsonLd ? "" : makeJsonLd(ldOverrides);
  return `<html><body>${jsonLdBlock}${extraHtml}</body></html>`;
}

const BOOK_URL = "https://www.goodreads.com/book/show/6892870-mercy";

// ---------------------------------------------------------------------------

describe("parseGoodreadsBookPage", () => {
  it("extracts JSON-LD metadata: title, author, ISBN, pages, language, cover", () => {
    const html = makeGoodreadsPage();
    const book = parseGoodreadsBookPage(html, BOOK_URL);

    expect(book).not.toBeNull();
    expect(book!.title).toBe("The Mercy");
    expect(book!.author).toBe("Jussi Adler-Olsen");
    expect(book!.isbn).toBe("9781846554483");
    expect(book!.pageCount).toBe(517);
    expect(book!.language).toBe("en");
    expect(book!.coverUrl).toBe("https://i.gr-assets.com/images/S/cover.jpg");
    expect(book!.source).toBe("goodreads");
    expect(book!.sourceId).toBe("6892870");
  });

  it("strips series suffix and populates series + seriesIndex", () => {
    const html = makeGoodreadsPage({
      ldOverrides: { name: "Erbarmen (Sonderdezernat Q, #1)" },
    });
    const book = parseGoodreadsBookPage(html, BOOK_URL);

    expect(book).not.toBeNull();
    expect(book!.title).toBe("Erbarmen");
    expect(book!.series).toBe("Sonderdezernat Q");
    expect(book!.seriesIndex).toBe(1);
  });

  it("uses only the first author (ignores translators listed as subsequent authors)", () => {
    const html = makeGoodreadsPage({
      ldOverrides: {
        author: [
          { "@type": "Person", name: "Jussi Adler-Olsen" },
          { "@type": "Person", name: "Lisa Reinhardt" }, // translator
        ],
      },
    });
    const book = parseGoodreadsBookPage(html, BOOK_URL);

    expect(book).not.toBeNull();
    expect(book!.author).toBe("Jussi Adler-Olsen");
  });

  it("extracts description from HTML contentContainer span", () => {
    const descHtml = `<div data-testid="contentContainer"><div><div><span class="Formatted">A gripping thriller.<br/>Very good.</span></div></div></div>`;
    const html = makeGoodreadsPage({ extraHtml: descHtml });
    const book = parseGoodreadsBookPage(html, BOOK_URL);

    expect(book).not.toBeNull();
    expect(book!.description).toContain("A gripping thriller.");
    expect(book!.description).toContain("Very good.");
  });

  it("extracts the first genre from BookPageMetadataSection genre buttons", () => {
    const genreHtml = `
      <div class="BookPageMetadataSection__genreButton foo"><a href="/genres/crime"><span class="Button__labelItem">Crime</span></a></div>
      <div class="BookPageMetadataSection__genreButton bar"><a href="/genres/thriller"><span class="Button__labelItem">Thriller</span></a></div>
    `;
    const html = makeGoodreadsPage({ extraHtml: genreHtml });
    const book = parseGoodreadsBookPage(html, BOOK_URL);

    expect(book).not.toBeNull();
    expect(book!.genre).toBe("Crime");
  });

  it("returns null when no JSON-LD script tag is present", () => {
    const html = makeGoodreadsPage({ omitJsonLd: true });
    const book = parseGoodreadsBookPage(html, BOOK_URL);

    expect(book).toBeNull();
  });

  it("returns null when JSON-LD @type is not Book", () => {
    const html = makeGoodreadsPage({
      ldOverrides: { "@type": "WebPage" },
    });
    const book = parseGoodreadsBookPage(html, BOOK_URL);

    expect(book).toBeNull();
  });
});
