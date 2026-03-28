import { useState, useEffect, useMemo } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { trpc } from "@/trpc";
import { BookCover } from "@/components/books/book-cover";
import { SourceBadge } from "@/components/metadata/source-badge";
import type { ExternalBook } from "@verso/shared";

const METADATA_STORAGE_KEY = (id: string) => `verso-metadata-apply-${id}`;

export const Route = createFileRoute("/_app/books/$id_/metadata")({
  component: BookMetadataPage,
});

type FieldKey = "title" | "author" | "description" | "genre" | "publisher" | "year" | "isbn" | "language" | "pageCount" | "series" | "seriesIndex";

const DIFF_FIELDS: { key: FieldKey; labelKey: string }[] = [
  { key: "title", labelKey: "edit.field.title" },
  { key: "author", labelKey: "edit.field.author" },
  { key: "description", labelKey: "edit.field.description" },
  { key: "genre", labelKey: "edit.field.genre" },
  { key: "publisher", labelKey: "edit.field.publisher" },
  { key: "year", labelKey: "edit.field.year" },
  { key: "isbn", labelKey: "edit.field.isbn" },
  { key: "language", labelKey: "edit.field.language" },
  { key: "pageCount", labelKey: "edit.field.pages" },
  { key: "series", labelKey: "edit.field.series" },
  { key: "seriesIndex", labelKey: "edit.field.seriesIndex" },
];

const NUM_FIELDS = new Set(["year", "pageCount", "seriesIndex"]);

function str(val: unknown): string {
  return val != null ? String(val) : "";
}

