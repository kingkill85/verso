import { XMLBuilder } from "fast-xml-parser";
import { eq, and, isNotNull, like, or, sql } from "drizzle-orm";
import { books, shelves, shelfBooks } from "@verso/shared";
import type { AppDatabase } from "../db/client.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type FeedLink = {
  rel: string;
  href: string;
  type: string;
};

export type FeedEntry = {
  id: string;
  title: string;
  updated: string;
  author?: string;
  summary?: string;
  content?: string;
  links: FeedLink[];
};

export type OpdsFeed = {
  type: "navigation" | "acquisition";
  id: string;
  title: string;
  updated: string;
  selfUrl: string;
  entries: FeedEntry[];
  nextUrl?: string;
  prevUrl?: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;
const BASE_URL = "/opds";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Converts a book DB row to an acquisition feed FeedEntry. */
function bookToEntry(book: typeof books.$inferSelect): FeedEntry {
  const links: FeedLink[] = [];

  // Determine MIME type from file format
  const mimeType =
    book.fileFormat === "epub"
      ? "application/epub+zip"
      : book.fileFormat === "pdf"
        ? "application/pdf"
        : "application/octet-stream";

  links.push({
    rel: "http://opds-spec.org/acquisition",
    href: `/api/books/${book.id}/file`,
    type: mimeType,
  });

  if (book.coverPath) {
    links.push({
      rel: "http://opds-spec.org/image",
      href: `/api/covers/${book.id}`,
      type: "image/jpeg",
    });
  }

  return {
    id: book.id,
    title: book.title,
    updated: book.updatedAt,
    author: book.author,
    summary: book.description ?? undefined,
    links,
  };
}

/** Creates a navigation entry pointing to an acquisition feed. */
function navEntry(id: string, title: string, href: string, content?: string): FeedEntry {
  return {
    id,
    title,
    updated: new Date().toISOString(),
    content,
    links: [
      {
        rel: "subsection",
        href,
        type: "application/atom+xml;profile=opds-catalog;kind=acquisition",
      },
    ],
  };
}

/** Creates a navigation entry pointing to another navigation feed. */
function navFeedEntry(id: string, title: string, href: string, content?: string): FeedEntry {
  return {
    id,
    title,
    updated: new Date().toISOString(),
    content,
    links: [
      {
        rel: "subsection",
        href,
        type: "application/atom+xml;profile=opds-catalog;kind=navigation",
      },
    ],
  };
}

/** Paginates an array and computes next/prev URLs. */
function paginate<T>(
  items: T[],
  page: number,
  baseUrl: string
): { items: T[]; nextUrl?: string; prevUrl?: string } {
  const start = (page - 1) * PAGE_SIZE;
  const sliced = items.slice(start, start + PAGE_SIZE);
  const nextUrl =
    start + PAGE_SIZE < items.length
      ? `${baseUrl}?page=${page + 1}`
      : undefined;
  const prevUrl = page > 1 ? `${baseUrl}?page=${page - 1}` : undefined;
  return { items: sliced, nextUrl, prevUrl };
}

// ─── Feed Builders ────────────────────────────────────────────────────────────

/** Root navigation feed with sections for All Books, Recently Added, Authors, Genres, Shelves. */
export async function buildRootFeed(db: AppDatabase, _userId: string): Promise<OpdsFeed> {
  const now = new Date().toISOString();
  return {
    type: "navigation",
    id: `${BASE_URL}/catalog`,
    title: "My Library",
    updated: now,
    selfUrl: `${BASE_URL}/catalog`,
    entries: [
      navEntry("all-books", "All Books", `${BASE_URL}/all`, "Browse all books in your library"),
      navEntry(
        "recently-added",
        "Recently Added",
        `${BASE_URL}/recent`,
        "Books recently added to your library"
      ),
      navFeedEntry("authors", "Authors", `${BASE_URL}/authors`, "Browse books by author"),
      navFeedEntry("genres", "Genres", `${BASE_URL}/genres`, "Browse books by genre"),
      navFeedEntry("shelves", "Shelves", `${BASE_URL}/shelves`, "Browse your shelves"),
    ],
  };
}

/** Paginated acquisition feed of all user's books. */
export async function buildAllBooks(
  db: AppDatabase,
  userId: string,
  page: number
): Promise<OpdsFeed> {
  const allBooks = await db.query.books.findMany({
    orderBy: (b, { desc }) => [desc(b.createdAt)],
  });

  const baseUrl = `${BASE_URL}/all`;
  const { items, nextUrl, prevUrl } = paginate(allBooks, page, baseUrl);

  return {
    type: "acquisition",
    id: baseUrl,
    title: "All Books",
    updated: new Date().toISOString(),
    selfUrl: page > 1 ? `${baseUrl}?page=${page}` : baseUrl,
    entries: items.map(bookToEntry),
    nextUrl,
    prevUrl,
  };
}

/** Recently added books (paginated). */
export async function buildRecentBooks(
  db: AppDatabase,
  userId: string,
  page: number
): Promise<OpdsFeed> {
  const allBooks = await db.query.books.findMany({
    orderBy: (b, { desc }) => [desc(b.createdAt)],
  });

  const baseUrl = `${BASE_URL}/recent`;
  const { items, nextUrl, prevUrl } = paginate(allBooks, page, baseUrl);

  return {
    type: "acquisition",
    id: baseUrl,
    title: "Recently Added",
    updated: new Date().toISOString(),
    selfUrl: page > 1 ? `${baseUrl}?page=${page}` : baseUrl,
    entries: items.map(bookToEntry),
    nextUrl,
    prevUrl,
  };
}

/** Navigation feed listing each author with book count. */
export async function buildAuthorsList(db: AppDatabase, userId: string): Promise<OpdsFeed> {
  const rows = await db
    .select({
      author: books.author,
      count: sql<number>`count(*)`.as("count"),
    })
    .from(books)
    .groupBy(books.author)
    .orderBy(books.author);

  const now = new Date().toISOString();
  const entries: FeedEntry[] = rows.map((row) => {
    const encodedAuthor = encodeURIComponent(row.author);
    return {
      id: `${BASE_URL}/author/${encodedAuthor}`,
      title: `${row.author} (${row.count})`,
      updated: now,
      links: [
        {
          rel: "subsection",
          href: `${BASE_URL}/author/${encodedAuthor}`,
          type: "application/atom+xml;profile=opds-catalog;kind=acquisition",
        },
      ],
    };
  });

  return {
    type: "navigation",
    id: `${BASE_URL}/authors`,
    title: "Authors",
    updated: now,
    selfUrl: `${BASE_URL}/authors`,
    entries,
  };
}

/** Paginated acquisition feed of books by a specific author. */
export async function buildAuthorBooks(
  db: AppDatabase,
  userId: string,
  author: string,
  page: number
): Promise<OpdsFeed> {
  const allBooks = await db.query.books.findMany({
    where: eq(books.author, author),
    orderBy: (b, { asc }) => [asc(b.title)],
  });

  const encodedAuthor = encodeURIComponent(author);
  const baseUrl = `${BASE_URL}/author/${encodedAuthor}`;
  const { items, nextUrl, prevUrl } = paginate(allBooks, page, baseUrl);

  return {
    type: "acquisition",
    id: baseUrl,
    title: `Books by ${author}`,
    updated: new Date().toISOString(),
    selfUrl: page > 1 ? `${baseUrl}?page=${page}` : baseUrl,
    entries: items.map(bookToEntry),
    nextUrl,
    prevUrl,
  };
}

/** Navigation feed listing each genre with book count (excludes null genres). */
export async function buildGenresList(db: AppDatabase, userId: string): Promise<OpdsFeed> {
  const rows = await db
    .select({
      genre: books.genre,
      count: sql<number>`count(*)`.as("count"),
    })
    .from(books)
    .where(isNotNull(books.genre))
    .groupBy(books.genre)
    .orderBy(books.genre);

  const now = new Date().toISOString();
  const entries: FeedEntry[] = rows
    .filter((row) => row.genre != null)
    .map((row) => {
      const genre = row.genre!;
      const encodedGenre = encodeURIComponent(genre);
      return {
        id: `${BASE_URL}/genre/${encodedGenre}`,
        title: `${genre} (${row.count})`,
        updated: now,
        links: [
          {
            rel: "subsection",
            href: `${BASE_URL}/genre/${encodedGenre}`,
            type: "application/atom+xml;profile=opds-catalog;kind=acquisition",
          },
        ],
      };
    });

  return {
    type: "navigation",
    id: `${BASE_URL}/genres`,
    title: "Genres",
    updated: now,
    selfUrl: `${BASE_URL}/genres`,
    entries,
  };
}

/** Paginated acquisition feed of books in a specific genre. */
export async function buildGenreBooks(
  db: AppDatabase,
  userId: string,
  genre: string,
  page: number
): Promise<OpdsFeed> {
  const allBooks = await db.query.books.findMany({
    where: eq(books.genre, genre),
    orderBy: (b, { asc }) => [asc(b.title)],
  });

  const encodedGenre = encodeURIComponent(genre);
  const baseUrl = `${BASE_URL}/genre/${encodedGenre}`;
  const { items, nextUrl, prevUrl } = paginate(allBooks, page, baseUrl);

  return {
    type: "acquisition",
    id: baseUrl,
    title: genre,
    updated: new Date().toISOString(),
    selfUrl: page > 1 ? `${baseUrl}?page=${page}` : baseUrl,
    entries: items.map(bookToEntry),
    nextUrl,
    prevUrl,
  };
}

/** Navigation feed listing user's shelves. */
export async function buildShelvesList(db: AppDatabase, userId: string): Promise<OpdsFeed> {
  const userShelves = await db.query.shelves.findMany({
    where: eq(shelves.userId, userId),
    orderBy: (s, { asc }) => [asc(s.position)],
  });

  const now = new Date().toISOString();
  const entries: FeedEntry[] = userShelves.map((shelf) => ({
    id: `${BASE_URL}/shelf/${shelf.id}`,
    title: shelf.name,
    updated: now,
    content: shelf.description ?? undefined,
    links: [
      {
        rel: "subsection",
        href: `${BASE_URL}/shelf/${shelf.id}`,
        type: "application/atom+xml;profile=opds-catalog;kind=acquisition",
      },
    ],
  }));

  return {
    type: "navigation",
    id: `${BASE_URL}/shelves`,
    title: "Shelves",
    updated: now,
    selfUrl: `${BASE_URL}/shelves`,
    entries,
  };
}

/** Paginated acquisition feed of books on a specific shelf. */
export async function buildShelfBooks(
  db: AppDatabase,
  userId: string,
  shelfId: string,
  page: number
): Promise<OpdsFeed> {
  // Join shelfBooks with books to get all books on this shelf owned by userId
  const rows = await db
    .select({ book: books })
    .from(shelfBooks)
    .innerJoin(books, eq(shelfBooks.bookId, books.id))
    .where(eq(shelfBooks.shelfId, shelfId))
    .orderBy(shelfBooks.position);

  const allBooks = rows.map((r) => r.book);
  const baseUrl = `${BASE_URL}/shelf/${shelfId}`;
  const { items, nextUrl, prevUrl } = paginate(allBooks, page, baseUrl);

  return {
    type: "acquisition",
    id: baseUrl,
    title: "Shelf",
    updated: new Date().toISOString(),
    selfUrl: page > 1 ? `${baseUrl}?page=${page}` : baseUrl,
    entries: items.map(bookToEntry),
    nextUrl,
    prevUrl,
  };
}

/** Paginated search results (LIKE on title or author). */
export async function buildSearchResults(
  db: AppDatabase,
  userId: string,
  query: string,
  page: number
): Promise<OpdsFeed> {
  const pattern = `%${query}%`;
  const allBooks = await db.query.books.findMany({
    where: or(like(books.title, pattern), like(books.author, pattern)),
    orderBy: (b, { asc }) => [asc(b.title)],
  });

  const baseUrl = `${BASE_URL}/search`;
  const { items, nextUrl, prevUrl } = paginate(allBooks, page, baseUrl);

  return {
    type: "acquisition",
    id: baseUrl,
    title: `Search: ${query}`,
    updated: new Date().toISOString(),
    selfUrl: baseUrl,
    entries: items.map(bookToEntry),
    nextUrl,
    prevUrl,
  };
}

// ─── XML Serializer ───────────────────────────────────────────────────────────

const xmlBuilder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  format: true,
  suppressEmptyNode: true,
});

