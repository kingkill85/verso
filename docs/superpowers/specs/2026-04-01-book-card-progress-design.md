# Book Card Progress Indicators — Design Spec

**Date:** 2026-04-01
**Scope:** Show reading progress bar and finished badge on book cards and book detail cover.

---

## 1. Data Layer

### New tRPC endpoint: `progress.allForUser`

Returns all reading progress for the authenticated user as an array:

```typescript
{ bookId: string; percentage: number; finishedAt: string | null }[]
```

No input params — returns everything for the current user. Lightweight query (one SELECT from `reading_progress` table filtered by `userId`).

### New React hook: `useReadingProgress()`

Calls `trpc.progress.allForUser.useQuery()` once. Caches via React Query (shared across all components on the page).

Returns:
```typescript
{
  getProgress: (bookId: string) => { percentage: number; finishedAt: string | null } | null;
}
```

`BookCard` and the book detail page call this hook internally — no prop changes needed on any parent component.

---

## 2. Book Card Indicators

### Progress bar (reading in progress)

- **Shown when:** `percentage > 0` AND `finishedAt` is null
- **Position:** Overlays the very bottom edge of the cover image
- **Size:** 3px tall, full width of cover
- **Background:** `rgba(0,0,0,0.4)` (dark track)
- **Fill:** `var(--warm)` (the app's accent color), width = percentage
- **No percentage text** — bar only
- **Corners:** Bottom corners match cover's border-radius

### Finished badge

- **Shown when:** `finishedAt` is not null
- **Position:** Top-right corner of cover image, 6px inset
- **Size:** 20px circle
- **Style:** Subtle/muted — `rgba(255,255,255,0.15)` background, blends with the app's dark theme. NOT bright green.
- **Icon:** Lucide `Check` at 12px, color `rgba(255,255,255,0.7)`

### No progress

Nothing shown — card looks exactly as it does now.

---

## 3. Book Detail Hero

Same finished badge on the cover image in the hero card:
- Same position (top-right corner, 6px inset)
- Same subtle style
- Same 20px size

The progress bar is NOT shown on the detail page cover — the detail page already has a dedicated progress section below the hero.

---

## 4. Files to Modify

| File | Changes |
|------|---------|
| `packages/server/src/trpc/routers/progress.ts` | Add `allForUser` query |
| `packages/web/src/hooks/use-reading-progress.ts` | New hook wrapping the tRPC query |
| `packages/web/src/components/books/book-card.tsx` | Add progress bar + finished badge using the hook |
| `packages/web/src/components/books/book-cover.tsx` | Add optional finished badge overlay (used by detail hero) |
| `packages/web/src/routes/_app/books/$id.tsx` | Pass finished state to BookCover in hero |
