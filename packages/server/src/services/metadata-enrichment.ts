import type { ExternalBook } from "@verso/shared";

/** Normalize an ISBN by stripping dashes and whitespace. */
function normalizeIsbn(isbn: string): string {
  return isbn.replace(/[-\s]/g, "");
}

/** Normalize a title for comparison: lowercase, collapse whitespace, trim. */
function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Extract the last name from an author string (last word). */
function extractLastName(author: string): string {
  const parts = author.trim().split(/\s+/);
  return parts[parts.length - 1].toLowerCase();
}

/**
 * Score how well a candidate matches local book data.
 * - ISBN match (normalized, no dashes): return 0.95
 * - Exact title match (case-insensitive, normalized): +0.4
 * - Partial title containment: +0.2
 * - Author last name match: +0.3
 * - Year within ±2: +0.2
 * - Cap at 1.0
 */
export function scoreMatch(
  local: { title: string; author: string; isbn?: string },
  candidate: ExternalBook,
  localYear?: number
): number {
  // ISBN match is a strong signal — return immediately
  if (
    local.isbn &&
    candidate.isbn &&
    normalizeIsbn(local.isbn) === normalizeIsbn(candidate.isbn)
  ) {
    return 0.95;
  }

  let score = 0;

  const localTitle = normalizeTitle(local.title);
  const candidateTitle = normalizeTitle(candidate.title);

  if (localTitle === candidateTitle) {
    score += 0.4;
  } else if (
    candidateTitle.includes(localTitle) ||
    localTitle.includes(candidateTitle)
  ) {
    score += 0.2;
  }

  if (local.author && candidate.author) {
    const localLast = extractLastName(local.author);
    const candidateLast = extractLastName(candidate.author);
    if (localLast === candidateLast) {
      score += 0.3;
    }
  }

  if (localYear != null && candidate.year != null) {
    if (Math.abs(localYear - candidate.year) <= 2) {
      score += 0.2;
    }
  }

  return Math.min(score, 1.0);
}

/**
 * Deduplicate results by ISBN. When two results share the same ISBN:
 * - Prefer Google covers over Open Library covers
 * - Keep the highest confidence score
 * Results without ISBN are kept as-is.
 * Final list is sorted by confidence descending.
 */
export function deduplicateResults(results: ExternalBook[]): ExternalBook[] {
  const byIsbn = new Map<string, ExternalBook>();
  const noIsbn: ExternalBook[] = [];

  for (const result of results) {
    if (!result.isbn) {
      noIsbn.push(result);
      continue;
    }

    const key = normalizeIsbn(result.isbn);
    const existing = byIsbn.get(key);

    if (!existing) {
      byIsbn.set(key, result);
    } else {
      // Merge: keep highest confidence, prefer Google covers
      const merged: ExternalBook = {
        ...existing,
        confidence: Math.max(existing.confidence, result.confidence),
      };

      // Prefer Goodreads cover (Amazon-hosted), then Google
      const preferred =
        [result, existing].find((r) => r.source === "goodreads" && r.coverUrl) ??
        [result, existing].find((r) => r.source === "google" && r.coverUrl);
      if (preferred?.coverUrl) {
        merged.coverUrl = preferred.coverUrl;
      }

      byIsbn.set(key, merged);
    }
  }

  const all = [...byIsbn.values(), ...noIsbn];
  all.sort((a, b) => b.confidence - a.confidence);
  return all;
}

/**
 * Search Google Books API. Returns [] on any error.
 */
