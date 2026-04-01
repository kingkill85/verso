import { useState, useEffect, useMemo, useRef } from "react";
import { createFileRoute, Link, useNavigate, useBlocker } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { LANGUAGE_DISPLAY_NAMES } from "@verso/shared";
import { trpc } from "@/trpc";
import { BookCover } from "@/components/books/book-cover";
import { getAccessToken } from "@/lib/auth";
import { BackButton } from "@/components/back-button";

export const Route = createFileRoute("/_app/books/$id_/edit")({
  component: BookEditPage,
});

const FIELDS: { key: string; labelKey: string; type: "text" | "number" | "textarea"; half?: boolean; group: string }[] = [
  { key: "title", labelKey: "edit.field.title", type: "text", group: "basic" },
  // author is handled separately as a multi-pick component
  { key: "description", labelKey: "edit.field.description", type: "textarea", group: "basic" },
  // genre is handled separately as a multi-pick component
  // language is handled separately as a combobox component
  { key: "series", labelKey: "edit.field.series", type: "text", half: true, group: "classification" },
  { key: "seriesIndex", labelKey: "edit.field.seriesIndex", type: "number", half: true, group: "classification" },
  // publisher is handled separately as a combobox component
  { key: "year", labelKey: "edit.field.year", type: "number", half: true, group: "publication" },
  { key: "isbn", labelKey: "edit.field.isbn", type: "text", half: true, group: "publication" },
  { key: "pageCount", labelKey: "edit.field.pages", type: "number", group: "publication" },
];

const NUM_FIELDS = new Set(["year", "pageCount", "seriesIndex"]);

// Read and consume metadata selections from sessionStorage (one-shot on mount)
function consumeMetadataApply(bookId: string): { fields: Record<string, string>; coverUrl: string | null } | null {
  const storageKey = `verso-metadata-apply-${bookId}`;
  const raw = sessionStorage.getItem(storageKey);
  if (!raw) return null;
  sessionStorage.removeItem(storageKey);
  try {
    const applied = JSON.parse(raw) as Record<string, string>;
    let coverUrl: string | null = null;
    if (applied.coverUrl) {
      coverUrl = applied.coverUrl;
      delete applied.coverUrl;
    }
    return { fields: applied, coverUrl };
  } catch {
    return null;
  }
}

