# Calibre CLI Integration

## Summary

Replace Verso's hand-rolled ebook parsing with Calibre's CLI tools. Adds multi-format upload support, EPUB cleanup, reliable metadata extraction, and online metadata search. Calibre is a hard requirement.

## CLI Tools Used

- **`ebook-convert`** — convert any format to EPUB (or PDF), also cleans malformed EPUBs via epub→epub conversion
- **`ebook-meta`** — extract metadata + cover from any ebook format (replaces epub2 library)
- **`fetch-ebook-metadata`** — search online sources (Google, Amazon, OpenLibrary) for metadata

## Upload Pipeline

### Ebook formats → EPUB
Formats: mobi, azw, azw3, fb2, cbz, cbr, epub

All ebook uploads go through Calibre conversion, even epub→epub, to produce a clean EPUB:
```
ebook-convert input.* output.epub --disable-font-rescaling --no-default-epub-cover
```

This fixes malformed EPUBs (broken manifest hrefs, invalid XML, missing cover metadata, doubled directory prefixes).

### Document formats → PDF
Formats: docx, rtf

```
ebook-convert input.* output.pdf
```

### PDF
Stays as PDF, no conversion needed.

### After conversion (all formats)
1. Extract metadata: `ebook-meta output.epub` (or .pdf) — parse stdout for title, author, ISBN, publisher, year, language, description, series, tags
2. Extract cover: `ebook-meta output.epub --get-cover /tmp/cover.jpg`
3. Store converted file + cover + metadata in DB
4. Delete temporary files

## Metadata Extraction

Replace `epub-parser.ts` (epub2 library) with `ebook-meta` CLI calls.

### Output format (stdout)
```
Title               : Dune
Author(s)           : Frank Herbert
Publisher           : Ace
Languages           : English
Published           : 1965-08-01
Identifiers         : isbn:9780441172719
Comments            : Set in the distant future...
Tags                : Science Fiction, Space Opera
Series              : Dune Chronicles #1
```

Parse key-value pairs with simple line splitting. Map to our `ParsedMetadata` type.

### Cover extraction
```
ebook-meta book.epub --get-cover /tmp/{bookId}-cover.jpg
```

Works for every format — epub, pdf, mobi, azw3, everything. No more broken epub2 cover extraction.

## Online Metadata Search

### Metadata text
Use `fetch-ebook-metadata` for structured data:
```
fetch-ebook-metadata --title "Dune" --authors "Herbert" -o
fetch-ebook-metadata --isbn "9780441172719" -o
```

The `-o` flag outputs OPF XML for reliable parsing.

### Cover options
Present two cover choices to the user:
1. **Calibre's cover** — from `fetch-ebook-metadata --cover /tmp/cover.jpg`
2. **Our high-res cover** — fetched from Amazon/Goodreads using ISBN/title from the Calibre result (existing logic in metadata-enrichment.ts that gets full-resolution images)

User sees both covers and picks which one to use when applying metadata.

## New Service

### `packages/server/src/services/calibre.ts`

```ts
// Startup check — fails if tools not found
verifyCalibreInstalled(): Promise<void>

// Format conversion
convertToEpub(inputPath: string, outputPath: string): Promise<void>
convertToPdf(inputPath: string, outputPath: string): Promise<void>

// Metadata extraction (replaces epub-parser.ts)
extractMetadata(filePath: string): Promise<ParsedMetadata>
extractCover(filePath: string, outputPath: string): Promise<boolean>

// Online metadata search (replaces parts of metadata-enrichment.ts)
searchMetadata(query: { title?: string, author?: string, isbn?: string }): Promise<CalibreMetadataResult[]>
searchCover(query: { title?: string, author?: string, isbn?: string }, outputPath: string): Promise<boolean>
```

All functions use `child_process.execFile` — no npm wrappers needed.

## Files Modified

- **Delete:** `packages/server/src/services/epub-parser.ts` — replaced by calibre.ts
- **Create:** `packages/server/src/services/calibre.ts` — new Calibre CLI wrapper
- **Modify:** `packages/server/src/routes/upload.ts` — accept all formats, run conversion pipeline
- **Modify:** `packages/server/src/routes/import.ts` — same for OPDS import
- **Modify:** `packages/server/src/trpc/routers/metadata.ts` — use calibre for search, present two cover options
- **Modify:** `packages/server/src/trpc/routers/books.ts` — update metadata extraction calls
- **Modify:** `packages/server/src/config.ts` — add CALIBRE_PATH env var
- **Modify:** `packages/server/src/app.ts` — verify calibre on startup
- **Modify:** `Dockerfile` — install Calibre CLI tools
- **Modify:** `packages/web/src/routes/_app/books/$id_.metadata.tsx` — show two cover options in UI

## Docker

Install Calibre in the runtime stage:
```dockerfile
RUN wget -nv -O- https://download.calibre-ebook.com/linux-installer.sh | sh /dev/stdin install_dir=/opt/calibre
ENV PATH="/opt/calibre:$PATH"
```

Adds ~300-400MB to image size. Calibre is monolithic — no CLI-only package exists.

## Development

- macOS: `brew install --cask calibre`
- CLI tools at `/Applications/calibre.app/Contents/MacOS/`
- Set `CALIBRE_PATH=/Applications/calibre.app/Contents/MacOS` in .env
- Server startup verifies tools are available, fails with clear error if not

## Supported Upload Formats

| Input Format | Converted To | Notes |
|---|---|---|
| EPUB | EPUB (cleaned) | epub→epub fixes malformed files |
| PDF | PDF (as-is) | metadata extracted via ebook-meta |
| MOBI | EPUB | Kindle format |
| AZW | EPUB | Kindle format |
| AZW3 | EPUB | Kindle KF8 format |
| FB2 | EPUB | Russian ebook format |
| CBZ | EPUB | Comic book zip |
| CBR | EPUB | Comic book rar |
| DOCX | PDF | Word documents |
| RTF | PDF | Rich text documents |

## Performance

- `ebook-meta` (metadata extraction): < 1 second
- `ebook-convert` (epub→epub cleanup): 1-3 seconds for typical books
- `ebook-convert` (mobi→epub): 1-5 seconds
- `fetch-ebook-metadata` (online search): up to 30 seconds (network dependent)

All acceptable for single uploads. For bulk OPDS imports, conversions run sequentially per book (already the case).

## Non-goals

- Using calibredb (Calibre's library database)
- Running Calibre's content server
- Calibre GUI integration
- Converting PDFs to EPUB (Calibre's own docs say PDF→EPUB produces poor results)
