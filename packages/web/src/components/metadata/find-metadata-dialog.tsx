import { useState, useEffect, useMemo } from "react";
import { trpc } from "@/trpc";
import { BookCover } from "@/components/books/book-cover";
import type { ExternalBook } from "@verso/shared";

type Props = {
  bookId: string;
  book: {
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
  };
  open: boolean;
  onClose: () => void;
  onApplied: () => void;
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
  { key: "pageCount", label: "Page Count" },
  { key: "series", label: "Series" },
  { key: "seriesIndex", label: "Series #" },
];

export function FindMetadataDialog({
  bookId,
  book,
  open,
  onClose,
  onApplied,
}: Props) {
  const utils = trpc.useUtils();
  const [step, setStep] = useState<1 | 2>(1);
  const [manualQuery, setManualQuery] = useState<string | undefined>(undefined);
  const [searchInput, setSearchInput] = useState("");
  const [selected, setSelected] = useState<ExternalBook | null>(null);

  // Diff state
  const [checkedFields, setCheckedFields] = useState<Record<string, boolean>>(
    {},
  );
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});
  const [coverChecked, setCoverChecked] = useState(false);

  // Reset when dialog opens
  useEffect(() => {
    if (open) {
      setStep(1);
      setManualQuery(undefined);
      setSearchInput(`${book.title} ${book.author}`.trim());
      setSelected(null);
      setCheckedFields({});
      setEditedValues({});
      setCoverChecked(false);
    }
  }, [open, book.title, book.author]);

  // Auto-search query
  const searchQuery = trpc.metadata.search.useQuery(
    { bookId, query: manualQuery },
    { enabled: open },
  );

  const applyMutation = trpc.metadata.applyFields.useMutation({
    onSuccess: () => {
      utils.books.byId.invalidate({ id: bookId });
      utils.books.list.invalidate();
      onApplied();
      onClose();
    },
  });

  // Initialize diff state when a result is selected
  useEffect(() => {
    if (!selected) return;
    const checked: Record<string, boolean> = {};
    const edited: Record<string, string> = {};

    for (const { key } of DIFF_FIELDS) {
      const currentVal = book[key];
      const newVal = selected[key as keyof ExternalBook];
      const currentStr = currentVal != null ? String(currentVal) : "";
      const newStr = newVal != null ? String(newVal) : "";
      edited[key] = newStr;

      if (currentStr === newStr) {
        checked[key] = false; // matching - disabled
      } else if (!currentStr && newStr) {
        checked[key] = true; // empty -> filled, auto-check
      } else {
        checked[key] = false; // different, unchecked by default
      }
    }

    setCheckedFields(checked);
    setEditedValues(edited);
    setCoverChecked(!book.coverPath && !!selected.coverUrl);
  }, [selected, book]);

  const handleSelectResult = (result: ExternalBook) => {
    setSelected(result);
    setStep(2);
  };

  const handleSearch = () => {
    if (searchInput.trim()) {
      setManualQuery(searchInput.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSearch();
    }
  };

  const toggleField = (key: string) => {
    const currentVal = book[key as FieldKey];
    const newVal = editedValues[key] ?? "";
    const currentStr = currentVal != null ? String(currentVal) : "";
    // Don't toggle if values match
    if (currentStr === newVal) return;
    setCheckedFields((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleEditValue = (key: string, value: string) => {
    setEditedValues((prev) => ({ ...prev, [key]: value }));
    // Auto-check when user edits
    setCheckedFields((prev) => ({ ...prev, [key]: true }));
  };

  const checkedCount = useMemo(() => {
    let count = Object.values(checkedFields).filter(Boolean).length;
    if (coverChecked) count++;
    return count;
  }, [checkedFields, coverChecked]);

  const handleApply = () => {
    if (!selected || checkedCount === 0) return;

    const fields: Record<string, any> = {};
    for (const { key } of DIFF_FIELDS) {
      if (!checkedFields[key]) continue;
      const val = editedValues[key];
      if (val === "") continue;
      if (key === "year" || key === "pageCount") {
        const num = parseInt(val, 10);
        if (!isNaN(num)) fields[key] = num;
      } else if (key === "seriesIndex") {
        const num = parseFloat(val);
        if (!isNaN(num)) fields[key] = num;
      } else {
        fields[key] = val;
      }
    }

    if (coverChecked && selected.coverUrl) {
      fields.coverUrl = selected.coverUrl;
    }

    applyMutation.mutate({
      bookId,
      fields,
      source: selected.source,
    });
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-2xl mx-4 rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
        style={{ backgroundColor: "var(--surface)" }}
      >
        {step === 1 ? (
          <SearchStep
            searchInput={searchInput}
            onSearchInputChange={setSearchInput}
            onSearch={handleSearch}
            onKeyDown={handleKeyDown}
            results={searchQuery.data ?? []}
            isLoading={searchQuery.isLoading}
            isError={searchQuery.isError}
            onSelect={handleSelectResult}
            onClose={onClose}
          />
        ) : (
          <DiffStep
            book={book}
            bookId={bookId}
            selected={selected!}
            checkedFields={checkedFields}
            editedValues={editedValues}
            coverChecked={coverChecked}
            onToggleField={toggleField}
            onEditValue={handleEditValue}
            onToggleCover={() => setCoverChecked((p) => !p)}
            onBack={() => setStep(1)}
            onApply={handleApply}
            checkedCount={checkedCount}
            isPending={applyMutation.isPending}
          />
        )}
      </div>
    </div>
  );
}

// --- Search Step ---

function SearchStep({
  searchInput,
  onSearchInputChange,
  onSearch,
  onKeyDown,
  results,
  isLoading,
  isError,
  onSelect,
  onClose,
}: {
  searchInput: string;
  onSearchInputChange: (v: string) => void;
  onSearch: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  results: ExternalBook[];
  isLoading: boolean;
  isError: boolean;
  onSelect: (r: ExternalBook) => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2
          className="font-display text-lg font-bold"
          style={{ color: "var(--text)" }}
        >
          Find Metadata
        </h2>
        <button
          onClick={onClose}
          className="p-1 rounded-lg transition-colors hover:opacity-70"
          style={{ color: "var(--text-dim)" }}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Search bar */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => onSearchInputChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search by title, author, ISBN..."
          className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none"
          style={{
            backgroundColor: "var(--card)",
            borderColor: "var(--border)",
            color: "var(--text)",
          }}
        />
        <button
          onClick={onSearch}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-transform hover:scale-[1.02]"
          style={{ backgroundColor: "var(--warm)" }}
        >
          Search
        </button>
      </div>

      {/* Results */}
      <div className="flex flex-col gap-2">
        {isLoading && (
          <p className="text-sm py-8 text-center" style={{ color: "var(--text-dim)" }}>
            Searching metadata sources...
          </p>
        )}
        {isError && (
          <p className="text-sm py-8 text-center" style={{ color: "var(--text-dim)" }}>
            Search failed. Please try again.
          </p>
        )}
        {!isLoading && !isError && results.length === 0 && (
          <p className="text-sm py-8 text-center" style={{ color: "var(--text-dim)" }}>
            No results found. Try a different search query.
          </p>
        )}
        {results.map((result, i) => (
          <button
            key={`${result.source}-${result.sourceId}-${i}`}
            onClick={() => onSelect(result)}
            className="flex items-start gap-3 rounded-xl p-3 text-left transition-colors hover:opacity-90"
            style={{ backgroundColor: "var(--card)" }}
          >
            {/* Thumbnail */}
            {result.coverUrl ? (
              <img
                src={result.coverUrl}
                alt=""
                className="w-10 h-14 object-cover rounded-[2px] shrink-0"
              />
            ) : (
              <div
                className="w-10 h-14 rounded-[2px] shrink-0 flex items-center justify-center text-[8px]"
                style={{ backgroundColor: "var(--bg)", color: "var(--text-faint)" }}
              >
                No cover
              </div>
            )}

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p
                className="text-sm font-semibold truncate"
                style={{ color: "var(--text)" }}
              >
                {result.title}
              </p>
              <p
                className="text-xs truncate"
                style={{ color: "var(--text-dim)" }}
              >
                {result.author}
              </p>
              <div className="flex items-center gap-2 mt-1">
                {result.year && (
                  <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>
                    {result.year}
                  </span>
                )}
                {result.pageCount && (
                  <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>
                    {result.pageCount}p
                  </span>
                )}
                <SourceBadge source={result.source} />
                <span className="text-[11px] font-medium" style={{ color: "var(--text-faint)" }}>
                  {Math.round(result.confidence * 100)}%
                </span>
              </div>
            </div>

            {/* Arrow */}
            <svg
              className="w-4 h-4 mt-1 shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              style={{ color: "var(--text-faint)" }}
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        ))}
      </div>
    </>
  );
}

// --- Diff Step ---

function DiffStep({
  book,
  bookId,
  selected,
  checkedFields,
  editedValues,
  coverChecked,
  onToggleField,
  onEditValue,
  onToggleCover,
  onBack,
  onApply,
  checkedCount,
  isPending,
}: {
  book: Props["book"];
  bookId: string;
  selected: ExternalBook;
  checkedFields: Record<string, boolean>;
  editedValues: Record<string, string>;
  coverChecked: boolean;
  onToggleField: (key: string) => void;
  onEditValue: (key: string, value: string) => void;
  onToggleCover: () => void;
  onBack: () => void;
  onApply: () => void;
  checkedCount: number;
  isPending: boolean;
}) {
  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2
          className="font-display text-lg font-bold"
          style={{ color: "var(--text)" }}
        >
          Review Changes
        </h2>
        <SourceBadge source={selected.source} />
      </div>

      {/* Cover comparison */}
      {selected.coverUrl && (
        <div
          className="flex items-center gap-4 rounded-xl p-4 mb-4"
          style={{ backgroundColor: "var(--card)" }}
        >
          <input
            type="checkbox"
            checked={coverChecked}
            onChange={onToggleCover}
            className="shrink-0"
          />
          <div className="flex items-center gap-3">
            <div className="text-center">
              <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--text-faint)" }}>
                Current
              </p>
              <BookCover
                bookId={bookId}
                title={book.title}
                author={book.author}
                coverPath={book.coverPath}
                size="sm"
              />
            </div>
            <svg
              className="w-4 h-4 shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              style={{ color: "var(--text-faint)" }}
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <div className="text-center">
              <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--text-faint)" }}>
                New
              </p>
              <img
                src={selected.coverUrl}
                alt="New cover"
                className="w-[52px] h-[76px] object-cover rounded-[3px]"
              />
            </div>
          </div>
          <span className="text-xs ml-auto" style={{ color: "var(--text-dim)" }}>
            Cover image
          </span>
        </div>
      )}

      {/* Fields table */}
      <div className="flex flex-col gap-1">
        {DIFF_FIELDS.map(({ key, label }) => {
          const currentVal = book[key];
          const currentStr = currentVal != null ? String(currentVal) : "";
          const newStr = editedValues[key] ?? "";
          const isMatching = currentStr === newStr;
          const isEmpty = !currentStr && !!newStr;
          const isDifferent = !!currentStr && !!newStr && currentStr !== newStr;

          let bg = "transparent";
          let opacity = 1;
          if (isMatching) {
            opacity = 0.4;
          } else if (isEmpty) {
            bg = "rgba(34, 197, 94, 0.08)";
          } else if (isDifferent) {
            bg = "rgba(234, 179, 8, 0.08)";
          }

          return (
            <div
              key={key}
              className="flex items-center gap-3 rounded-lg px-3 py-2"
              style={{ backgroundColor: bg, opacity }}
            >
              <input
                type="checkbox"
                checked={!!checkedFields[key]}
                onChange={() => onToggleField(key)}
                disabled={isMatching}
                className="shrink-0"
              />
              <span
                className="text-xs font-medium w-20 shrink-0"
                style={{ color: "var(--text-dim)" }}
              >
                {label}
              </span>
              <span
                className="text-xs w-1/3 truncate shrink-0"
                style={{ color: "var(--text-faint)" }}
                title={currentStr || "(empty)"}
              >
                {currentStr || <em>(empty)</em>}
              </span>
              <svg
                className="w-3 h-3 shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                style={{ color: "var(--text-faint)" }}
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <input
                type="text"
                value={newStr}
                onChange={(e) => onEditValue(key, e.target.value)}
                disabled={isMatching}
                className="flex-1 text-xs rounded border px-2 py-1 outline-none min-w-0"
                style={{
                  backgroundColor: "var(--card)",
                  borderColor: "var(--border)",
                  color: "var(--text)",
                }}
              />
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between mt-6">
        <button
          onClick={onBack}
          className="px-4 py-2 rounded-full text-sm font-medium border transition-colors hover:opacity-80"
          style={{ borderColor: "var(--border)", color: "var(--text-dim)" }}
        >
          Back to results
        </button>
        <button
          onClick={onApply}
          disabled={checkedCount === 0 || isPending}
          className="px-5 py-2 rounded-full text-sm font-semibold text-white transition-transform hover:scale-[1.02] disabled:opacity-50"
          style={{ backgroundColor: "var(--warm)" }}
        >
          {isPending
            ? "Applying..."
            : `Apply ${checkedCount} change${checkedCount !== 1 ? "s" : ""} to book & file`}
        </button>
      </div>
    </>
  );
}

// --- Source Badge ---

function SourceBadge({ source }: { source: "google" | "openlibrary" }) {
  const isGoogle = source === "google";
  return (
    <span
      className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide"
      style={{
        backgroundColor: isGoogle ? "rgba(66, 133, 244, 0.15)" : "rgba(34, 197, 94, 0.15)",
        color: isGoogle ? "#4285F4" : "#22c55e",
      }}
    >
      {isGoogle ? "Google" : "Open Library"}
    </span>
  );
}