function BookEditPage() {
  const { t } = useTranslation();
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const bookQuery = trpc.books.byId.useQuery({ id });

  // Consume metadata on mount — before any effects run
  const [metadataApply] = useState(() => consumeMetadataApply(id));

  const [values, setValues] = useState<Record<string, string>>({});
  const [coverUrl, setCoverUrl] = useState<string | null>(metadataApply?.coverUrl ?? null);
  const [initialValues, setInitialValues] = useState<Record<string, string>>({});
  const [initialized, setInitialized] = useState(false);
  const [saving, setSaving] = useState(false);

  // Author multi-pick state
  const [authorTags, setAuthorTags] = useState<string[]>([]);
  const [initialAuthorTags, setInitialAuthorTags] = useState<string[]>([]);
  const authorsQuery = trpc.authors.list.useQuery({});

  // Genre multi-pick state
  const [selectedGenres, setSelectedGenres] = useState<{ id: string; slug: string; name: string }[]>([]);
  const [initialGenreIds, setInitialGenreIds] = useState<string[]>([]);

  // Publisher combobox state
  const [publisherValue, setPublisherValue] = useState("");
  const [initialPublisher, setInitialPublisher] = useState("");
  const publishersQuery = trpc.publishers.list.useQuery({});

  // Language dropdown state
  const [languageValue, setLanguageValue] = useState("");
  const [initialLanguage, setInitialLanguage] = useState("");

  // Initialize form from book data ONCE, merge metadata selections on top
  useEffect(() => {
    if (!bookQuery.data || initialized) return;
    const v: Record<string, string> = {};
    for (const { key } of FIELDS) {
      const val = (bookQuery.data as any)[key];
      v[key] = val != null ? String(val) : "";
    }
    // Handle author separately
    const authorStr = metadataApply?.fields?.author ?? bookQuery.data.author ?? "";
    v["author"] = authorStr;
    const tags = authorStr.split(",").map((s: string) => s.trim()).filter(Boolean);
    setAuthorTags(tags);
    setInitialAuthorTags(tags);

    // Initialize genres from book data
    const bookGenres = (bookQuery.data as any).genres ?? [];
    setSelectedGenres(bookGenres);
    setInitialGenreIds(bookGenres.map((g: any) => g.id));

    // Handle publisher separately
    const pubStr = metadataApply?.fields?.publisher ?? bookQuery.data.publisher ?? "";
    setPublisherValue(pubStr);
    setInitialPublisher(pubStr);

    // Handle language separately
    const langStr = metadataApply?.fields?.language ?? bookQuery.data.language ?? "";
    setLanguageValue(langStr);
    setInitialLanguage(langStr);

    setInitialValues(v);
    setValues(metadataApply ? { ...v, ...metadataApply.fields } : v);
    setInitialized(true);
  }, [bookQuery.data, metadataApply, initialized]);

  const isDirty = useMemo(() => {
    if (coverUrl) return true;
    if (authorTags.join(", ") !== initialAuthorTags.join(", ")) return true;
    const currentGenreIds = selectedGenres.map((g) => g.id).sort().join(",");
    const origGenreIds = [...initialGenreIds].sort().join(",");
    if (currentGenreIds !== origGenreIds) return true;
    if (publisherValue !== initialPublisher) return true;
    if (languageValue !== initialLanguage) return true;
    return Object.keys(values).some((k) => values[k] !== initialValues[k]);
  }, [values, initialValues, coverUrl, authorTags, initialAuthorTags, selectedGenres, initialGenreIds, publisherValue, initialPublisher, languageValue, initialLanguage]);

  useEffect(() => {
    if (!isDirty || saving) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty, saving]);

  // Don't block navigation while saving
  useBlocker({ condition: isDirty && !saving });

  const updateMutation = trpc.books.update.useMutation({
    onSuccess: () => {
      utils.books.byId.invalidate({ id });
      utils.books.list.invalidate();
      navigate({ to: "/books/$id", params: { id }, replace: true });
    },
  });

  const handleSave = () => {
    if (!bookQuery.data) return;
    setSaving(true);
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
    // Include author from tags
    const authorStr = authorTags.join(", ");
    if (authorStr !== (bookQuery.data.author ?? "")) {
      fields.author = authorStr || null;
    }
    // Include publisher
    if (publisherValue !== (bookQuery.data.publisher ?? "")) {
      fields.publisher = publisherValue.trim() || null;
    }
    // Include language
    if (languageValue !== (bookQuery.data.language ?? "")) {
      fields.language = languageValue || null;
    }
    // Include genre IDs
    fields.genreIds = selectedGenres.map((g) => g.id);
    if (coverUrl) fields.coverUrl = coverUrl;
    updateMutation.mutate(fields as any);
  };

  const set = (key: string, val: string) => setValues((p) => ({ ...p, [key]: val }));

  if (bookQuery.isLoading) {
    return <div className="flex items-center justify-center py-20" style={{ color: "var(--text-dim)" }}><p className="text-sm">{t("common.loading")}</p></div>;
  }
  if (bookQuery.error || !bookQuery.data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="font-display text-lg" style={{ color: "var(--text)" }}>{t("book.notFound")}</p>
        <button onClick={() => window.history.back()} className="text-sm mt-2" style={{ color: "var(--warm)" }}>{t("common.back")}</button>
      </div>
    );
  }

  const book = bookQuery.data;
  const groups = [
    { id: "basic", label: t("edit.group.basic") },
    { id: "classification", label: t("edit.group.classification") },
    { id: "publication", label: t("edit.group.publication") },
  ];

  return (
    <div className="max-w-4xl mx-auto animate-in fade-in">
      <div className="flex items-center justify-between mb-6">
        <BackButton label={t("edit.backTo", { name: book.title })} />
        <div className="flex gap-3">
          <Link to="/books/$id/metadata" params={{ id }}
            className="px-5 py-2 rounded-full text-sm font-medium border transition-colors hover:opacity-80"
            style={{ borderColor: "var(--border)", color: "var(--text-dim)" }}>
            {t("metadata.findMetadata")}
          </Link>
          <button
            onClick={handleSave}
            disabled={!isDirty || updateMutation.isPending}
            className="px-5 py-2 rounded-full text-sm font-semibold text-white transition-transform hover:scale-[1.02] disabled:opacity-50"
            style={{ backgroundColor: "var(--warm)" }}
          >
            {updateMutation.isPending ? t("edit.saving") : t("edit.save")}
          </button>
        </div>
      </div>

      {updateMutation.isError && (
        <div className="rounded-lg px-4 py-3 mb-4 text-sm" style={{ backgroundColor: "rgba(200,50,50,0.1)", color: "#c44" }}>
          {t("edit.saveFailed")}
        </div>
      )}

      <h1 className="font-display text-xl font-bold mb-6" style={{ color: "var(--text)" }}>{t("edit.editBook")}</h1>

      <div className="flex flex-col md:flex-row gap-8">
        <CoverSection
          bookId={book.id}
          book={book}
          coverUrl={coverUrl}
          onCoverUrlChange={setCoverUrl}
          onCoverUploaded={() => { bookQuery.refetch(); }}
          t={t}
        />

        <div className="flex-1 min-w-0 flex flex-col gap-6">
          {groups.map((group) => {
            const groupFields = FIELDS.filter((f) => f.group === group.id);
            return (
              <div key={group.id} className="rounded-xl p-5" style={{ backgroundColor: "var(--card)" }}>
                <p className="text-xs font-medium uppercase tracking-wider mb-4" style={{ color: "var(--text-faint)" }}>{group.label}</p>
                <div className="flex flex-col gap-3">
                  {group.id === "publication" && (
                    <PublisherCombobox
                      value={publisherValue}
                      onChange={setPublisherValue}
                      suggestions={publishersQuery.data ?? []}
                      t={t}
                    />
                  )}
                  {renderFieldRows(groupFields, values, set, t)}
                  {group.id === "basic" && (
                    <AuthorMultiPick
                      tags={authorTags}
                      onChange={setAuthorTags}
                      suggestions={authorsQuery.data?.map((a) => a.name) ?? []}
                      t={t}
                    />
                  )}
                  {group.id === "classification" && (
                    <>
                      <LanguageCombobox
                        value={languageValue}
                        onChange={setLanguageValue}
                        t={t}
                      />
                      <GenreMultiPick
                        selectedGenres={selectedGenres}
                        onChange={setSelectedGenres}
                        t={t}
                      />
                    </>
                  )}
                </div>
              </div>
            );
          })}

        </div>
      </div>
    </div>
  );
}