export async function searchGoogleBooks(
  query: string,
  isbn?: string
): Promise<ExternalBook[]> {
  try {
    const q = isbn ? `isbn:${isbn}` : encodeURIComponent(query);
    const url = `https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=5`;
    const response = await fetch(url);
    if (!response.ok) return [];

    const data = (await response.json()) as {
      totalItems?: number;
      items?: Array<{
        id: string;
        volumeInfo: {
          title?: string;
          authors?: string[];
          publisher?: string;
          publishedDate?: string;
          description?: string;
          industryIdentifiers?: Array<{
            type: string;
            identifier: string;
          }>;
          categories?: string[];
          pageCount?: number;
          language?: string;
          imageLinks?: {
            thumbnail?: string;
          };
        };
      }>;
    };

    if (!data.items) return [];

    return data.items.map((item): ExternalBook => {
      const info = item.volumeInfo;

      // Prefer ISBN_13, fall back to ISBN_10
      const isbn13 = info.industryIdentifiers?.find(
        (id) => id.type === "ISBN_13"
      );
      const isbn10 = info.industryIdentifiers?.find(
        (id) => id.type === "ISBN_10"
      );
      const extractedIsbn = isbn13?.identifier ?? isbn10?.identifier;

      // Extract year from publishedDate (could be "2020", "2020-01", "2020-01-15")
      const year = info.publishedDate
        ? parseInt(info.publishedDate.substring(0, 4), 10) || undefined
        : undefined;

      // Get cover URL, replace http with https
      let coverUrl = info.imageLinks?.thumbnail;
      if (coverUrl) {
        coverUrl = coverUrl.replace(/^http:/, "https:");
      }

      return {
        source: "google",
        sourceId: item.id,
        title: info.title ?? "",
        author: info.authors?.join(", ") ?? "",
        isbn: extractedIsbn,
        publisher: info.publisher,
        year,
        description: info.description,
        genre: info.categories?.[0],
        language: info.language,
        pageCount: info.pageCount,
        coverUrl,
        confidence: 0,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Search Open Library API. Returns [] on any error.
 */
export async function searchOpenLibrary(
  query: string,
  isbn?: string
): Promise<ExternalBook[]> {
  try {
    const url = isbn
      ? `https://openlibrary.org/search.json?isbn=${encodeURIComponent(isbn)}&limit=5`
      : `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=5`;
    const response = await fetch(url);
    if (!response.ok) return [];

    const data = (await response.json()) as {
      docs?: Array<{
        key: string;
        title?: string;
        author_name?: string[];
        publisher?: string[];
        first_publish_year?: number;
        isbn?: string[];
        cover_i?: number;
        subject?: string[];
        language?: string[];
        number_of_pages_median?: number;
      }>;
    };

    if (!data.docs) return [];

    return data.docs.slice(0, 5).map((doc): ExternalBook => {
      const coverUrl = doc.cover_i
        ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`
        : undefined;

      // Prefer ISBN-13 (length 13) if available
      const isbn13 = doc.isbn?.find((i) => i.length === 13);
      const extractedIsbn = isbn13 ?? doc.isbn?.[0];

      return {
        source: "openlibrary",
        sourceId: doc.key,
        title: doc.title ?? "",
        author: doc.author_name?.join(", ") ?? "",
        isbn: extractedIsbn,
        publisher: doc.publisher?.[0],
        year: doc.first_publish_year,
        genre: doc.subject?.[0],
        language: doc.language?.[0],
        pageCount: doc.number_of_pages_median,
        coverUrl,
        confidence: 0,
      };
    });
  } catch {
    return [];
  }
}

const GR_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * Search Goodreads by scraping search results, then fetching book pages for JSON-LD.
 * Returns [] on any error.
 */
export async function searchGoodreads(
  query: string,
  isbn?: string
): Promise<ExternalBook[]> {
  try {
    const q = isbn || query;
    const searchUrl = `https://www.goodreads.com/search?q=${encodeURIComponent(q)}&search_type=books`;
    const searchRes = await fetch(searchUrl, {
      headers: { "User-Agent": GR_USER_AGENT },
      redirect: "follow",
    });
    if (!searchRes.ok) return [];

    const html = await searchRes.text();

    // If ISBN search redirected to a book page, the JSON-LD is right there
    const finalUrl = searchRes.url;
    if (finalUrl.includes("/book/show/")) {
      const book = parseGoodreadsBookPage(html, finalUrl);
      return book ? [book] : [];
    }

    // Parse search results for book URLs
    const bookUrls: string[] = [];
    const urlRegex = /\/book\/show\/[\w-]+/g;
    let match;
    while ((match = urlRegex.exec(html)) !== null) {
      const url = `https://www.goodreads.com${match[0].split("?")[0]}`;
      if (!bookUrls.includes(url)) bookUrls.push(url);
      if (bookUrls.length >= 3) break;
    }

    if (bookUrls.length === 0) return [];

    // Fetch book pages in parallel (limit to 3)
    const bookPages = await Promise.all(
      bookUrls.map(async (url) => {
        try {
          const res = await fetch(url, {
            headers: { "User-Agent": GR_USER_AGENT },
            redirect: "follow",
          });
          if (!res.ok) return null;
          const pageHtml = await res.text();
          return parseGoodreadsBookPage(pageHtml, url);
        } catch {
          return null;
        }
      })
    );

    return bookPages.filter((b): b is ExternalBook => b !== null);
  } catch {
    return [];
  }
}

/** Parse a Goodreads book page for JSON-LD and additional metadata. */
function parseGoodreadsBookPage(html: string, url: string): ExternalBook | null {
  // Extract JSON-LD
  const ldMatch = html.match(
    /<script type="application\/ld\+json">([^<]+)<\/script>/
  );
  if (!ldMatch) return null;

  let ld: any;
  try {
    ld = JSON.parse(ldMatch[1]);
  } catch {
    return null;
  }

  if (ld["@type"] !== "Book") return null;

  // Extract title — remove series suffix like "(Series Name, #1)"
  let title = ld.name ?? "";
  const seriesMatch = title.match(/^(.+?)\s*\(([^,]+),\s*#(\d+)\)$/);
  let series: string | undefined;
  let seriesIndex: number | undefined;
  if (seriesMatch) {
    title = seriesMatch[1].trim();
    series = seriesMatch[2].trim();
    seriesIndex = parseInt(seriesMatch[3], 10) || undefined;
  }

  // Authors — only the first person (subsequent ones are typically translators/editors)
  const authors = Array.isArray(ld.author) ? ld.author : ld.author ? [ld.author] : [];
  const firstAuthor = authors.find((a: any) => a["@type"] === "Person");
  const author = firstAuthor?.name ?? "";

  // Extract year from "First published ..." text
  const yearMatch = html.match(/First published\s+\w+\s+\d+,\s+(\d{4})/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;

  // Extract description from the page
  let description: string | undefined;
  const descMatch = html.match(
    /data-testid="contentContainer"[^>]*><div[^>]*><div[^>]*><span class="Formatted">([^]*?)<\/span>/
  );
  if (descMatch) {
    description = descMatch[1]
      .replace(/<br\s*\/?>/g, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
  }

  // Extract genres
  const genreMatches = html.match(
    /BookPageMetadataSection__genreButton[^>]*><a[^>]*><span[^>]*>([^<]+)<\/span>/g
  );
  const genres = genreMatches
    ? genreMatches
        .map((m) => {
          const inner = m.match(/>([^<]+)<\/span>$/);
          return inner ? inner[1] : "";
        })
        .filter(Boolean)
    : [];
  const genre = genres[0];

  // Extract sourceId from URL
  const idMatch = url.match(/\/book\/show\/(\d+)/);
  const sourceId = idMatch ? idMatch[1] : url;

  return {
    source: "goodreads",
    sourceId,
    title,
    author,
    isbn: ld.isbn,
    year,
    description,
    genre,
    language: ld.inLanguage,
    pageCount: ld.numberOfPages ? parseInt(ld.numberOfPages, 10) : undefined,
    coverUrl: ld.image,
    series,
    seriesIndex,
    confidence: 0,
  };
}

/**
 * Search all APIs in parallel, score all results, deduplicate, and return sorted.
 */
export async function searchExternalMetadata(
  bookQuery: { title: string; author: string; isbn?: string },
  localYear?: number
): Promise<ExternalBook[]> {
  const query = `${bookQuery.title} ${bookQuery.author}`.trim();

  const [googleResults, openLibraryResults, goodreadsResults] = await Promise.all([
    searchGoogleBooks(query, bookQuery.isbn),
    searchOpenLibrary(query, bookQuery.isbn),
    searchGoodreads(query, bookQuery.isbn),
  ]);

  const allResults = [...googleResults, ...openLibraryResults, ...goodreadsResults];

  // Score each result
  for (const result of allResults) {
    result.confidence = scoreMatch(bookQuery, result, localYear);
  }

  return deduplicateResults(allResults);
}
