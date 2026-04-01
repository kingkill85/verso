# Author Improvements — Design Spec

**Date:** 2026-04-01
**Scope:** Localized author descriptions, Wikidata/Wikipedia enrichment, admin editing, photo fixes, detail page improvements

---

## 1. Schema Changes

### New table: `authorDescriptions`

| Column          | Type    | Notes                                      |
|-----------------|---------|--------------------------------------------|
| authorId        | text    | FK → authors.id, cascade delete            |
| locale          | text    | e.g. "en", "de", "fr" (10 app locales)    |
| description     | text    | Bio content for this locale                |
| manuallyEdited  | boolean | Default false. True = admin override       |

**Primary key:** `(authorId, locale)`

### `authors` table changes

- **Drop** `description` column
- **Migration:** Move existing English descriptions into `authorDescriptions` with `locale = "en"` before dropping the column
- Keep `imagePath`, `birthDate`, `openLibraryKey` as-is

---

## 2. Enrichment — Wikidata/Wikipedia (with OpenLibrary Fallback)

### Primary source: Wikidata + Wikipedia

1. **Search Wikidata** for the author by name → get entity ID (e.g. Q42)
2. **Extract from Wikidata entity:**
   - Birth date
   - Wikimedia Commons image filename (for photo)
   - Wikipedia sitelinks (maps locale → article title, e.g. `enwiki` → "Douglas Adams", `dewiki` → "Douglas Adams")
3. **For each of the 10 app locales** (en, de, es, fr, it, nl, pt, zh, ja, ko):
   - Look up the sitelink for that locale's Wikipedia (e.g. `dewiki` for "de"). If no sitelink exists, skip.
   - Fetch Wikipedia page summary via REST API (`https://{locale}.wikipedia.org/api/rest_v1/page/summary/{title}`) — returns a short extract, not the full article
   - Store as a row in `authorDescriptions(authorId, locale, description)`
   - Skip locales where `manuallyEdited = true` (preserve admin overrides)
   - If no Wikipedia article exists for a locale, skip that locale (no row created)
4. **Download author photo** from Wikimedia Commons → store in `authors/{authorId}/photo.jpg` via storage driver
5. **Rate limiting:** 1-second delay between Wikipedia locale fetches

### Fallback: OpenLibrary

If Wikidata returns no results for the author:

1. Search OpenLibrary by name (existing logic)
2. Fetch metadata: English bio, birth date, photo URL
3. Store English bio as single `authorDescriptions` row with `locale = "en"`
4. Download photo if available
5. Update `authors` record with `openLibraryKey`, `birthDate`, `imagePath`

### Trigger

- **On first visit** to author detail page (if no descriptions exist) — background enrichment, same as current behavior
- **Manual refresh** via admin-only "Refresh Metadata" button on author detail page

---

## 3. Admin-Only Editing

### Edit modal (on author detail page)

Triggered by an "Edit" button visible only to admin users.

**Modal contents:**

- **Author name** — text input
- **Author photo** — current photo preview, upload button (file input), remove button
- **Bio/description** — locale tabs showing each locale that has content, plus ability to add a new locale. Textarea per tab.
- **Save / Cancel** buttons

### Manual edit behavior

- When an admin edits a description for a locale, set `manuallyEdited = true` on that row
- When enrichment refreshes, rows with `manuallyEdited = true` are skipped (admin overrides are preserved)
- If no row exists for a locale, the admin creates a new one (manuallyEdited = true)

### Photo upload

- **New endpoint:** `POST /api/authors/:id/photo` — multipart file upload, same pattern as `POST /api/covers/:id` for book covers
- **New endpoint:** `DELETE /api/authors/:id/photo` — remove the author photo
- Both endpoints are admin-only (check JWT role)

### tRPC mutations (admin-only)

- `authors.update` — update author name
- `authors.updateDescription` — update description for a specific `(authorId, locale)`, sets `manuallyEdited = true`
- `authors.refreshMetadata` — existing mutation, rewired to use Wikidata→OpenLibrary pipeline

---

## 4. Author Detail Page Improvements

### Header area

- Show actual author photo (160px) when `imagePath` exists; fall back to initials circle when no photo
- Display birth date below the name (if available)
- Bio displayed in the user's current i18n locale, falling back to English if their locale has no description

### Admin controls (visible only to admin users)

- "Edit" button → opens the edit modal
- "Refresh Metadata" button → triggers Wikidata/OpenLibrary re-enrichment

### No other changes

Book grid section stays as-is.

---

## 5. Locale Fallback Strategy

When displaying an author's description:

1. Try the user's current locale (e.g. "de")
2. Fall back to "en"
3. Fall back to any available locale
4. Show nothing if no descriptions exist

---

## 6. Author Cards

- Show author photo on cards when `imagePath` exists (already partially implemented, just needs working photos)
- No other card changes

---

## 7. i18n

All new UI strings (edit modal labels, refresh button, locale tab names, etc.) must be translated in all 10 locale files.
