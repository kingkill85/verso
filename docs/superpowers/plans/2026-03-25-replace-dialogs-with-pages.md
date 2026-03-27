# Replace Dialogs with Edit Pages — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all 3 modal dialogs (book edit, find metadata, shelf create/edit) with dedicated route pages.

**Architecture:** Create 3 new TanStack Router route files under `_app/`. Extract `SourceBadge` into its own file. Rewrite the book detail and shelf detail pages to use `<Link>` instead of dialog state. Rewrite the sidebar to link to `/shelves/new`.

**Tech Stack:** React, TanStack Router (file-based), TRPC, Tailwind CSS, CSS variables

**Spec:** `docs/superpowers/specs/2026-03-25-replace-dialogs-with-pages-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `routes/_app/books/$id_.edit.tsx` | Book edit page with integrated metadata search |
| Create | `routes/_app/shelves/new.tsx` | Shelf create page (thin wrapper around shared form) |
| Create | `routes/_app/shelves/$id_.edit.tsx` | Shelf edit page (thin wrapper around shared form) |
| Create | `components/shelves/shelf-form.tsx` | Shared shelf form used by both new and edit routes |
| Create | `components/metadata/source-badge.tsx` | Extracted from find-metadata-dialog.tsx |
| Modify | `routes/_app/books/$id.tsx` | Remove dialog state, use Link for edit/metadata |
| Modify | `routes/_app/shelves/$id.tsx` | Remove dialog state, use Link for edit |
| Modify | `components/layout/sidebar.tsx` | Change + button to Link |
| Delete | `components/books/book-edit-dialog.tsx` | Replaced by edit page |
| Delete | `components/metadata/find-metadata-dialog.tsx` | Merged into edit page |
| Delete | `components/shelves/shelf-dialog.tsx` | Replaced by shelf form + route pages |

All paths relative to `packages/web/src/`.

---

### Task 1: Extract SourceBadge

**Files:**
- Create: `packages/web/src/components/metadata/source-badge.tsx`

- [ ] **Step 1: Create SourceBadge component**

```tsx
// packages/web/src/components/metadata/source-badge.tsx
export function SourceBadge({ source }: { source: "google" | "openlibrary" }) {
  const isGoogle = source === "google";
  return (
    <span
      className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide"
      style={{
        backgroundColor: isGoogle ? "rgba(66,133,244,0.15)" : "rgba(34,197,94,0.15)",
        color: isGoogle ? "#4285F4" : "#22c55e",
      }}
    >
      {isGoogle ? "Google" : "Open Library"}
    </span>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/components/metadata/source-badge.tsx
git commit -m "refactor: extract SourceBadge into its own component"
```

---

### Task 2: Book Edit Page

**Files:**
- Create: `packages/web/src/routes/_app/books/$id_.edit.tsx`
- Reference: `packages/web/src/components/books/book-edit-dialog.tsx` (for field definitions and save logic)
- Reference: `packages/web/src/components/metadata/find-metadata-dialog.tsx` (for metadata search/apply flow)

This is the largest task. The page combines the edit dialog fields with the find metadata flow.

- [ ] **Step 1: Create the book edit route file**

The file uses `createFileRoute("/_app/books/$id_/edit")` matching the `$id_.read.tsx` convention.

```tsx
// packages/web/src/routes/_app/books/$id_.edit.tsx
import { useState, useEffect, useMemo } from "react";
import { createFileRoute, Link, useNavigate, useBlocker } from "@tanstack/react-router";
import { trpc } from "@/trpc";
import { BookCover } from "@/components/books/book-cover";
import { SourceBadge } from "@/components/metadata/source-badge";
import type { ExternalBook } from "@verso/shared";

export const Route = createFileRoute("/_app/books/$id_/edit")({
  validateSearch: (search: Record<string, unknown>): { metadata?: string } => ({
    metadata: typeof search.metadata === "string" ? search.metadata : undefined,
  }),
  component: BookEditPage,
});

// --- Field definitions (from book-edit-dialog.tsx) ---

const FIELDS: { key: string; label: string; type: "text" | "number" | "textarea"; half?: boolean; group: string }[] = [
  { key: "title", label: "Title", type: "text", group: "basic" },
  { key: "author", label: "Author", type: "text", group: "basic" },
  { key: "description", label: "Description", type: "textarea", group: "basic" },
  { key: "genre", label: "Genre", type: "text", group: "classification" },
  { key: "language", label: "Language", type: "text", group: "classification" },
  { key: "series", label: "Series", type: "text", half: true, group: "classification" },
  { key: "seriesIndex", label: "Series #", type: "number", half: true, group: "classification" },
  { key: "publisher", label: "Publisher", type: "text", group: "publication" },
  { key: "year", label: "Year", type: "number", half: true, group: "publication" },
  { key: "isbn", label: "ISBN", type: "text", half: true, group: "publication" },
  { key: "pageCount", label: "Pages", type: "number", group: "publication" },
];

const NUM_FIELDS = new Set(["year", "pageCount", "seriesIndex"]);

type FieldKey = "title" | "author" | "description" | "genre" | "publisher" | "year" | "isbn" | "language" | "pageCount" | "series" | "seriesIndex";

const DIFF_FIELDS: { key: FieldKey; label: string }[] = [
  { key: "title", label: "Title" },
  { key: "author", label: "Author" },
  { key: "description", label: "Description" },
  { key: "genre", label: "Genre" },
  { key: "publisher", label: "Publisher" },
  { key: "year", label: "Year" },
  { key: "isbn", label: "ISBN" },
  { key: "language", label: "Language" },
  { key: "pageCount", label: "Pages" },
  { key: "series", label: "Series" },
  { key: "seriesIndex", label: "Series #" },
];

// --- Helpers ---

function str(val: unknown): string {
  return val != null ? String(val) : "";
}

// --- Main Component ---

function BookEditPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const bookQuery = trpc.books.byId.useQuery({ id });

  // Form state
  const [values, setValues] = useState<Record<string, string>>({});
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [initialValues, setInitialValues] = useState<Record<string, string>>({});

  // Metadata state
  const [metadataExpanded, setMetadataExpanded] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [manualQuery, setManualQuery] = useState<string | undefined>(undefined);
  const [selected, setSelected] = useState<ExternalBook | null>(null);
  const [checkedFields, setCheckedFields] = useState<Record<string, boolean>>({});
  const [coverChecked, setCoverChecked] = useState(false);

  // Auto-expand metadata if ?metadata=1
  const { metadata } = Route.useSearch();
  useEffect(() => {
    if (metadata === "1") setMetadataExpanded(true);
  }, [metadata]);

  // Initialize form from book data
  useEffect(() => {
    if (!bookQuery.data) return;
    const v: Record<string, string> = {};
    for (const { key } of FIELDS) {
      const val = (bookQuery.data as any)[key];
      v[key] = val != null ? String(val) : "";
    }
    setValues(v);
    setInitialValues(v);
    setSearchInput(`${bookQuery.data.title} ${bookQuery.data.author}`.trim());
  }, [bookQuery.data]);

  // Dirty tracking
  const isDirty = useMemo(() => {
    if (coverUrl) return true;
    return Object.keys(values).some((k) => values[k] !== initialValues[k]);
  }, [values, initialValues, coverUrl]);

  // Warn on browser navigation (tab close, refresh)
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // Warn on in-app SPA navigation
  useBlocker({ condition: isDirty });

  // Metadata search
  const searchQuery = trpc.metadata.search.useQuery(
    { bookId: id, query: manualQuery },
    { enabled: metadataExpanded && !!manualQuery },
  );

  // Save mutation
  const updateMutation = trpc.books.update.useMutation({
    onSuccess: () => {
      utils.books.byId.invalidate({ id });
      utils.books.list.invalidate();
      navigate({ to: "/books/$id", params: { id } });
    },
  });

  // Initialize metadata diff checkboxes when a result is selected
  useEffect(() => {
    if (!selected || !bookQuery.data) return;
    const checked: Record<string, boolean> = {};
    for (const { key } of DIFF_FIELDS) {
      const currentStr = str((bookQuery.data as any)[key]);
      const newStr = str(selected[key as keyof ExternalBook]);
      if (currentStr === newStr || (!currentStr && !newStr)) {
        checked[key] = false;
      } else if (!currentStr && newStr) {
        checked[key] = true;
      } else {
        checked[key] = false;
      }
    }
    setCheckedFields(checked);
    setCoverChecked(!!selected.coverUrl);
  }, [selected, bookQuery.data]);

  const checkedCount = useMemo(() => {
    return Object.values(checkedFields).filter(Boolean).length + (coverChecked ? 1 : 0);
  }, [checkedFields, coverChecked]);

  // Apply metadata to form
  const handleApplyMetadata = () => {
    if (!selected) return;
    const updated = { ...values };
    for (const { key } of DIFF_FIELDS) {
      if (!checkedFields[key]) continue;
      const val = str(selected[key as keyof ExternalBook]);
      updated[key] = val;
    }
    setValues(updated);
    if (coverChecked && selected.coverUrl) {
      setCoverUrl(selected.coverUrl);
    }
    setSelected(null);
  };

  // Save
  const handleSave = () => {
    if (!bookQuery.data) return;
    const fields: Record<string, any> = { id };
    for (const { key, type } of FIELDS) {
      const val = values[key].trim();
      const original = (bookQuery.data as any)[key];
      const originalStr = original != null ? String(original) : "";
      if (val === originalStr) continue;
      if (val === "") {
        fields[key] = null;
      } else if (type === "number" || NUM_FIELDS.has(key)) {
        const num = parseFloat(val);
        if (!isNaN(num)) fields[key] = num;
      } else {
        fields[key] = val;
      }
    }
    if (coverUrl) fields.coverUrl = coverUrl;
    updateMutation.mutate(fields);
  };

  const set = (key: string, val: string) => setValues((p) => ({ ...p, [key]: val }));

  // --- Loading / Error ---

  if (bookQuery.isLoading) {
    return <div className="flex items-center justify-center py-20" style={{ color: "var(--text-dim)" }}><p className="text-sm">Loading...</p></div>;
  }
  if (bookQuery.error || !bookQuery.data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="font-display text-lg" style={{ color: "var(--text)" }}>Book not found</p>
        <Link to="/" className="text-sm mt-2" style={{ color: "var(--warm)" }}>Back to library</Link>
      </div>
    );
  }

  const book = bookQuery.data;
  const groups = [
    { id: "basic", label: "Basic Info" },
    { id: "classification", label: "Classification" },
    { id: "publication", label: "Publication" },
  ];

  // --- Render ---

  return (
    <div className="max-w-4xl mx-auto animate-in fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <Link to="/books/$id" params={{ id }} className="inline-flex items-center text-sm transition-colors hover:opacity-80" style={{ color: "var(--text-dim)" }}>
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to {book.title}
        </Link>
        <button
          onClick={handleSave}
          disabled={!isDirty || updateMutation.isPending}
          className="px-5 py-2 rounded-full text-sm font-semibold text-white transition-transform hover:scale-[1.02] disabled:opacity-50"
          style={{ backgroundColor: "var(--warm)" }}
        >
          {updateMutation.isPending ? "Saving..." : "Save"}
        </button>
      </div>

      {updateMutation.isError && (
        <div className="rounded-lg px-4 py-3 mb-4 text-sm" style={{ backgroundColor: "rgba(200,50,50,0.1)", color: "#c44" }}>
          Failed to save. Please try again.
        </div>
      )}

      <h1 className="font-display text-xl font-bold mb-6" style={{ color: "var(--text)" }}>Edit Book</h1>

      {/* Two-column layout */}
      <div className="flex flex-col md:flex-row gap-8">
        {/* Left: Cover */}
        <div className="shrink-0 self-center md:self-start md:sticky md:top-20">
          {coverUrl ? (
            <img src={coverUrl} alt="" className="w-[180px] rounded-lg object-cover" />
          ) : (
            <BookCover bookId={book.id} title={book.title} author={book.author} coverPath={book.coverPath} updatedAt={book.updatedAt} size="xl" />
          )}
        </div>

        {/* Right: Form */}
        <div className="flex-1 min-w-0 flex flex-col gap-6">
          {groups.map((group) => {
            const groupFields = FIELDS.filter((f) => f.group === group.id);
            return (
              <div key={group.id} className="rounded-xl p-5" style={{ backgroundColor: "var(--card)" }}>
                <p className="text-xs font-medium uppercase tracking-wider mb-4" style={{ color: "var(--text-faint)" }}>{group.label}</p>
                <div className="flex flex-col gap-3">
                  {renderFieldRows(groupFields, values, set)}
                </div>
              </div>
            );
          })}

          {/* Metadata section */}
          <div className="rounded-xl" style={{ backgroundColor: "var(--card)" }}>
            <button
              onClick={() => setMetadataExpanded((p) => !p)}
              className="w-full flex items-center justify-between p-5 text-left"
            >
              <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>Find Metadata</p>
              <svg className={`w-4 h-4 transition-transform ${metadataExpanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: "var(--text-faint)" }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {metadataExpanded && (
              <div className="px-5 pb-5">
                {!selected ? (
                  <>
                    {/* Search bar */}
                    <div className="flex gap-2 mb-4">
                      <input
                        type="text"
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (searchInput.trim()) setManualQuery(searchInput.trim()); } }}
                        placeholder="Search by title, author, ISBN..."
                        className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none"
                        style={{ backgroundColor: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
                      />
                      <button
                        onClick={() => { if (searchInput.trim()) setManualQuery(searchInput.trim()); }}
                        className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                        style={{ backgroundColor: "var(--warm)" }}
                      >
                        Search
                      </button>
                    </div>

                    {/* Results */}
                    <div className="flex flex-col gap-2">
                      {searchQuery.isLoading && <p className="text-sm py-6 text-center" style={{ color: "var(--text-dim)" }}>Searching...</p>}
                      {searchQuery.isError && <p className="text-sm py-6 text-center" style={{ color: "var(--text-dim)" }}>Search failed. Try again.</p>}
                      {!searchQuery.isLoading && !searchQuery.isError && searchQuery.data?.length === 0 && (
                        <p className="text-sm py-6 text-center" style={{ color: "var(--text-dim)" }}>No results. Try a different search.</p>
                      )}
                      {(searchQuery.data ?? []).map((result, i) => (
                        <button
                          key={`${result.source}-${result.sourceId}-${i}`}
                          onClick={() => setSelected(result)}
                          className="flex items-start gap-3 rounded-xl p-3 text-left transition-colors hover:opacity-90"
                          style={{ backgroundColor: "var(--bg)" }}
                        >
                          {result.coverUrl ? (
                            <img src={result.coverUrl} alt="" className="w-10 h-14 object-cover rounded-[2px] shrink-0" />
                          ) : (
                            <div className="w-10 h-14 rounded-[2px] shrink-0 flex items-center justify-center text-[8px]" style={{ backgroundColor: "var(--surface)", color: "var(--text-faint)" }}>No cover</div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate" style={{ color: "var(--text)" }}>{result.title}</p>
                            <p className="text-xs truncate" style={{ color: "var(--text-dim)" }}>{result.author}</p>
                            <div className="flex items-center gap-2 mt-1">
                              {result.year && <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>{result.year}</span>}
                              {result.pageCount && <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>{result.pageCount}p</span>}
                              <SourceBadge source={result.source} />
                              <span className="text-[11px] font-medium" style={{ color: "var(--text-faint)" }}>{Math.round(result.confidence * 100)}%</span>
                            </div>
                          </div>
                          <svg className="w-4 h-4 mt-1 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: "var(--text-faint)" }}>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    {/* Review changes */}
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Review Changes</h3>
                      <SourceBadge source={selected.source} />
                    </div>

                    {/* Cover comparison */}
                    {selected.coverUrl && (
                      <label className="flex items-center gap-4 rounded-xl p-3 mb-3 cursor-pointer" style={{ backgroundColor: "var(--bg)" }}>
                        <input type="checkbox" checked={coverChecked} onChange={() => setCoverChecked((p) => !p)} className="shrink-0" />
                        <div className="flex items-center gap-3">
                          <div className="text-center">
                            <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--text-faint)" }}>Current</p>
                            <BookCover bookId={id} title={book.title} author={book.author} coverPath={book.coverPath} updatedAt={book.updatedAt} size="sm" />
                          </div>
                          <span style={{ color: "var(--text-faint)" }}>→</span>
                          <div className="text-center">
                            <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--text-faint)" }}>New</p>
                            <img src={selected.coverUrl} alt="" className="w-[52px] h-[76px] object-cover rounded-[3px]" />
                          </div>
                        </div>
                        <span className="text-xs ml-auto" style={{ color: "var(--text-dim)" }}>Cover</span>
                      </label>
                    )}

                    {/* Field diffs */}
                    <div className="flex flex-col gap-1">
                      {DIFF_FIELDS.map(({ key, label }) => {
                        const currentStr = str((book as any)[key]);
                        const newStr = str(selected[key as keyof ExternalBook]);
                        const isMatching = currentStr === newStr;
                        const bothEmpty = !currentStr && !newStr;
                        if (bothEmpty) return null;
                        const isEmpty = !currentStr && !!newStr;
                        const isDifferent = !!currentStr && !!newStr && !isMatching;

                        return (
                          <label key={key} className="flex items-center gap-3 rounded-lg px-3 py-2 cursor-pointer" style={{
                            opacity: isMatching ? 0.4 : 1,
                            backgroundColor: isMatching ? "transparent" : isEmpty ? "rgba(34,197,94,0.08)" : isDifferent ? "rgba(234,179,8,0.08)" : "transparent",
                          }}>
                            <input type="checkbox" checked={!!checkedFields[key]} onChange={() => { if (!isMatching) setCheckedFields((p) => ({ ...p, [key]: !p[key] })); }} disabled={isMatching} className="shrink-0" />
                            <span className="text-xs font-medium w-20 shrink-0" style={{ color: "var(--text-dim)" }}>{label}</span>
                            <span className="text-xs w-2/5 truncate shrink-0" style={{ color: "var(--text-faint)" }} title={currentStr || "(empty)"}>{currentStr || <em>(empty)</em>}</span>
                            {!isMatching && (
                              <>
                                <span className="text-xs shrink-0" style={{ color: "var(--text-faint)" }}>→</span>
                                <span className="text-xs flex-1 truncate" style={{ color: "var(--text)" }} title={newStr}>{newStr || <em>(empty)</em>}</span>
                              </>
                            )}
                          </label>
                        );
                      })}
                    </div>

                    {/* Apply / Back */}
                    <div className="flex items-center justify-between mt-4">
                      <button onClick={() => setSelected(null)} className="px-4 py-2 rounded-full text-sm font-medium border hover:opacity-80" style={{ borderColor: "var(--border)", color: "var(--text-dim)" }}>
                        Back to results
                      </button>
                      <button onClick={handleApplyMetadata} disabled={checkedCount === 0} className="px-5 py-2 rounded-full text-sm font-semibold text-white hover:scale-[1.02] disabled:opacity-50" style={{ backgroundColor: "var(--warm)" }}>
                        Apply {checkedCount} change{checkedCount !== 1 ? "s" : ""}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Field rendering helper ---

function renderFieldRows(fields: typeof FIELDS, values: Record<string, string>, set: (key: string, val: string) => void) {
  const rows: React.ReactNode[] = [];
  let i = 0;
  while (i < fields.length) {
    const field = fields[i];
    const next = fields[i + 1];
    if (field.half && next?.half) {
      rows.push(
        <div key={field.key} className="grid grid-cols-2 gap-3">
          {renderField(field, values, set)}
          {renderField(next, values, set)}
        </div>
      );
      i += 2;
    } else {
      rows.push(<div key={field.key}>{renderField(field, values, set)}</div>);
      i += 1;
    }
  }
  return rows;
}

function renderField(field: typeof FIELDS[number], values: Record<string, string>, set: (key: string, val: string) => void) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-dim)" }}>{field.label}</label>
      {field.type === "textarea" ? (
        <textarea
          value={values[field.key] ?? ""}
          onChange={(e) => set(field.key, e.target.value)}
          rows={4}
          className="w-full rounded-lg border px-3 py-2 text-sm outline-none resize-none"
          style={{ backgroundColor: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
        />
      ) : (
        <input
          type="text"
          inputMode={field.type === "number" ? "decimal" : undefined}
          value={values[field.key] ?? ""}
          onChange={(e) => set(field.key, e.target.value)}
          className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
          style={{ backgroundColor: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it loads in the browser**

Navigate to `http://localhost:5173/books/<any-book-id>/edit` and confirm:
- Page loads with book data populated
- Cover is visible on the left
- Form fields grouped into sections
- Save button disabled (no changes yet)
- Back link goes to book detail page

- [ ] **Step 3: Test metadata section**

- Click "Find Metadata" to expand
- Search should return results
- Select a result, review checkboxes
- "Apply" fills form fields, marks form dirty
- Save button enables

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/routes/_app/books/\$id_.edit.tsx
git commit -m "feat: add book edit page with integrated metadata search"
```

---

### Task 3: Shelf Form Component

**Files:**
- Create: `packages/web/src/components/shelves/shelf-form.tsx`
- Reference: `packages/web/src/components/shelves/shelf-dialog.tsx` (source of form logic)

A shared form component used by both the create and edit routes.

- [ ] **Step 1: Create ShelfForm component**

```tsx
// packages/web/src/components/shelves/shelf-form.tsx
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { trpc } from "@/trpc";
import { FilterBuilder } from "./filter-builder";
import type { SmartFilter } from "@verso/shared";

type Props = {
  editShelf?: {
    id: string;
    name: string;
    emoji: string | null;
    description: string | null;
    isSmart: boolean | null;
    smartFilter: string | null;
  };
};

const PRESETS: { label: string; filter: SmartFilter }[] = [
  { label: "Short Reads", filter: { operator: "AND", conditions: [{ field: "pageCount", op: "lte", value: "200" }] } },
  { label: "Long Reads", filter: { operator: "AND", conditions: [{ field: "pageCount", op: "gte", value: "400" }] } },
  { label: "EPUBs Only", filter: { operator: "AND", conditions: [{ field: "fileFormat", op: "eq", value: "epub" }] } },
];

const DEFAULT_FILTER: SmartFilter = {
  operator: "AND",
  conditions: [{ field: "title", op: "contains", value: "" }],
};

export function ShelfForm({ editShelf }: Props) {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const isEdit = !!editShelf;

  const [name, setName] = useState(editShelf?.name ?? "");
  const [emoji, setEmoji] = useState(editShelf?.emoji ?? "📁");
  const [description, setDescription] = useState(editShelf?.description ?? "");
  const [isSmart, setIsSmart] = useState(editShelf?.isSmart ?? false);
  const [smartFilter, setSmartFilter] = useState<SmartFilter>(() => {
    if (editShelf?.smartFilter) {
      try { return JSON.parse(editShelf.smartFilter) as SmartFilter; }
      catch { return { ...DEFAULT_FILTER }; }
    }
    return { ...DEFAULT_FILTER };
  });

  const createMutation = trpc.shelves.create.useMutation({
    onSuccess: (data) => {
      utils.shelves.list.invalidate();
      navigate({ to: "/shelves/$id", params: { id: data.id } });
    },
  });

  const updateMutation = trpc.shelves.update.useMutation({
    onSuccess: () => {
      utils.shelves.list.invalidate();
      if (editShelf) {
        utils.shelves.byId.invalidate({ id: editShelf.id });
        navigate({ to: "/shelves/$id", params: { id: editShelf.id } });
      }
    },
  });

  const isPending = createMutation.isPending || updateMutation.isPending;
  const error = createMutation.isError || updateMutation.isError;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (isEdit && editShelf) {
      updateMutation.mutate({
        id: editShelf.id,
        name: name.trim(),
        emoji,
        description: description.trim() || undefined,
        smartFilter: isSmart ? smartFilter : undefined,
      });
    } else {
      createMutation.mutate({
        name: name.trim(),
        emoji,
        description: description.trim() || undefined,
        isSmart,
        smartFilter: isSmart ? smartFilter : undefined,
      });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && (
        <div className="rounded-lg px-4 py-3 text-sm" style={{ backgroundColor: "rgba(200,50,50,0.1)", color: "#c44" }}>
          Failed to save. Please try again.
        </div>
      )}

      <div className="flex gap-3">
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-dim)" }}>Emoji</label>
          <input type="text" value={emoji} onChange={(e) => setEmoji(e.target.value)}
            className="w-14 rounded-lg border px-2 py-2 text-center text-lg outline-none"
            style={{ backgroundColor: "var(--bg)", borderColor: "var(--border)" }} maxLength={4} />
        </div>
        <div className="flex-1">
          <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-dim)" }}>Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="My Shelf"
            className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
            style={{ backgroundColor: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }} required />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-dim)" }}>Description (optional)</label>
        <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="A brief description..."
          className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
          style={{ backgroundColor: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }} />
      </div>

      {!isEdit && (
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={isSmart} onChange={(e) => setIsSmart(e.target.checked)} className="rounded" />
          <span className="text-sm" style={{ color: "var(--text-dim)" }}>Smart shelf (auto-populates based on rules)</span>
        </label>
      )}

      {isSmart && (
        <div className="rounded-xl p-4" style={{ backgroundColor: "var(--bg)" }}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-medium" style={{ color: "var(--text-dim)" }}>Presets:</span>
            {PRESETS.map((p) => (
              <button key={p.label} type="button" onClick={() => setSmartFilter({ operator: p.filter.operator, conditions: [...p.filter.conditions] })}
                className="px-2 py-0.5 rounded text-[11px] font-medium transition-colors hover:opacity-80"
                style={{ backgroundColor: "var(--surface)", color: "var(--text-dim)" }}>
                {p.label}
              </button>
            ))}
          </div>
          <FilterBuilder filter={smartFilter} onChange={setSmartFilter} />
        </div>
      )}

      <div className="flex justify-end mt-2">
        <button type="submit" disabled={isPending || !name.trim()}
          className="px-5 py-2 rounded-full text-sm font-semibold text-white transition-transform hover:scale-[1.02] disabled:opacity-50"
          style={{ backgroundColor: "var(--warm)" }}>
          {isPending ? "Saving..." : isEdit ? "Save" : "Create"}
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/components/shelves/shelf-form.tsx
git commit -m "feat: add shared ShelfForm component for create and edit"
```

---

### Task 4: Shelf Route Pages

**Files:**
- Create: `packages/web/src/routes/_app/shelves/new.tsx`
- Create: `packages/web/src/routes/_app/shelves/$id_.edit.tsx`

- [ ] **Step 1: Create shelf new page**

```tsx
// packages/web/src/routes/_app/shelves/new.tsx
import { createFileRoute, Link } from "@tanstack/react-router";
import { ShelfForm } from "@/components/shelves/shelf-form";

export const Route = createFileRoute("/_app/shelves/new")({
  component: ShelfNewPage,
});

function ShelfNewPage() {
  return (
    <div className="max-w-lg mx-auto animate-in fade-in">
      <Link to="/" className="inline-flex items-center text-sm mb-6 transition-colors hover:opacity-80" style={{ color: "var(--text-dim)" }}>
        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to library
      </Link>
      <h1 className="font-display text-xl font-bold mb-6" style={{ color: "var(--text)" }}>New Shelf</h1>
      <div className="rounded-xl p-5" style={{ backgroundColor: "var(--card)" }}>
        <ShelfForm />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create shelf edit page**

```tsx
// packages/web/src/routes/_app/shelves/$id_.edit.tsx
import { createFileRoute, Link } from "@tanstack/react-router";
import { trpc } from "@/trpc";
import { ShelfForm } from "@/components/shelves/shelf-form";

export const Route = createFileRoute("/_app/shelves/$id_/edit")({
  component: ShelfEditPage,
});

function ShelfEditPage() {
  const { id } = Route.useParams();
  const shelfQuery = trpc.shelves.byId.useQuery({ id });

  if (shelfQuery.isLoading) {
    return <div className="flex items-center justify-center py-20" style={{ color: "var(--text-dim)" }}><p className="text-sm">Loading...</p></div>;
  }
  if (shelfQuery.error || !shelfQuery.data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="font-display text-lg" style={{ color: "var(--text)" }}>Shelf not found</p>
        <Link to="/" className="text-sm mt-2" style={{ color: "var(--warm)" }}>Back to library</Link>
      </div>
    );
  }

  const shelf = shelfQuery.data;

  return (
    <div className="max-w-lg mx-auto animate-in fade-in">
      <Link to="/shelves/$id" params={{ id }} className="inline-flex items-center text-sm mb-6 transition-colors hover:opacity-80" style={{ color: "var(--text-dim)" }}>
        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to {shelf.name}
      </Link>
      <h1 className="font-display text-xl font-bold mb-6" style={{ color: "var(--text)" }}>Edit Shelf</h1>
      <div className="rounded-xl p-5" style={{ backgroundColor: "var(--card)" }}>
        <ShelfForm editShelf={{
          id: shelf.id,
          name: shelf.name,
          emoji: shelf.emoji,
          description: shelf.description,
          isSmart: shelf.isSmart,
          smartFilter: shelf.smartFilter,
        }} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify both pages load**

- Navigate to `http://localhost:5173/shelves/new` — should show blank form
- Navigate to `http://localhost:5173/shelves/<shelf-id>/edit` — should show pre-filled form

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/routes/_app/shelves/new.tsx packages/web/src/routes/_app/shelves/\$id_.edit.tsx
git commit -m "feat: add shelf create and edit pages"
```

---

### Task 5: Update Book Detail Page

**Files:**
- Modify: `packages/web/src/routes/_app/books/$id.tsx`

Remove dialog imports, state, and renders. Replace Edit/Find Metadata buttons with Links.

- [ ] **Step 1: Update the file**

Changes to make in `$id.tsx`:
1. Remove imports: `BookEditDialog`, `FindMetadataDialog`, `useState` (if only used for dialogs)
2. Remove state: `editOpen`, `metadataOpen`
3. Replace the Edit button `onClick={() => setEditOpen(true)}` with:
   ```tsx
   <Link to="/books/$id/edit" params={{ id }}
     className="px-5 py-2.5 rounded-full text-sm font-medium border transition-colors hover:opacity-80"
     style={{ borderColor: "var(--border)", color: "var(--text-dim)" }}>
     Edit
   </Link>
   ```
4. Replace the Find Metadata button with:
   ```tsx
   <Link to="/books/$id/edit" params={{ id }} search={{ metadata: "1" }}
     className="px-5 py-2.5 rounded-full text-sm font-medium border transition-colors hover:opacity-80"
     style={{ borderColor: "var(--border)", color: "var(--text-dim)" }}>
     Find Metadata
   </Link>
   ```
5. Remove the `{editOpen && <BookEditDialog .../>}` block at bottom
6. Remove the `<FindMetadataDialog .../>` block at bottom

Note: `useState` is still needed for `activeTab`, so keep the import.

- [ ] **Step 2: Verify the book detail page**

- "Edit" button navigates to edit page
- "Find Metadata" navigates to edit page with metadata section expanded
- No more dialog renders

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/routes/_app/books/\$id.tsx
git commit -m "refactor: replace book edit/metadata dialogs with page links"
```

---

### Task 6: Update Shelf Detail Page

**Files:**
- Modify: `packages/web/src/routes/_app/shelves/$id.tsx`

Remove dialog import, state, portal render. Edit menu item navigates instead.

- [ ] **Step 1: Update the file**

Changes to make in `shelves/$id.tsx`:
1. Remove imports: `createPortal` from `react-dom`, `ShelfDialog`
2. Remove state: `editOpen`
3. Replace the Edit menu button's onClick:
   ```tsx
   <Link to="/shelves/$id/edit" params={{ id }}
     className="w-full text-left px-4 py-2.5 text-sm transition-colors"
     style={{ color: "var(--text)" }}
     onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--card)")}
     onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}>
     Edit
   </Link>
   ```
   (Also close the menu: add `onClick={() => setMenuOpen(false)}` or let the navigation handle it)
4. Remove the `{editOpen && createPortal(<ShelfDialog .../>, document.body)}` block at bottom

- [ ] **Step 2: Verify shelf detail page**

- Edit menu item navigates to `/shelves/:id/edit`
- No more dialog renders

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/routes/_app/shelves/\$id.tsx
git commit -m "refactor: replace shelf dialog with edit page link"
```

---

### Task 7: Update Sidebar

**Files:**
- Modify: `packages/web/src/components/layout/sidebar.tsx`

Remove dialog import, state, portal. "+" button becomes a Link.

- [ ] **Step 1: Update the file**

Changes to make in `sidebar.tsx`:
1. Remove imports: `useState` (if only used for dialog), `createPortal` from `react-dom`, `ShelfDialog`
2. Add import: `Link` from `@tanstack/react-router` (already imported)
3. Remove state: `shelfDialogOpen`
4. Replace the "+" button:
   ```tsx
   <Link to="/shelves/new"
     className="w-5 h-5 flex items-center justify-center rounded text-xs transition-colors hover:opacity-80"
     style={{ color: "var(--text-faint)" }}>
     +
   </Link>
   ```
5. Remove the `{shelfDialogOpen && createPortal(...)}` block

Note: `useState` is no longer needed if `shelfDialogOpen` was the only state. Check if any other state exists.

- [ ] **Step 2: Verify sidebar**

- "+" button navigates to `/shelves/new`
- No more dialog renders

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/layout/sidebar.tsx
git commit -m "refactor: replace shelf dialog in sidebar with link to /shelves/new"
```

---

### Task 8: Delete Old Dialog Files

**Files:**
- Delete: `packages/web/src/components/books/book-edit-dialog.tsx`
- Delete: `packages/web/src/components/metadata/find-metadata-dialog.tsx`
- Delete: `packages/web/src/components/shelves/shelf-dialog.tsx`

- [ ] **Step 1: Verify no remaining imports**

Run:
```bash
grep -r "book-edit-dialog\|find-metadata-dialog\|shelf-dialog" packages/web/src/ --include="*.tsx" --include="*.ts"
```
Expected: no results (all imports removed in previous tasks)

- [ ] **Step 2: Delete the files**

```bash
rm packages/web/src/components/books/book-edit-dialog.tsx
rm packages/web/src/components/metadata/find-metadata-dialog.tsx
rm packages/web/src/components/shelves/shelf-dialog.tsx
```

- [ ] **Step 3: Verify the app still builds**

```bash
cd packages/web && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add -u
git commit -m "chore: delete old dialog components replaced by edit pages"
```

---

### Task 9: Smoke Test Everything

- [ ] **Step 1: Test book edit flow**

1. Go to library, click a book
2. Click "Edit" → navigates to edit page
3. Change the title, click Save → navigates back, title updated
4. Click "Find Metadata" → navigates to edit page with metadata section open
5. Search, select result, apply, save

- [ ] **Step 2: Test shelf create flow**

1. Click "+" in sidebar → navigates to `/shelves/new`
2. Fill in name, click Create → navigates to new shelf page

- [ ] **Step 3: Test shelf edit flow**

1. Go to a user shelf, click ⋯ menu → Edit
2. Navigates to edit page with data pre-filled
3. Change name, save → navigates back, name updated

- [ ] **Step 4: Test smart shelf edit**

1. Go to a smart shelf (e.g. "Recently Added"), click ⋯ → Edit
2. Filter builder should be visible and pre-populated
3. Modify filter, save

- [ ] **Step 5: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address issues found during smoke testing"
```
