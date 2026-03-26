import type { ExternalBook } from "@verso/shared";
import { Impit } from "impit";

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
    const apiKey = process.env.GOOGLE_BOOKS_API_KEY;
    const keyParam = apiKey ? `&key=${apiKey}` : "";
    const url = `https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=5${keyParam}`;
    const client = new Impit({ browser: "chrome" });
    const response = await client.fetch(url);
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

// Read-only Goodreads API key from LazyLibrarian (Goodreads stopped issuing new keys Dec 2020)
const GR_API_KEY = "ckvsiSDsuqh7omh74ZZ6Q";

/**
 * Search Goodreads via XML API (more reliable than scraping). Returns [] on error.
 */
async function searchGoodreadsApi(
  query: string,
  isbn?: string
): Promise<ExternalBook[]> {
  try {
    const q = isbn || query;
    const searchUrl = `https://www.goodreads.com/search/index.xml?key=${GR_API_KEY}&q=${encodeURIComponent(q)}`;
    const res = await fetch(searchUrl);
    if (!res.ok) return [];
    const xml = await res.text();

    // Extract book IDs from search results
    const bookIds: string[] = [];
    const idRegex = /<best_book[^>]*>[\s\S]*?<id[^>]*>(\d+)<\/id>/g;
    let match;
    while ((match = idRegex.exec(xml)) !== null) {
      bookIds.push(match[1]);
      if (bookIds.length >= 3) break;
    }

    if (bookIds.length === 0) return [];

    // Fetch full details for each book
    const results = await Promise.all(
      bookIds.map(async (bookId) => {
        try {
          const detailUrl = `https://www.goodreads.com/book/show/${bookId}.xml?key=${GR_API_KEY}`;
          const detailRes = await fetch(detailUrl);
          if (!detailRes.ok) return null;
          return parseGoodreadsXml(await detailRes.text(), bookId);
        } catch { return null; }
      })
    );

    return results.filter((r): r is ExternalBook => r !== null);
  } catch {
    return [];
  }
}

