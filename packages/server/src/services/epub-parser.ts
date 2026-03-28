import { EPub } from "epub2";
import * as yauzl from "yauzl-promise";

export type ParsedMetadata = {
  title: string;
  author: string;
  isbn?: string;
  publisher?: string;
  year?: number;
  language?: string;
  description?: string;
  genre?: string;
  pageCount?: number;
  tags?: string[];
  coverData?: Buffer;
  coverMimeType?: string;
  series?: string;
  seriesIndex?: number;
};

/**
 * Strip HTML tags from a string, returning plain text.
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract a 4-digit year from a date string.
 * Handles ISO dates, plain years like "1925", and other formats.
 */
export function extractYear(dateStr: string): number | undefined {
  if (!dateStr) return undefined;

  // Try standard Date parsing first
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    return parsed.getFullYear();
  }

  // Fallback: extract 4-digit year via regex
  const match = dateStr.match(/\b(\d{4})\b/);
  if (match) {
    const year = parseInt(match[1], 10);
    if (year >= 1000 && year <= 9999) {
      return year;
    }
  }

  return undefined;
}

/**
 * Extract ISBN from metadata, checking multiple sources.
 */
export function extractIsbn(metadata: Record<string, unknown>): string | undefined {
  // Direct ISBN field
  if (metadata.ISBN && typeof metadata.ISBN === "string") {
    return metadata.ISBN.trim();
  }

  // Scan string values for ISBN-like patterns (ISBN-10 or ISBN-13)
  const isbnPattern = /(?:97[89][-\s]?)?(?:\d[-\s]?){9}[\dXx]/;
  for (const value of Object.values(metadata)) {
    if (typeof value === "string") {
      const match = value.match(isbnPattern);
      if (match) {
        return match[0].replace(/[-\s]/g, "");
      }
    }
  }

  return undefined;
}

/**
 * Extract series name and index from epub metadata.
 * Checks calibre metadata and EPUB3 belongs-to-collection.
 */
export function extractSeries(metadata: Record<string, unknown>): {
  series?: string;
  seriesIndex?: number;
} {
  let series: string | undefined;
  let seriesIndex: number | undefined;

  // Strategy 1: calibre:series (epub2 parses this into metadata.series and metadata['calibre:series'])
  const calibreSeries = metadata["calibre:series"] || metadata["series"];
  if (typeof calibreSeries === "string" && calibreSeries.trim()) {
    series = calibreSeries.trim();
  }

  const calibreIndex = metadata["calibre:series_index"];
  if (calibreIndex !== undefined) {
    const idx = parseFloat(String(calibreIndex));
    if (!isNaN(idx)) {
      seriesIndex = idx;
    }
  }

  // Strategy 2: EPUB3 belongs-to-collection / group-position
  if (!series) {
    const collection = metadata["belongs-to-collection"];
    if (typeof collection === "string" && collection.trim()) {
      series = collection.trim();
    }
  }

  if (seriesIndex === undefined) {
    const position = metadata["group-position"];
    if (position !== undefined) {
      const idx = parseFloat(String(position));
      if (!isNaN(idx)) {
        seriesIndex = idx;
      }
    }
  }

  return { series, seriesIndex };
}

/**
 * Try to find cover image data from the epub manifest.
 */
