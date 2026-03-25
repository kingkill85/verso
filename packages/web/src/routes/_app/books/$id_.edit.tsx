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

function str(val: unknown): string {
  return val != null ? String(val) : "";
}

function BookEditPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const bookQuery = trpc.books.byId.useQuery({ id });

  const [values, setValues] = useState<Record<string, string>>({});
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [initialValues, setInitialValues] = useState<Record<string, string>>({});

  const [metadataExpanded, setMetadataExpanded] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [manualQuery, setManualQuery] = useState<string | undefined>(undefined);
  const [selected, setSelected] = useState<ExternalBook | null>(null);
  const [checkedFields, setCheckedFields] = useState<Record<string, boolean>>({});
  const [coverChecked, setCoverChecked] = useState(false);

  const { metadata } = Route.useSearch();
  useEffect(() => {
    if (metadata === "1") setMetadataExpanded(true);
  }, [metadata]);

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

  const isDirty = useMemo(() => {
    if (coverUrl) return true;
    return Object.keys(values).some((k) => values[k] !== initialValues[k]);
  }, [values, initialValues, coverUrl]);

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  useBlocker({ condition: isDirty });

  const searchQuery = trpc.metadata.search.useQuery(
    { bookId: id, query: manualQuery },
    { enabled: metadataExpanded && !!manualQuery },
  );

  const updateMutation = trpc.books.update.useMutation({
    onSuccess: () => {
      utils.books.byId.invalidate({ id });
      utils.books.list.invalidate();
      navigate({ to: "/books/$id", params: { id } });
    },
  });

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
    updateMutation.mutate(fields as any);
  };

  const set = (key: string, val: string) => setValues((p) => ({ ...p, [key]: val }));

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

  return (
    <div className="max-w-4xl mx-auto animate-in fade-in">
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

      <div className="flex flex-col md:flex-row gap-8">
        <div className="shrink-0 self-center md:self-start md:sticky md:top-20">
          {coverUrl ? (
            <img src={coverUrl} alt="" className="w-[180px] rounded-lg object-cover" />
          ) : (
            <BookCover bookId={book.id} title={book.title} author={book.author} coverPath={book.coverPath} updatedAt={book.updatedAt} size="xl" />
          )}
        </div>

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
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Review Changes</h3>
                      <SourceBadge source={selected.source} />
                    </div>

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
