import { useState, useEffect, useMemo } from "react";
import { trpc } from "@/trpc";
import { BookCover } from "@/components/books/book-cover";
import type { ExternalBook } from "@verso/shared";

type Props = {
  bookId: string;
  book: {
    id: string;
    title: string;
    author: string;
    isbn?: string | null;
    description?: string | null;
    genre?: string | null;
    publisher?: string | null;
    year?: number | null;
    language?: string | null;
    pageCount?: number | null;
    series?: string | null;
    seriesIndex?: number | null;
    coverPath?: string | null;
    updatedAt?: string | null;
  };
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
};

type FieldKey =
  | "title"
  | "author"
  | "description"
  | "genre"
  | "publisher"
  | "year"
  | "isbn"
  | "language"
  | "pageCount"
  | "series"
  | "seriesIndex";

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

export function FindMetadataDialog({ bookId, book, open, onClose, onSaved }: Props) {
  const utils = trpc.useUtils();
  const [step, setStep] = useState<1 | 2>(1);
  const [manualQuery, setManualQuery] = useState<string | undefined>(undefined);
  const [searchInput, setSearchInput] = useState("");
  const [selected, setSelected] = useState<ExternalBook | null>(null);

  const [checkedFields, setCheckedFields] = useState<Record<string, boolean>>({});
  const [coverChecked, setCoverChecked] = useState(false);

  useEffect(() => {
    if (open) {
      setStep(1);
      setManualQuery(undefined);
      setSearchInput(`${book.title} ${book.author}`.trim());
      setSelected(null);
      setCheckedFields({});
      setCoverChecked(false);
    }
  }, [open, book.title, book.author]);

  const searchQuery = trpc.metadata.search.useQuery(
    { bookId, query: manualQuery },
    { enabled: open },
  );

  const updateMutation = trpc.books.update.useMutation({
    onSuccess: () => {
      utils.books.byId.invalidate({ id: bookId });
      utils.books.list.invalidate();
      onSaved();
      onClose();
    },
  });

  useEffect(() => {
    if (!selected) return;
    const checked: Record<string, boolean> = {};
    for (const { key } of DIFF_FIELDS) {
      const currentStr = str(book[key]);
      const newStr = str(selected[key as keyof ExternalBook]);
      if (currentStr === newStr || (!currentStr && !newStr)) {
        checked[key] = false;
      } else if (!currentStr && newStr) {
        checked[key] = true; // empty → filled: auto-check
      } else {
        checked[key] = false; // different: user decides
      }
    }
    setCheckedFields(checked);
    setCoverChecked(!!selected.coverUrl);
  }, [selected, book]);

  const checkedCount = useMemo(() => {
    return Object.values(checkedFields).filter(Boolean).length + (coverChecked ? 1 : 0);
  }, [checkedFields, coverChecked]);

  const handleApply = () => {
    if (!selected || checkedCount === 0) return;
    const fields: Record<string, any> = { id: bookId };
    for (const { key } of DIFF_FIELDS) {
      if (!checkedFields[key]) continue;
      const val = str(selected[key as keyof ExternalBook]);
      if (!val) continue;
      if (NUM_FIELDS.has(key)) {
        const num = parseFloat(val);
        if (!isNaN(num)) fields[key] = num;
      } else {
        fields[key] = val;
      }
    }
    if (coverChecked && selected.coverUrl) {
      fields.coverUrl = selected.coverUrl;
    }
    updateMutation.mutate(fields);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-2xl mx-4 rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
        style={{ backgroundColor: "var(--surface)" }}
      >
        {step === 1 ? (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-lg font-bold" style={{ color: "var(--text)" }}>
                Find Metadata
              </h2>
              <button onClick={onClose} className="p-1 rounded-lg hover:opacity-70" style={{ color: "var(--text-dim)" }}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (searchInput.trim()) setManualQuery(searchInput.trim()); } }}
                placeholder="Search by title, author, ISBN..."
                className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none"
                style={{ backgroundColor: "var(--card)", borderColor: "var(--border)", color: "var(--text)" }}
              />
              <button
                onClick={() => { if (searchInput.trim()) setManualQuery(searchInput.trim()); }}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                style={{ backgroundColor: "var(--warm)" }}
              >
                Search
              </button>
            </div>

            <div className="flex flex-col gap-2">
              {searchQuery.isLoading && (
                <p className="text-sm py-8 text-center" style={{ color: "var(--text-dim)" }}>Searching...</p>
              )}
              {searchQuery.isError && (
                <p className="text-sm py-8 text-center" style={{ color: "var(--text-dim)" }}>Search failed. Try again.</p>
              )}
              {!searchQuery.isLoading && !searchQuery.isError && searchQuery.data?.length === 0 && (
                <p className="text-sm py-8 text-center" style={{ color: "var(--text-dim)" }}>No results. Try a different search.</p>
              )}
              {(searchQuery.data ?? []).map((result, i) => (
                <button
                  key={`${result.source}-${result.sourceId}-${i}`}
                  onClick={() => { setSelected(result); setStep(2); }}
                  className="flex items-start gap-3 rounded-xl p-3 text-left transition-colors hover:opacity-90"
                  style={{ backgroundColor: "var(--card)" }}
                >
                  {result.coverUrl ? (
                    <img src={result.coverUrl} alt="" className="w-10 h-14 object-cover rounded-[2px] shrink-0" />
                  ) : (
                    <div className="w-10 h-14 rounded-[2px] shrink-0 flex items-center justify-center text-[8px]"
                      style={{ backgroundColor: "var(--bg)", color: "var(--text-faint)" }}>No cover</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: "var(--text)" }}>{result.title}</p>
                    <p className="text-xs truncate" style={{ color: "var(--text-dim)" }}>{result.author}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {result.year && <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>{result.year}</span>}
                      {result.pageCount && <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>{result.pageCount}p</span>}
                      <SourceBadge source={result.source} />
                      <span className="text-[11px] font-medium" style={{ color: "var(--text-faint)" }}>
                        {Math.round(result.confidence * 100)}%
                      </span>
                    </div>
                  </div>
                  <svg className="w-4 h-4 mt-1 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: "var(--text-faint)" }}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>
          </>
        ) : selected && (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-lg font-bold" style={{ color: "var(--text)" }}>
                Review Changes
              </h2>
              <SourceBadge source={selected.source} />
            </div>

            {/* Cover */}
            {selected.coverUrl && (
              <label
                className="flex items-center gap-4 rounded-xl p-4 mb-4 cursor-pointer"
                style={{ backgroundColor: "var(--card)" }}
              >
                <input type="checkbox" checked={coverChecked} onChange={() => setCoverChecked((p) => !p)} className="shrink-0" />
                <div className="flex items-center gap-3">
                  <div className="text-center">
                    <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--text-faint)" }}>Current</p>
                    <BookCover bookId={bookId} title={book.title} author={book.author} coverPath={book.coverPath} updatedAt={book.updatedAt} size="sm" />
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

            {/* Fields */}
            <div className="flex flex-col gap-1">
              {DIFF_FIELDS.map(({ key, label }) => {
                const currentStr = str(book[key]);
                const newStr = str(selected[key as keyof ExternalBook]);
                const isMatching = currentStr === newStr;
                const bothEmpty = !currentStr && !newStr;

                if (bothEmpty) return null;

                const isEmpty = !currentStr && !!newStr;
                const isDifferent = !!currentStr && !!newStr && !isMatching;

                return (
                  <label
                    key={key}
                    className="flex items-center gap-3 rounded-lg px-3 py-2 cursor-pointer"
                    style={{
                      opacity: isMatching ? 0.4 : 1,
                      backgroundColor: isMatching ? "transparent"
                        : isEmpty ? "rgba(34,197,94,0.08)"
                        : isDifferent ? "rgba(234,179,8,0.08)"
                        : "transparent",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={!!checkedFields[key]}
                      onChange={() => { if (!isMatching) setCheckedFields((p) => ({ ...p, [key]: !p[key] })); }}
                      disabled={isMatching}
                      className="shrink-0"
                    />
                    <span className="text-xs font-medium w-20 shrink-0" style={{ color: "var(--text-dim)" }}>
                      {label}
                    </span>
                    <span className="text-xs w-2/5 truncate shrink-0" style={{ color: "var(--text-faint)" }} title={currentStr || "(empty)"}>
                      {currentStr || <em>(empty)</em>}
                    </span>
                    {!isMatching && (
                      <>
                        <span className="text-xs shrink-0" style={{ color: "var(--text-faint)" }}>→</span>
                        <span className="text-xs flex-1 truncate" style={{ color: "var(--text)" }} title={newStr}>
                          {newStr || <em>(empty)</em>}
                        </span>
                      </>
                    )}
                  </label>
                );
              })}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between mt-6">
              <button
                onClick={() => setStep(1)}
                className="px-4 py-2 rounded-full text-sm font-medium border hover:opacity-80"
                style={{ borderColor: "var(--border)", color: "var(--text-dim)" }}
              >
                Back
              </button>
              <button
                onClick={handleApply}
                disabled={checkedCount === 0 || updateMutation.isPending}
                className="px-5 py-2 rounded-full text-sm font-semibold text-white hover:scale-[1.02] disabled:opacity-50"
                style={{ backgroundColor: "var(--warm)" }}
              >
                {updateMutation.isPending
                  ? "Saving..."
                  : `Apply ${checkedCount} change${checkedCount !== 1 ? "s" : ""}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function str(val: unknown): string {
  return val != null ? String(val) : "";
}

function SourceBadge({ source }: { source: "google" | "openlibrary" }) {
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