/** Converts an OpdsFeed to an Atom XML string. */
export function serializeFeed(feed: OpdsFeed): string {
  const feedKind = feed.type === "navigation" ? "navigation" : "acquisition";
  const selfType = `application/atom+xml;profile=opds-catalog;kind=${feedKind}`;

  // Build feed-level links
  const feedLinks: object[] = [
    {
      "@_rel": "self",
      "@_href": feed.selfUrl,
      "@_type": selfType,
    },
    {
      "@_rel": "start",
      "@_href": `${BASE_URL}/catalog`,
      "@_type": "application/atom+xml;profile=opds-catalog;kind=navigation",
    },
    {
      "@_rel": "search",
      "@_href": `${BASE_URL}/search{?query}`,
      "@_type": "application/atom+xml;profile=opds-catalog;kind=acquisition",
    },
  ];

  if (feed.nextUrl) {
    feedLinks.push({
      "@_rel": "next",
      "@_href": feed.nextUrl,
      "@_type": selfType,
    });
  }

  if (feed.prevUrl) {
    feedLinks.push({
      "@_rel": "previous",
      "@_href": feed.prevUrl,
      "@_type": selfType,
    });
  }

  // Build entries
  const entries = feed.entries.map((entry) => {
    const entryLinks = entry.links.map((link) => ({
      "@_rel": link.rel,
      "@_href": link.href,
      "@_type": link.type,
    }));

    const obj: Record<string, unknown> = {
      id: entry.id,
      title: entry.title,
      updated: entry.updated,
      link: entryLinks,
    };

    if (entry.author) {
      obj["author"] = { name: entry.author };
    }

    if (entry.summary) {
      obj["summary"] = entry.summary;
    }

    if (entry.content) {
      obj["content"] = {
        "@_type": "text",
        "#text": entry.content,
      };
    }

    return obj;
  });

  const feedObj = {
    "?xml": { "@_version": "1.0", "@_encoding": "UTF-8" },
    feed: {
      "@_xmlns": "http://www.w3.org/2005/Atom",
      "@_xmlns:opds": "http://opds-spec.org/2010/catalog",
      "@_xmlns:dc": "http://purl.org/dc/terms/",
      id: feed.id,
      title: feed.title,
      updated: feed.updated,
      link: feedLinks,
      entry: entries.length > 0 ? entries : undefined,
    },
  };

  return xmlBuilder.build(feedObj) as string;
}
