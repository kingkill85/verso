import { XMLParser } from "fast-xml-parser";

export type OpdsNavigationEntry = {
  title: string;
  href: string;
  description?: string;
};

export type OpdsBookEntry = {
  id: string;
  title: string;
  author?: string;
  summary?: string;
  acquisitionUrl: string;
  coverUrl?: string;
  format?: string;
};

export type OpdsCatalog = {
  title: string;
  nextUrl?: string;
} & (
  | { type: "navigation"; entries: OpdsNavigationEntry[] }
  | { type: "acquisition"; entries: OpdsBookEntry[] }
);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (name) => ["entry", "link"].includes(name),
});

function asArray<T>(val: T | T[] | undefined): T[] {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

function getFormat(type: string): string | undefined {
  if (type.includes("epub")) return "epub";
  if (type.includes("pdf")) return "pdf";
  return undefined;
}

export function parseOpdsCatalog(xml: string): OpdsCatalog {
  const parsed = parser.parse(xml);
  const feed = parsed.feed;
  const title = feed.title || "Catalog";
  const entries = asArray(feed.entry);
  const feedLinks = asArray(feed.link);

  const nextLink = feedLinks.find((l: any) => l["@_rel"] === "next");
  const nextUrl = nextLink?.["@_href"];

  // Determine type: if any entry has an acquisition link, it's an acquisition feed
  const isAcquisition = entries.some((entry: any) => {
    const links = asArray(entry.link);
    return links.some((l: any) =>
      l["@_rel"]?.startsWith("http://opds-spec.org/acquisition")
    );
  });

  if (isAcquisition) {
    const bookEntries: OpdsBookEntry[] = entries.map((entry: any) => {
      const links = asArray(entry.link);
      const acqLink = links.find((l: any) =>
        l["@_rel"]?.startsWith("http://opds-spec.org/acquisition")
      );
      const imgLink = links.find((l: any) =>
        l["@_rel"] === "http://opds-spec.org/image"
      );

      const authorObj = entry.author;
      const author =
        authorObj?.name ??
        (typeof authorObj === "string" ? authorObj : undefined);

      return {
        id: entry.id || "",
        title: entry.title || "Untitled",
        author,
        summary: entry.summary || entry.content?.["#text"] || entry.content,
        acquisitionUrl: acqLink?.["@_href"] || "",
        coverUrl: imgLink?.["@_href"],
        format: acqLink ? getFormat(acqLink["@_type"] || "") : undefined,
      };
    });

    return { type: "acquisition", title, entries: bookEntries, nextUrl };
  }

  // Navigation feed
  const navEntries: OpdsNavigationEntry[] = entries.map((entry: any) => {
    const links = asArray(entry.link);
    const navLink = links.find(
      (l: any) =>
        l["@_rel"] === "subsection" ||
        l["@_type"]?.includes("opds-catalog")
    );
    return {
      title: entry.title || "Untitled",
      href: navLink?.["@_href"] || "",
      description:
        entry.content?.["#text"] || entry.content || undefined,
    };
  });

  return { type: "navigation", title, entries: navEntries, nextUrl };
}

export async function fetchOpdsCatalog(
  url: string,
  credentials?: { username: string; password: string }
): Promise<OpdsCatalog> {
  const headers: Record<string, string> = {};
  if (credentials) {
    const basic = Buffer.from(
      `${credentials.username}:${credentials.password}`
    ).toString("base64");
    headers["Authorization"] = `Basic ${basic}`;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(
      `OPDS fetch failed: ${response.status} ${response.statusText}`
    );
  }

  const xml = await response.text();
  const catalog = parseOpdsCatalog(xml);

  // Resolve relative URLs
  const baseUrl = new URL(url);
  const resolveUrl = (href: string) => {
    try {
      return new URL(href, baseUrl).toString();
    } catch {
      return href;
    }
  };

  if (catalog.nextUrl) catalog.nextUrl = resolveUrl(catalog.nextUrl);

  if (catalog.type === "navigation") {
    catalog.entries.forEach((e) => {
      e.href = resolveUrl(e.href);
    });
  } else {
    catalog.entries.forEach((e) => {
      e.acquisitionUrl = resolveUrl(e.acquisitionUrl);
      if (e.coverUrl) e.coverUrl = resolveUrl(e.coverUrl);
    });
  }

  return catalog;
}

export async function downloadBook(
  url: string,
  credentials?: { username: string; password: string }
): Promise<{ buffer: Buffer; contentType: string }> {
  const headers: Record<string, string> = {};
  if (credentials) {
    const basic = Buffer.from(
      `${credentials.username}:${credentials.password}`
    ).toString("base64");
    headers["Authorization"] = `Basic ${basic}`;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType =
    response.headers.get("content-type") || "application/octet-stream";
  return { buffer, contentType };
}