/** Parse Goodreads book detail XML into ExternalBook */
function parseGoodreadsXml(xml: string, bookId: string): ExternalBook | null {
  const tag = (name: string) => {
    const m = xml.match(new RegExp(`<${name}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${name}>`));
    return m ? m[1].trim() : undefined;
  };

  const title = tag("title");
  if (!title) return null;

  // Parse series from title "Title (Series, #N)"
  let cleanTitle = title;
  let series: string | undefined;
  let seriesIndex: number | undefined;
  const seriesMatch = title.match(/^(.+?)\s*\(([^,]+),\s*#(\d+)\)$/);
  if (seriesMatch) {
    cleanTitle = seriesMatch[1].trim();
    series = seriesMatch[2].trim();
    seriesIndex = parseInt(seriesMatch[3], 10) || undefined;
  }

  // Also try series_works section for series name
  if (!series) {
    const seriesTitle = xml.match(/<series>[\s\S]*?<title>[\s\S]*?(?:<!\[CDATA\[)?\s*([^\]<]+)/);
    if (seriesTitle) series = seriesTitle[1].trim();
    const seriesPos = xml.match(/<user_position>(\d+)<\/user_position>/);
    if (seriesPos) seriesIndex = parseInt(seriesPos[1], 10) || undefined;
  }

  // First author only (skip translators)
  const authorMatch = xml.match(/<authors>\s*<author>[\s\S]*?<name>(?:<!\[CDATA\[)?([^\]<]+)/);
  const author = authorMatch ? authorMatch[1].trim() : "";

  // Description — strip HTML
  let description = tag("description");
  if (description) {
    description = description
      .replace(/<br\s*\/?>/g, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .trim();
  }

  const isbn13 = tag("isbn13");
  const isbn10 = tag("isbn");

  // Cover — strip size suffix for larger image
  let coverUrl = tag("image_url");
  if (coverUrl && !coverUrl.includes("nophoto")) {
    coverUrl = coverUrl.replace(/\._[A-Z]+\d+_\./, ".");
  } else {
    coverUrl = undefined;
  }

  const yearStr = xml.match(/<original_publication_year[^>]*>(\d+)<\/original_publication_year>/);

  return {
    source: "goodreads",
    sourceId: bookId,
    title: cleanTitle,
    author,
    isbn: isbn13 || isbn10,
    publisher: tag("publisher"),
    year: yearStr ? parseInt(yearStr[1], 10) : undefined,
    description,
    language: tag("language_code"),
    pageCount: tag("num_pages") ? parseInt(tag("num_pages")!, 10) : undefined,
    coverUrl,
    series,
    seriesIndex,
    confidence: 0,
  };
}

/**
 * Search Amazon Kindle for high-res cover images. Returns [] on error.
 * Only provides: title, author, ASIN, cover URL. Metadata is sparse.
 */
export async function searchAmazonCovers(
  query: string,
): Promise<ExternalBook[]> {
  try {
    const searchUrl = `https://www.amazon.de/s?k=${encodeURIComponent(query)}&i=digital-text`;
    const client = new Impit({ browser: "chrome" });
    const res = await client.fetch(searchUrl);
    if (!res.ok) return [];
    const html = await res.text();

    // Extract results: ASIN, title, image
    const results: ExternalBook[] = [];
    // Find data-asin attributes
    const asinRegex = /data-asin="([A-Z0-9]{10})"/g;
    const asins = new Set<string>();
    let m;
    while ((m = asinRegex.exec(html)) !== null) {
      if (m[1] && m[1] !== "") asins.add(m[1]);
    }

    // For each ASIN, find the cover image nearby in the HTML
    for (const asin of asins) {
      if (results.length >= 3) break;
      // Find the image srcset for this result
      const asinSection = html.indexOf(`data-asin="${asin}"`);
      if (asinSection === -1) continue;
      const chunk = html.substring(asinSection, asinSection + 3000);

      // Extract image ID from srcset
      const imgMatch = chunk.match(/images\/I\/([A-Za-z0-9+_-]+)\._AC/);
      if (!imgMatch) continue;
      const imageId = imgMatch[1];
      const coverUrl = `https://m.media-amazon.com/images/I/${imageId}.jpg`;

      // Extract title from h2 aria-label
      const titleMatch = chunk.match(/<h2[^>]*aria-label="([^"]+)"/);
      let title = titleMatch ? titleMatch[1].trim() : undefined;
      if (!title) continue;
      // Clean up long Amazon subtitles — keep just the main title before first colon or pipe
      const colonIdx = title.indexOf(":");
      if (colonIdx > 0) title = title.substring(0, colonIdx).trim();

      results.push({
        source: "goodreads", // Amazon covers are used to upgrade other results
        sourceId: `asin:${asin}`,
        title,
        author: "",
        coverUrl,
        confidence: 0,
      });
    }

    return results;
  } catch {
    return [];
  }
}

/**
 * Search Goodreads: try XML API first, fall back to HTML scraping.
 * Returns [] on any error.
 */
export async function searchGoodreads(
  query: string,
  isbn?: string
): Promise<ExternalBook[]> {
  // Try API first (more reliable, structured data)
  const apiResults = await searchGoodreadsApi(query, isbn);
  if (apiResults.length > 0) return apiResults;

  // Fall back to HTML scraping
  return searchGoodreadsScrape(query, isbn);
}

/**
 * Search Goodreads by scraping search results, then fetching book pages for JSON-LD.
 * Fallback when the XML API fails. Returns [] on any error.
 */
async function searchGoodreadsScrape(
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
export function parseGoodreadsBookPage(html: string, url: string): ExternalBook | null {
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
 * Also fetches high-res covers from Amazon Kindle and upgrades matching results.
 */
export async function searchExternalMetadata(
  bookQuery: { title: string; author: string; isbn?: string },
  localYear?: number
): Promise<ExternalBook[]> {
  const query = `${bookQuery.title} ${bookQuery.author}`.trim();

  const [googleResults, openLibraryResults, goodreadsResults, amazonCovers] = await Promise.all([
    searchGoogleBooks(query, bookQuery.isbn),
    searchOpenLibrary(query, bookQuery.isbn),
    searchGoodreads(query, bookQuery.isbn),
    searchAmazonCovers(query),
  ]);

  const allResults = [...googleResults, ...openLibraryResults, ...goodreadsResults];

  // Score each result
  for (const result of allResults) {
    result.confidence = scoreMatch(bookQuery, result, localYear);
  }

  const deduplicated = deduplicateResults(allResults);

  // Upgrade covers: if Amazon has a high-res cover for the top result, use it
  if (amazonCovers.length > 0 && deduplicated.length > 0) {
    const bestCover = amazonCovers[0].coverUrl;
    if (bestCover) {
      // Apply Amazon's high-res cover to the top Goodreads/Google result if it has a low-res one
      for (const result of deduplicated) {
        if (result.coverUrl && result.coverUrl.includes("compressed.photo.goodreads")) {
          result.coverUrl = bestCover;
          break;
        }
      }
    }
  }

  return deduplicated;
}
