import EPub from "epub2";

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
  coverData?: Buffer;
  coverMimeType?: string;
};

export async function parseEpub(filePath: string): Promise<ParsedMetadata> {
  const epub = await EPub.createAsync(filePath);

  let coverData: Buffer | undefined;
  let coverMimeType: string | undefined;

  const coverId = epub.metadata.cover;
  if (coverId && epub.manifest[coverId]) {
    try {
      const [data, mimeType] = await epub.getImageAsync(coverId);
      coverData = Buffer.from(data);
      coverMimeType = mimeType;
    } catch {
      // Cover extraction failed
    }
  }

  let year: number | undefined;
  if (epub.metadata.date) {
    const parsed = new Date(epub.metadata.date);
    if (!isNaN(parsed.getTime())) {
      year = parsed.getFullYear();
    }
  }

  let isbn: string | undefined;
  if (epub.metadata.ISBN) {
    isbn = epub.metadata.ISBN;
  }

  return {
    title: epub.metadata.title || "Untitled",
    author: epub.metadata.creator || "Unknown Author",
    isbn,
    publisher: epub.metadata.publisher || undefined,
    year,
    language: epub.metadata.language || undefined,
    description: epub.metadata.description || undefined,
    genre: epub.metadata.subject || undefined,
    coverData,
    coverMimeType,
  };
}
