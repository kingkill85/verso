import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/trpc";
import { AuthorCard } from "@/components/authors/author-card";

export const Route = createFileRoute("/_app/authors/")({
  component: AuthorsPage,
});

function AuthorsPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const query = trpc.authors.list.useQuery({ search: search || undefined });

  const authorsList = query.data ?? [];

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4 md:mb-6">
        <div>
          <h1
            className="font-display text-xl md:text-[26px] font-bold"
            style={{ color: "var(--text)" }}
          >
            {t("authors.title")}
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-dim)" }}>
            {t("authors.subtitle", { count: authorsList.length })}
          </p>
        </div>
        <input
          type="text"
          placeholder={t("authors.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-lg px-3 py-2 text-sm w-full md:w-56 outline-none"
          style={{
            backgroundColor: "var(--card)",
            color: "var(--text)",
            border: "1px solid var(--border)",
          }}
        />
      </div>

      <div
        className="grid gap-3 md:gap-4"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}
      >
        {authorsList.map((author) => (
          <AuthorCard
            key={author.id}
            id={author.id}
            name={author.name}
            imagePath={author.imagePath}
            bookCount={author.bookCount}
          />
        ))}
      </div>

      {authorsList.length === 0 && !query.isLoading && (
        <p className="text-center py-12 text-sm" style={{ color: "var(--text-dim)" }}>
          {search ? t("search.noResults") : t("authors.title")}
        </p>
      )}
    </div>
  );
}
