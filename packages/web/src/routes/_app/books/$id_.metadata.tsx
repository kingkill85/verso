import { useState, useEffect, useMemo } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { trpc } from "@/trpc";  // still needed for books.byId and metadata.search
import { BookCover } from "@/components/books/book-cover";
import { SourceBadge } from "@/components/metadata/source-badge";
import type { ExternalBook } from "@verso/shared";

const METADATA_STORAGE_KEY = (id: string) => `verso-metadata-apply-${id}`;

export const Route = createFileRoute("/_app/books/$id_/metadata")({
  component: BookMetadataPage,
});

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

const NUM_FIELDS = new Set(["year", "pageCount", "seriesIndex"]);

function str(val: unknown): string {
  return val != null ? String(val) : "";
}

function BookMetadataPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const bookQuery = trpc.books.byId.useQuery({ id });

  const [searchTitle, setSearchTitle] = useState("");
  const [searchAuthor, setSearchAuthor] = useState("");
  const [searchIsbn, setSearchIsbn] = useState("");
  const [searchParams, setSearchParams] = useState<{ title?: string; author?: string; isbn?: string } | null>(null);
  const [selected, setSelected] = useState<ExternalBook | null>(null);
  const [checkedFields, setCheckedFields] = useState<Record<string, boolean>>({});
  const [coverChecked, setCoverChecked] = useState(false);

  useEffect(() => {
    if (bookQuery.data) {
      setSearchTitle(bookQuery.data.title ?? "");
      setSearchAuthor(bookQuery.data.author ?? "");
      setSearchIsbn((bookQuery.data as any).isbn ?? "");
    }
  }, [bookQuery.data]);

  const searchQuery = trpc.metadata.search.useQuery(
    {
      bookId: id,
      ...(searchParams?.isbn ? { isbn: searchParams.isbn } : {}),
      ...(searchParams?.title ? { title: searchParams.title } : {}),
      ...(searchParams?.author ? { author: searchParams.author } : {}),
      // Also send a combined query for Google/OpenLibrary
      query: [searchParams?.title, searchParams?.author].filter(Boolean).join(" ") || undefined,
    },
    { enabled: !!searchParams },
  );

  const handleSearch = () => {
    const t = searchTitle.trim();
    const a = searchAuthor.trim();
    const i = searchIsbn.trim();
    if (!t && !a && !i) return;
    setSearchParams({ title: t || undefined, author: a || undefined, isbn: i || undefined });
  };

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

  const handleApply = () => {
    if (!selected) return;
    // Store selected values in sessionStorage, edit page will pick them up
    const applied: Record<string, string> = {};
    for (const { key } of DIFF_FIELDS) {
      if (!checkedFields[key]) continue;
      applied[key] = str(selected[key as keyof ExternalBook]);
    }
    if (coverChecked && selected.coverUrl) {
      applied.coverUrl = selected.coverUrl;
    }
    sessionStorage.setItem(METADATA_STORAGE_KEY(id), JSON.stringify(applied));
    navigate({ to: "/books/$id/edit", params: { id } });
  };

  if (bookQuery.isLoading) {
    return <div className="flex items-center justify-center py-20" style={{ color: "var(--text-dim)" }}><p className="text-sm">Loading...</p></div>;
  }
  if (bookQuery.error || !bookQuery.data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="font-display text-lg" style={{ color: "var(--text)" }}>Book not found</p>
        <button onClick={() => window.history.back()} className="text-sm mt-2" style={{ color: "var(--warm)" }}>Back</button>
      </div>
    );
  }

  const book = bookQuery.data;

  return (
    <div className="max-w-3xl mx-auto animate-in fade-in">
      <Link to="/books/$id" params={{ id }} className="inline-flex items-center text-sm mb-6 transition-colors hover:opacity-80" style={{ color: "var(--text-dim)" }}>
        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to {book.title}
      </Link>

      <h1 className="font-display text-xl font-bold mb-6" style={{ color: "var(--text)" }}>Find Metadata</h1>

      {!selected ? (
        <>
          {/* Search fields */}
          <div className="rounded-xl p-5 mb-6" style={{ backgroundColor: "var(--card)" }}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-dim)" }}>Title</label>
                <input type="text" value={searchTitle} onChange={(e) => setSearchTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSearch(); } }}
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                  style={{ backgroundColor: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-dim)" }}>Author</label>
                <input type="text" value={searchAuthor} onChange={(e) => setSearchAuthor(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSearch(); } }}
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                  style={{ backgroundColor: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }} />
              </div>
            </div>
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-dim)" }}>ISBN</label>
                <input type="text" value={searchIsbn} onChange={(e) => setSearchIsbn(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSearch(); } }}
                  placeholder="Optional — most precise"
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                  style={{ backgroundColor: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }} />
              </div>
              <button onClick={handleSearch}
                className="px-5 py-2 rounded-lg text-sm font-medium text-white shrink-0"
                style={{ backgroundColor: "var(--warm)" }}>
                Search
              </button>
            </div>
          </div>

          {/* Results */}
          <div className="flex flex-col gap-2">
            {searchQuery.isLoading && <p className="text-sm py-8 text-center" style={{ color: "var(--text-dim)" }}>Searching...</p>}
            {searchQuery.isError && <p className="text-sm py-8 text-center" style={{ color: "var(--text-dim)" }}>Search failed. Try again.</p>}
            {!searchQuery.isLoading && !searchQuery.isError && searchQuery.data?.length === 0 && (
              <p className="text-sm py-8 text-center" style={{ color: "var(--text-dim)" }}>No results. Try a different search.</p>
            )}
            {(searchQuery.data ?? []).map((result: ExternalBook, i: number) => (
              <button
                key={`${result.source}-${result.sourceId}-${i}`}
                onClick={() => setSelected(result)}
                className="flex items-start gap-3 rounded-xl p-4 text-left transition-colors hover:opacity-90"
                style={{ backgroundColor: "var(--card)" }}
              >
                {result.coverUrl ? (
                  <img src={result.coverUrl} alt="" className="w-12 h-[68px] object-cover rounded-[3px] shrink-0" />
                ) : (
                  <div className="w-12 h-[68px] rounded-[3px] shrink-0 flex items-center justify-center text-[8px]" style={{ backgroundColor: "var(--bg)", color: "var(--text-faint)" }}>No cover</div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: "var(--text)" }}>{result.title}</p>
                  <p className="text-xs truncate" style={{ color: "var(--text-dim)" }}>{result.author}</p>
                  <div className="flex items-center gap-2 mt-1.5">
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
            <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Review Changes</h2>
            <SourceBadge source={selected.source} />
          </div>

          {/* Cover comparison */}
          {selected.coverUrl && (
            <label className="flex items-center gap-4 rounded-xl p-4 mb-3 cursor-pointer" style={{ backgroundColor: "var(--card)" }}>
              <input type="checkbox" checked={coverChecked} onChange={() => setCoverChecked((p) => !p)} className="shrink-0" />
              <div className="flex items-center gap-4">
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
          <div className="flex flex-col gap-1 mb-6">
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

          {/* Actions */}
          <div className="flex items-center justify-between">
            <button onClick={() => setSelected(null)} className="px-4 py-2 rounded-full text-sm font-medium border hover:opacity-80" style={{ borderColor: "var(--border)", color: "var(--text-dim)" }}>
              Back to results
            </button>
            <button
              onClick={handleApply}
              disabled={checkedCount === 0}
              className="px-5 py-2 rounded-full text-sm font-semibold text-white hover:scale-[1.02] disabled:opacity-50"
              style={{ backgroundColor: "var(--warm)" }}
            >
              Apply {checkedCount} change{checkedCount !== 1 ? "s" : ""}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
