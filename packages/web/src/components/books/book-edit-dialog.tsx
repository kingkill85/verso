import { useState } from "react";
import { trpc } from "@/trpc";

type Props = {
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
  };
  onClose: () => void;
  onSaved: () => void;
};

const FIELDS: { key: string; label: string; type: "text" | "number" | "textarea" }[] = [
  { key: "title", label: "Title", type: "text" },
  { key: "author", label: "Author", type: "text" },
  { key: "description", label: "Description", type: "textarea" },
  { key: "genre", label: "Genre", type: "text" },
  { key: "publisher", label: "Publisher", type: "text" },
  { key: "year", label: "Year", type: "number" },
  { key: "isbn", label: "ISBN", type: "text" },
  { key: "language", label: "Language", type: "text" },
  { key: "pageCount", label: "Pages", type: "number" },
  { key: "series", label: "Series", type: "text" },
  { key: "seriesIndex", label: "Series #", type: "number" },
];

export function BookEditDialog({ book, onClose, onSaved }: Props) {
  const utils = trpc.useUtils();
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const { key } of FIELDS) {
      const val = (book as any)[key];
      v[key] = val != null ? String(val) : "";
    }
    return v;
  });

  const updateMutation = trpc.books.update.useMutation({
    onSuccess: () => {
      utils.books.byId.invalidate({ id: book.id });
      utils.books.list.invalidate();
      onSaved();
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const fields: Record<string, any> = { id: book.id };

    for (const { key, type } of FIELDS) {
      const val = values[key].trim();
      const original = (book as any)[key];
      const originalStr = original != null ? String(original) : "";

      if (val === originalStr) continue;

      if (val === "") {
        fields[key] = null;
      } else if (type === "number") {
        const num = parseFloat(val);
        if (!isNaN(num)) fields[key] = num;
      } else {
        fields[key] = val;
      }
    }

    updateMutation.mutate(fields);
  };

  const set = (key: string, val: string) => setValues((p) => ({ ...p, [key]: val }));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-lg mx-4 rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
        style={{ backgroundColor: "var(--surface)" }}
      >
        <h2 className="font-display text-lg font-bold mb-4" style={{ color: "var(--text)" }}>
          Edit Book
        </h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {FIELDS.map(({ key, label, type }) => (
            <div key={key}>
              <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-dim)" }}>
                {label}
              </label>
              {type === "textarea" ? (
                <textarea
                  value={values[key]}
                  onChange={(e) => set(key, e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none resize-none"
                  style={{ backgroundColor: "var(--card)", borderColor: "var(--border)", color: "var(--text)" }}
                />
              ) : (
                <input
                  type="text"
                  inputMode={type === "number" ? "decimal" : undefined}
                  value={values[key]}
                  onChange={(e) => set(key, e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                  style={{ backgroundColor: "var(--card)", borderColor: "var(--border)", color: "var(--text)" }}
                />
              )}
            </div>
          ))}

          <div className="flex justify-end gap-3 mt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-full text-sm font-medium border transition-colors hover:opacity-80"
              style={{ borderColor: "var(--border)", color: "var(--text-dim)" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={updateMutation.isPending}
              className="px-5 py-2 rounded-full text-sm font-semibold text-white transition-transform hover:scale-[1.02] disabled:opacity-50"
              style={{ backgroundColor: "var(--warm)" }}
            >
              {updateMutation.isPending ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
