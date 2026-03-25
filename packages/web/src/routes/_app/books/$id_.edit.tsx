import { useState, useEffect, useMemo } from "react";
import { createFileRoute, Link, useNavigate, useBlocker } from "@tanstack/react-router";
import { trpc } from "@/trpc";
import { BookCover } from "@/components/books/book-cover";

export const Route = createFileRoute("/_app/books/$id_/edit")({
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

function BookEditPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const bookQuery = trpc.books.byId.useQuery({ id });

  const [values, setValues] = useState<Record<string, string>>({});
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [initialValues, setInitialValues] = useState<Record<string, string>>({});

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
  }, [bookQuery.data]);

  // Pick up metadata selections from the metadata page via sessionStorage
  useEffect(() => {
    const storageKey = `verso-metadata-apply-${id}`;
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return;
    sessionStorage.removeItem(storageKey);
    try {
      const applied = JSON.parse(raw) as Record<string, string>;
      setValues((prev) => ({ ...prev, ...applied }));
      if (applied.coverUrl) {
        setCoverUrl(applied.coverUrl);
        delete applied.coverUrl;
      }
    } catch { /* ignore bad data */ }
  }, [id]);

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

  const updateMutation = trpc.books.update.useMutation({
    onSuccess: () => {
      utils.books.byId.invalidate({ id });
      utils.books.list.invalidate();
      navigate({ to: "/books/$id", params: { id } });
    },
  });

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
        <div className="shrink-0 self-center md:self-start">
          <BookCover bookId={book.id} title={book.title} author={book.author} coverPath={book.coverPath} updatedAt={book.updatedAt} size="xl" />
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

          <Link
            to="/books/$id/metadata" params={{ id }}
            className="flex items-center justify-center gap-2 rounded-xl p-4 text-sm font-medium transition-colors hover:opacity-80 border border-dashed"
            style={{ borderColor: "var(--border)", color: "var(--text-dim)" }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            Find Metadata Online
          </Link>
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