function BookMetadataPage() {
  const { t } = useTranslation();
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const bookQuery = trpc.books.byId.useQuery({ id });

  const [searchTitle, setSearchTitle] = useState("");
  const [searchAuthor, setSearchAuthor] = useState("");
  const [searchIsbn, setSearchIsbn] = useState("");
  const [searchLang, setSearchLang] = useState("");
  const [searchResults, setSearchResults] = useState<ExternalBook[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [selected, setSelected] = useState<ExternalBook | null>(null);
  const [checkedFields, setCheckedFields] = useState<Record<string, boolean>>({});
  const [coverChecked, setCoverChecked] = useState(false);
  const [coverChoice, setCoverChoice] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (bookQuery.data) {
      setSearchTitle(bookQuery.data.title ?? "");
      setSearchAuthor(bookQuery.data.author ?? "");
      setSearchIsbn((bookQuery.data as any).isbn ?? "");
      setSearchLang((bookQuery.data as any).language ?? "");
    }
  }, [bookQuery.data]);

  // Map language codes to search-friendly language names
  const langNames: Record<string, string> = {
    de: "deutsch", deu: "deutsch", ger: "deutsch",
    fr: "français", fra: "français", fre: "français",
    es: "español", spa: "español",
    it: "italiano", ita: "italiano",
    pt: "português", por: "português",
    nl: "nederlands", nld: "nederlands", dut: "nederlands",
  };

  const handleSearch = async () => {
    const ti = searchTitle.trim();
    const a = searchAuthor.trim();
    const i = searchIsbn.trim();
    const l = searchLang.trim().toLowerCase();
    if (!ti && !a && !i) return;

    const langHint = langNames[l] || "";
    const queryParts = [ti, a, langHint].filter(Boolean);

    setSearching(true);
    setSearchError(false);
    setSearchResults(null);
    setSelected(null);

    try {
      const results = await utils.client.metadata.search.query({
        bookId: id,
        ...(i ? { isbn: i } : {}),
        ...(ti ? { title: ti } : {}),
        ...(a ? { author: a } : {}),
        query: queryParts.join(" ") || undefined,
      });
      setSearchResults(results);
    } catch {
      setSearchError(true);
    } finally {
      setSearching(false);
    }
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
    setCoverChoice(selected.coverUrl);
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
    if (coverChecked && coverChoice) {
      applied.coverUrl = coverChoice;
    }
    sessionStorage.setItem(METADATA_STORAGE_KEY(id), JSON.stringify(applied));
    navigate({ to: "/books/$id/edit", params: { id } });
  };

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

  return (
    <div className="max-w-3xl mx-auto animate-in fade-in">
      <Link to="/books/$id" params={{ id }} className="inline-flex items-center text-sm mb-6 transition-colors hover:opacity-80" style={{ color: "var(--text-dim)" }}>
        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        {t("common.back")}
      </Link>

      <h1 className="font-display text-xl font-bold mb-6" style={{ color: "var(--text)" }}>{t("metadata.findMetadata")}</h1>

      {!selected ? (
        <>
          {/* Search fields */}
          <div className="rounded-xl p-5 mb-6" style={{ backgroundColor: "var(--card)" }}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-dim)" }}>{t("edit.field.title")}</label>
                <input type="text" value={searchTitle} onChange={(e) => setSearchTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSearch(); } }}
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                  style={{ backgroundColor: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-dim)" }}>{t("edit.field.author")}</label>
                <input type="text" value={searchAuthor} onChange={(e) => setSearchAuthor(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSearch(); } }}
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                  style={{ backgroundColor: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }} />
              </div>
            </div>
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-dim)" }}>{t("metadata.isbn")}</label>
                <input type="text" value={searchIsbn} onChange={(e) => setSearchIsbn(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSearch(); } }}
                  placeholder={t("metadata.isbnPlaceholder")}
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                  style={{ backgroundColor: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }} />
              </div>
              <div className="w-20">
                <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-dim)" }}>{t("metadata.lang")}</label>
                <input type="text" value={searchLang} onChange={(e) => setSearchLang(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSearch(); } }}
                  placeholder="de"
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                  style={{ backgroundColor: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }} />
              </div>
              <button onClick={handleSearch}
                className="px-5 py-2 rounded-lg text-sm font-medium text-white shrink-0"
                style={{ backgroundColor: "var(--warm)" }}>
                {t("metadata.search")}
              </button>
            </div>
          </div>

          {/* Results */}
          <div className="flex flex-col gap-2">
            {searching && <p className="text-sm py-8 text-center" style={{ color: "var(--text-dim)" }}>{t("metadata.searching")}</p>}
            {searchError && <p className="text-sm py-8 text-center" style={{ color: "var(--text-dim)" }}>{t("metadata.searchFailed")}</p>}
            {!searching && !searchError && searchResults?.length === 0 && (
              <p className="text-sm py-8 text-center" style={{ color: "var(--text-dim)" }}>{t("metadata.noResults")}</p>
            )}
            {(searchResults ?? []).map((result: ExternalBook, i: number) => (
              <button
                key={`${result.source}-${result.sourceId}-${i}`}
                onClick={() => setSelected(result)}
                className="flex items-start gap-3 rounded-xl p-4 text-left transition-colors hover:opacity-90"
                style={{ backgroundColor: "var(--card)" }}
              >
                {result.coverUrl ? (
                  <img src={result.coverUrl} alt="" className="w-12 h-[68px] object-cover rounded-[3px] shrink-0" />
                ) : (
                  <div className="w-12 h-[68px] rounded-[3px] shrink-0 flex items-center justify-center text-[8px]" style={{ backgroundColor: "var(--bg)", color: "var(--text-faint)" }}>{t("metadata.noCover")}</div>
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
            <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>{t("metadata.reviewChanges")}</h2>
            <SourceBadge source={selected.source} />
          </div>

          {/* Cover options */}
          {(selected.coverUrl || (selected.altCovers && selected.altCovers.length > 0)) && (
            <div className="rounded-xl p-4 mb-3" style={{ backgroundColor: "var(--card)" }}>
              <p className="text-[10px] uppercase tracking-wider mb-3" style={{ color: "var(--text-faint)" }}>{t("common.cover")}</p>
              <div className="flex items-end gap-3 overflow-x-auto pb-1">
                {/* Keep current */}
                <button
                  onClick={() => { setCoverChecked(false); setCoverChoice(undefined); }}
                  className="text-center shrink-0"
                  style={{ opacity: !coverChecked ? 1 : 0.4 }}
                >
                  <BookCover bookId={id} title={book.title} author={book.author} coverPath={book.coverPath} updatedAt={book.updatedAt} size="sm" />
                  <p className="text-[10px] mt-1" style={{ color: "var(--text-faint)" }}>{t("common.keep")}</p>
                </button>

                {/* Result's own cover */}
                {selected.coverUrl && (
                  <button
                    onClick={() => { setCoverChecked(true); setCoverChoice(selected.coverUrl); }}
                    className="text-center shrink-0"
                    style={{ opacity: coverChecked && coverChoice === selected.coverUrl ? 1 : 0.4 }}
                  >
                    <img src={selected.coverUrl} alt="" className="w-[52px] h-[76px] object-cover rounded-[3px]" />
                    <p className="text-[10px] mt-1"><SourceBadge source={selected.source} /></p>
                  </button>
                )}

                {/* All alternative covers from other sources */}
                {selected.altCovers?.map((alt, i) => (
                  <button
                    key={i}
                    onClick={() => { setCoverChecked(true); setCoverChoice(alt.url); }}
                    className="text-center shrink-0"
                    style={{ opacity: coverChecked && coverChoice === alt.url ? 1 : 0.4 }}
                  >
                    <img src={alt.url} alt="" className="w-[52px] h-[76px] object-cover rounded-[3px]" />
                    <p className="text-[10px] mt-1 flex items-center gap-1 justify-center">
                      <SourceBadge source={alt.source as any} />
                      {(alt.source === "goodreads" || alt.source === "google") && <span style={{ color: "var(--warm)" }}>HD</span>}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Field diffs */}
          <div className="flex flex-col gap-1 mb-6">
            {DIFF_FIELDS.map(({ key, labelKey }) => {
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
                  <span className="text-xs font-medium w-20 shrink-0" style={{ color: "var(--text-dim)" }}>{t(labelKey)}</span>
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
              {t("metadata.backToResults")}
            </button>
            <button
              onClick={handleApply}
              disabled={checkedCount === 0}
              className="px-5 py-2 rounded-full text-sm font-semibold text-white hover:scale-[1.02] disabled:opacity-50"
              style={{ backgroundColor: "var(--warm)" }}
            >
              {t("metadata.applyChanges", { count: checkedCount })}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