function CoverSection({ bookId, book, coverUrl, onCoverUrlChange, onCoverUploaded, t }: {
  bookId: string;
  book: { id: string; title: string; author: string; coverPath: string | null; updatedAt: string | null };
  coverUrl: string | null;
  onCoverUrlChange: (url: string | null) => void;
  onCoverUploaded: () => void;
  t: (key: string) => string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const token = getAccessToken();
      const res = await fetch(`/api/covers/${bookId}`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (res.ok) {
        onCoverUrlChange(null); // clear any metadata cover
        onCoverUploaded();
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const token = getAccessToken();
      const res = await fetch(`/api/covers/${bookId}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        onCoverUrlChange(null);
        onCoverUploaded();
      }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="shrink-0 self-center md:self-start flex flex-col items-center gap-3">
      {coverUrl ? (
        <img src={coverUrl} alt="" className="w-45 rounded-lg object-cover" />
      ) : (
        <BookCover bookId={book.id} title={book.title} author={book.author} coverPath={book.coverPath} updatedAt={book.updatedAt} size="xl" />
      )}

      {coverUrl && (
        <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>{t("edit.newCoverFromMetadata")}</p>
      )}

      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />

      <div className="flex gap-2">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors hover:opacity-80"
          style={{ borderColor: "var(--border)", color: "var(--text-dim)" }}
        >
          {uploading ? t("edit.uploading") : t("edit.uploadCover")}
        </button>
        {(book.coverPath || coverUrl) && (
          <button
            onClick={coverUrl ? () => onCoverUrlChange(null) : handleDelete}
            disabled={deleting}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors hover:opacity-80"
            style={{ borderColor: "var(--border)", color: "#c44" }}
          >
            {deleting ? t("edit.removing") : t("edit.removeCover")}
          </button>
        )}
      </div>
    </div>
  );
}

function renderFieldRows(fields: typeof FIELDS, values: Record<string, string>, set: (key: string, val: string) => void, t: (key: string) => string) {
  const rows: React.ReactNode[] = [];
  let i = 0;
  while (i < fields.length) {
    const field = fields[i];
    const next = fields[i + 1];
    if (field.half && next?.half) {
      rows.push(
        <div key={field.key} className="grid grid-cols-2 gap-3">
          {renderField(field, values, set, t)}
          {renderField(next, values, set, t)}
        </div>
      );
      i += 2;
    } else {
      rows.push(<div key={field.key}>{renderField(field, values, set, t)}</div>);
      i += 1;
    }
  }
  return rows;
}

function renderField(field: typeof FIELDS[number], values: Record<string, string>, set: (key: string, val: string) => void, t: (key: string) => string) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-dim)" }}>{t(field.labelKey)}</label>
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

function GenreMultiPick({ selectedGenres, onChange, t }: {
  selectedGenres: { id: string; slug: string; name: string }[];
  onChange: (genres: { id: string; slug: string; name: string }[]) => void;
  t: (key: string, opts?: any) => string;
}) {
  const [input, setInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const genresQuery = trpc.genres.list.useQuery({});
  const createGenreMutation = trpc.genres.create.useMutation();
  const allGenres = genresQuery.data ?? [];

  const displayName = (genre: { slug: string; name: string; isDefault?: boolean }) => {
    if (genre.isDefault) {
      const translated = t(`genre.${genre.slug}`);
      return translated !== `genre.${genre.slug}` ? translated : genre.name;
    }
    return genre.name;
  };

  const filtered = input.trim()
    ? allGenres.filter(
        (g) =>
          (g.name.toLowerCase().includes(input.toLowerCase()) ||
           displayName(g).toLowerCase().includes(input.toLowerCase())) &&
          !selectedGenres.some((s) => s.id === g.id)
      )
    : [];

  const addGenre = (genre: { id: string; slug: string; name: string }) => {
    if (selectedGenres.some((s) => s.id === genre.id)) return;
    onChange([...selectedGenres, genre]);
    setInput("");
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  const removeGenre = (index: number) => {
    onChange(selectedGenres.filter((_, i) => i !== index));
  };

  const handleCreateCustom = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    const created = await createGenreMutation.mutateAsync({ name: trimmed });
    addGenre({ id: created.id, slug: created.slug, name: created.name });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (filtered.length > 0) {
        addGenre(filtered[0]);
      } else if (input.trim()) {
        handleCreateCustom();
      }
    } else if (e.key === "Backspace" && !input && selectedGenres.length > 0) {
      removeGenre(selectedGenres.length - 1);
    }
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const showCreateOption = input.trim() && filtered.length === 0;

  return (
    <div ref={containerRef}>
      <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-dim)" }}>
        {t("edit.field.genre")}
      </label>
      <div
        className="flex flex-wrap gap-1.5 rounded-lg border px-2 py-1.5 min-h-[38px] cursor-text"
        style={{ backgroundColor: "var(--bg)", borderColor: "var(--border)" }}
        onClick={() => inputRef.current?.focus()}
      >
        {selectedGenres.map((genre, i) => (
          <span
            key={genre.id}
            className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium"
            style={{ backgroundColor: "var(--card)", color: "var(--text)" }}
          >
            {displayName({ ...genre, isDefault: allGenres.find((g) => g.id === genre.id)?.isDefault ?? false })}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeGenre(i); }}
              className="ml-0.5 hover:opacity-70"
              style={{ color: "var(--text-faint)" }}
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => { setInput(e.target.value); setShowSuggestions(true); }}
          onFocus={() => setShowSuggestions(true)}
          onKeyDown={handleKeyDown}
          placeholder={selectedGenres.length === 0 ? t("edit.field.genre") : ""}
          className="flex-1 min-w-[100px] bg-transparent outline-none text-sm py-0.5"
          style={{ color: "var(--text)" }}
        />
      </div>
      {showSuggestions && (filtered.length > 0 || showCreateOption) && (
        <div
          className="mt-1 rounded-lg border shadow-lg overflow-hidden max-h-40 overflow-y-auto"
          style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
        >
          {filtered.slice(0, 8).map((genre) => (
            <button
              key={genre.id}
              type="button"
              onClick={() => addGenre(genre)}
              className="w-full text-left px-3 py-2 text-sm hover:opacity-80 transition-colors"
              style={{ color: "var(--text)" }}
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "var(--bg)")}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              {displayName(genre)}
            </button>
          ))}
          {showCreateOption && (
            <button
              type="button"
              onClick={handleCreateCustom}
              className="w-full text-left px-3 py-2 text-sm hover:opacity-80 transition-colors italic"
              style={{ color: "var(--text-dim)" }}
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "var(--bg)")}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              {t("genre.addCustom", { name: input.trim() })}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function AuthorMultiPick({ tags, onChange, suggestions, t }: {
  tags: string[];
  onChange: (tags: string[]) => void;
  suggestions: string[];
  t: (key: string) => string;
}) {
  const [input, setInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = input.trim()
    ? suggestions.filter(
        (s) =>
          s.toLowerCase().includes(input.toLowerCase()) &&
          !tags.some((t) => t.toLowerCase() === s.toLowerCase())
      )
    : [];

  const addTag = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (tags.some((t) => t.toLowerCase() === trimmed.toLowerCase())) return;
    onChange([...tags, trimmed]);
    setInput("");
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  const removeTag = (index: number) => {
    onChange(tags.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (filtered.length > 0) {
        addTag(filtered[0]);
      } else if (input.trim()) {
        addTag(input);
      }
    } else if (e.key === "Backspace" && !input && tags.length > 0) {
      removeTag(tags.length - 1);
    }
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={containerRef}>
      <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-dim)" }}>
        {t("edit.field.author")}
      </label>
      <div
        className="flex flex-wrap gap-1.5 rounded-lg border px-2 py-1.5 min-h-[38px] cursor-text"
        style={{ backgroundColor: "var(--bg)", borderColor: "var(--border)" }}
        onClick={() => inputRef.current?.focus()}
      >
        {tags.map((tag, i) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium"
            style={{ backgroundColor: "var(--card)", color: "var(--text)" }}
          >
            {tag}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeTag(i); }}
              className="ml-0.5 hover:opacity-70"
              style={{ color: "var(--text-faint)" }}
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => { setInput(e.target.value); setShowSuggestions(true); }}
          onFocus={() => setShowSuggestions(true)}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? t("edit.field.author") : ""}
          className="flex-1 min-w-[100px] bg-transparent outline-none text-sm py-0.5"
          style={{ color: "var(--text)" }}
        />
      </div>
      {showSuggestions && filtered.length > 0 && (
        <div
          className="mt-1 rounded-lg border shadow-lg overflow-hidden max-h-40 overflow-y-auto"
          style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
        >
          {filtered.slice(0, 8).map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => addTag(name)}
              className="w-full text-left px-3 py-2 text-sm hover:opacity-80 transition-colors"
              style={{ color: "var(--text)" }}
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "var(--bg)")}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PublisherCombobox({ value, onChange, suggestions, t }: {
  value: string;
  onChange: (value: string) => void;
  suggestions: { id: string; name: string; bookCount: number }[];
  t: (key: string) => string;
}) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = value.trim()
    ? suggestions.filter(
        (s) => s.name.toLowerCase().includes(value.toLowerCase()) && s.name !== value
      )
    : [];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={containerRef}>
      <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-dim)" }}>
        {t("edit.field.publisher")}
      </label>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => { onChange(e.target.value); setShowSuggestions(true); }}
        onFocus={() => setShowSuggestions(true)}
        className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
        style={{ backgroundColor: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
      />
      {showSuggestions && filtered.length > 0 && (
        <div
          className="mt-1 rounded-lg border shadow-lg overflow-hidden max-h-40 overflow-y-auto"
          style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
        >
          {filtered.slice(0, 8).map((pub) => (
            <button
              key={pub.id}
              type="button"
              onClick={() => { onChange(pub.name); setShowSuggestions(false); }}
              className="w-full text-left px-3 py-2 text-sm hover:opacity-80 transition-colors"
              style={{ color: "var(--text)" }}
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "var(--bg)")}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              {pub.name}
              <span className="ml-2 text-xs" style={{ color: "var(--text-faint)" }}>
                ({pub.bookCount})
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function LanguageCombobox({ value, onChange, t }: {
  value: string;
  onChange: (value: string) => void;
  t: (key: string) => string;
}) {
  const [input, setInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const displayValue = value ? (LANGUAGE_DISPLAY_NAMES[value] ?? value) : "";

  const allLanguages = Object.entries(LANGUAGE_DISPLAY_NAMES).map(([code, name]) => ({ code, name }));

  const filtered = input.trim()
    ? allLanguages.filter(
        (l) =>
          l.name.toLowerCase().includes(input.toLowerCase()) ||
          l.code.toLowerCase().includes(input.toLowerCase())
      )
    : allLanguages;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={containerRef}>
      <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-dim)" }}>
        {t("edit.field.language")}
      </label>
      {showSuggestions ? (
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          autoFocus
          placeholder={t("edit.field.language")}
          className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
          style={{ backgroundColor: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
        />
      ) : (
        <button
          type="button"
          onClick={() => { setInput(""); setShowSuggestions(true); }}
          className="w-full rounded-lg border px-3 py-2 text-sm text-left outline-none"
          style={{ backgroundColor: "var(--bg)", borderColor: "var(--border)", color: value ? "var(--text)" : "var(--text-faint)" }}
        >
          {displayValue || t("edit.field.language")}
        </button>
      )}
      {showSuggestions && (
        <div
          className="mt-1 rounded-lg border shadow-lg overflow-hidden max-h-40 overflow-y-auto"
          style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
        >
          {value && (
            <button
              type="button"
              onClick={() => { onChange(""); setShowSuggestions(false); }}
              className="w-full text-left px-3 py-2 text-sm hover:opacity-80 transition-colors italic"
              style={{ color: "var(--text-faint)" }}
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "var(--bg)")}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              {t("common.clear")}
            </button>
          )}
          {filtered.map((lang) => (
            <button
              key={lang.code}
              type="button"
              onClick={() => { onChange(lang.code); setShowSuggestions(false); setInput(""); }}
              className="w-full text-left px-3 py-2 text-sm hover:opacity-80 transition-colors"
              style={{ color: "var(--text)" }}
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "var(--bg)")}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              {lang.name}
              <span className="ml-2 text-xs" style={{ color: "var(--text-faint)" }}>
                ({lang.code})
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