async function extractCover(
  epub: InstanceType<typeof EPub>
): Promise<{ coverData?: Buffer; coverMimeType?: string }> {
  // Strategy 1: Direct manifest lookup by cover ID from metadata
  const coverId = epub.metadata.cover;
  if (coverId && epub.manifest[coverId]) {
    try {
      const [data, mimeType] = await epub.getImageAsync(coverId);
      return { coverData: Buffer.from(data), coverMimeType: mimeType };
    } catch {
      // Fall through to next strategy
    }
  }

  // Strategy 2: Look for manifest items with properties="cover-image" or id containing "cover" with image mime type
  for (const [id, item] of Object.entries(epub.manifest)) {
    const manifestItem = item as Record<string, string>;
    const mediaType = manifestItem["media-type"] || manifestItem.mediaType || "";
    const properties = manifestItem.properties || "";

    const isImage = mediaType.startsWith("image/");

    if (properties.includes("cover-image") && isImage) {
      try {
        const [data, mimeType] = await epub.getImageAsync(id);
        return { coverData: Buffer.from(data), coverMimeType: mimeType };
      } catch {
        // Continue searching
      }
    }
  }

  // Strategy 3: Look for manifest items with id containing "cover" and image mime type
  for (const [id, item] of Object.entries(epub.manifest)) {
    const manifestItem = item as Record<string, string>;
    const mediaType = manifestItem["media-type"] || manifestItem.mediaType || "";
    const isImage = mediaType.startsWith("image/");

    if (isImage && id.toLowerCase().includes("cover")) {
      try {
        const [data, mimeType] = await epub.getImageAsync(id);
        return { coverData: Buffer.from(data), coverMimeType: mimeType };
      } catch {
        // Continue searching
      }
    }
  }

  // Strategy 4: If there's exactly one image in the manifest, assume it's the cover
  const imageItems = Object.entries(epub.manifest).filter(([, item]) => {
    const manifestItem = item as Record<string, string>;
    const mediaType = manifestItem["media-type"] || manifestItem.mediaType || "";
    return mediaType.startsWith("image/");
  });

  if (imageItems.length === 1) {
    const [id] = imageItems[0];
    try {
      const [data, mimeType] = await epub.getImageAsync(id);
      return { coverData: Buffer.from(data), coverMimeType: mimeType };
    } catch {
      // Fall through to zip scan
    }
  }

  return {};
}

/**
 * Last-resort cover extraction: scan the zip directly for files with "cover" in the name.
 * Handles EPUBs with malformed manifest hrefs (e.g. doubled directory prefixes).
 */
async function extractCoverFromZip(
  filePath: string,
): Promise<{ coverData?: Buffer; coverMimeType?: string }> {
  try {
    const zipFile = await yauzl.open(filePath);
    try {
      for await (const entry of zipFile) {
        const name = entry.filename.toLowerCase();
        if (name.includes("cover") && /\.(jpe?g|png|gif)$/.test(name)) {
          const stream = await entry.openReadStream();
          const chunks: Buffer[] = [];
          for await (const chunk of stream) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          }
          const data = Buffer.concat(chunks);
          const mimeType = name.endsWith(".png") ? "image/png" : "image/jpeg";
          return { coverData: data, coverMimeType: mimeType };
        }
      }
    } finally {
      await zipFile.close();
    }
  } catch {
    // Zip scan failed
  }
  return {};
}

export async function parseEpub(filePath: string): Promise<ParsedMetadata> {
  const epub = await EPub.createAsync(filePath);
  const meta = epub.metadata as Record<string, unknown>;

  let { coverData, coverMimeType } = await extractCover(epub);

  // Fallback: scan zip directly for cover files (handles malformed manifest hrefs)
  if (!coverData) {
    ({ coverData, coverMimeType } = await extractCoverFromZip(filePath));
  }

  const year = extractYear(String(meta.date || ""));
  const isbn = extractIsbn(meta);
  const { series, seriesIndex } = extractSeries(meta);

  // Description may contain HTML tags — strip them
  let description: string | undefined;
  if (meta.description && typeof meta.description === "string") {
    description = stripHtml(meta.description) || undefined;
  }

  // Subject can be a string or an array — use first as genre, rest as tags
  let genre: string | undefined;
  let tags: string[] | undefined;
  if (meta.subject) {
    if (Array.isArray(meta.subject)) {
      const subjects = meta.subject.filter((s): s is string => typeof s === "string" && s.trim() !== "");
      genre = subjects[0] || undefined;
      if (subjects.length > 1) {
        tags = subjects.slice(1);
      }
    } else if (typeof meta.subject === "string") {
      genre = meta.subject || undefined;
    }
  }

  return {
    title: (typeof meta.title === "string" && meta.title.trim()) || "Untitled",
    author:
      (typeof meta.creator === "string" && meta.creator.trim()) ||
      "Unknown Author",
    isbn,
    publisher:
      typeof meta.publisher === "string" ? meta.publisher.trim() || undefined : undefined,
    year,
    language:
      typeof meta.language === "string" ? meta.language.trim() || undefined : undefined,
    description,
    genre,
    tags,
    coverData,
    coverMimeType,
    series,
    seriesIndex,
  };
}
