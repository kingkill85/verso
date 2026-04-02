import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { trpc } from "@/trpc";
import { useAuth } from "@/hooks/use-auth";
import { BookCard } from "@/components/books/book-card";
import { BackButton } from "@/components/back-button";
import { Pencil, RotateCcw } from "lucide-react";

export const Route = createFileRoute("/_app/authors/$id")({
  component: AuthorDetailPage,
});

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function hashColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 35%, 35%)`;
}

function formatDate(dateStr: string | null | undefined, locale: string): string | null {
  if (!dateStr) return null;
  const date = new Date(dateStr + "T00:00:00");
  if (isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric" }).format(date);
}

function AuthorDetailPage() {
  const { t, i18n } = useTranslation();
  const { id } = Route.useParams();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const query = trpc.authors.byId.useQuery({ id });
  const utils = trpc.useUtils();
  const refreshMutation = trpc.authors.refreshMetadata.useMutation({
    onSuccess: () => utils.authors.byId.invalidate({ id }),
  });

  if (!query.data) {
    if (query.isLoading || query.isFetching) {
      return (
        <div className="flex items-center justify-center py-20" style={{ color: "var(--text-dim)" }}>
          <p className="text-sm">{t("common.loading")}</p>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="font-display text-lg" style={{ color: "var(--text)" }}>{t("authors.notFound")}</p>
        <BackButton className="mt-2" />
      </div>
    );
  }

  const author = query.data;

  // Locale fallback: user locale → "en" → first available → null
  const currentLocale = i18n.language?.split("-")[0] ?? "en";
  const bio =
    author.descriptions.find((d: any) => d.locale === currentLocale)?.description ??
    author.descriptions.find((d: any) => d.locale === "en")?.description ??
    author.descriptions[0]?.description ??
    null;

  return (
    <div className="max-w-4xl mx-auto animate-in fade-in">
      <BackButton />

      {/* Hero section */}
      <div
        className="rounded-xl p-4 md:p-6 mb-5"
        style={{ backgroundColor: "var(--card)" }}
      >
        {/* Mobile: stacked layout */}
        <div className="flex flex-col items-center gap-4 md:hidden">
          {/* Photo / Initials */}
          <div
            className="w-32 h-32 rounded-xl flex items-center justify-center text-4xl font-bold text-white overflow-hidden"
            style={{ backgroundColor: hashColor(author.name) }}
          >
            {author.imagePath ? (
              <img
                src={`/api/authors/${author.id}/photo`}
                alt={author.name}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                  (e.target as HTMLImageElement).parentElement!.textContent = getInitials(author.name);
                }}
              />
            ) : (
              getInitials(author.name)
            )}
          </div>

          {/* Name & Meta */}
          <div className="text-center w-full">
            <h1
              className="font-display text-xl font-bold leading-tight"
              style={{ color: "var(--text)" }}
            >
              {author.name}
            </h1>
            <p
              className="font-display text-sm mt-0.5"
              style={{ color: "var(--text-dim)" }}
            >
              {t("authors.books", { count: author.books.length })}
            </p>
            {formatDate(author.birthDate, i18n.language) && (
              <p className="text-xs mt-0.5" style={{ color: "var(--text-faint)" }}>
                {formatDate(author.deathDate, i18n.language)
                  ? t("authors.lifespan", { birth: formatDate(author.birthDate, i18n.language), death: formatDate(author.deathDate, i18n.language) })
                  : t("authors.born", { date: formatDate(author.birthDate, i18n.language) })
                }
              </p>
            )}
          </div>

          {/* Bio */}
          {bio ? (
            <p
              className="font-display italic leading-relaxed text-sm text-center"
              style={{ color: "var(--text-dim)" }}
            >
              {bio}
            </p>
          ) : (
            <p className="text-sm italic text-center" style={{ color: "var(--text-faint)" }}>
              {t("authors.noBio")}
            </p>
          )}

          {/* Actions */}
          {isAdmin && (
            <div className="flex gap-1">
              <Link
                to="/authors/$id/edit"
                params={{ id }}
                title={t("authors.edit")}
                className="p-2.5 rounded-full border transition-colors hover:opacity-80"
                style={{ borderColor: "var(--border)", color: "var(--text-dim)" }}
              >
                <Pencil size={16} />
              </Link>
              <button
                onClick={() => refreshMutation.mutate({ id })}
                disabled={refreshMutation.isPending}
                title={t("authors.refreshMetadata")}
                className="p-2.5 rounded-full border transition-colors hover:opacity-80 disabled:opacity-50"
                style={{ borderColor: "var(--border)", color: "var(--warm)" }}
              >
                <RotateCcw size={16} />
              </button>
            </div>
          )}
        </div>

        {/* Desktop: side-by-side layout */}
        <div className="hidden md:flex gap-6">
          {/* Photo / Initials */}
          <div className="shrink-0">
            <div
              className="w-32 h-32 rounded-xl flex items-center justify-center text-4xl font-bold text-white overflow-hidden"
              style={{ backgroundColor: hashColor(author.name) }}
            >
              {author.imagePath ? (
                <img
                  src={`/api/authors/${author.id}/photo`}
                  alt={author.name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                    (e.target as HTMLImageElement).parentElement!.textContent = getInitials(author.name);
                  }}
                />
              ) : (
                getInitials(author.name)
              )}
            </div>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-start gap-2">
              <div className="min-w-0">
                <h1
                  className="font-display text-2xl font-bold leading-tight"
                  style={{ color: "var(--text)" }}
                >
                  {author.name}
                </h1>
                <p
                  className="font-display text-base mt-0.5"
                  style={{ color: "var(--text-dim)" }}
                >
                  {t("authors.books", { count: author.books.length })}
                </p>
                {formatDate(author.birthDate, i18n.language) && (
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-faint)" }}>
                    {formatDate(author.deathDate, i18n.language)
                      ? t("authors.lifespan", { birth: formatDate(author.birthDate, i18n.language), death: formatDate(author.deathDate, i18n.language) })
                      : t("authors.born", { date: formatDate(author.birthDate, i18n.language) })
                    }
                  </p>
                )}
              </div>
              {/* Icon actions — top right */}
              {isAdmin && (
                <div className="flex gap-1 shrink-0">
                  <Link
                    to="/authors/$id/edit"
                    params={{ id }}
                    title={t("authors.edit")}
                    className="p-2.5 rounded-full border transition-colors hover:opacity-80"
                    style={{ borderColor: "var(--border)", color: "var(--text-dim)" }}
                  >
                    <Pencil size={16} />
                  </Link>
                  <button
                    onClick={() => refreshMutation.mutate({ id })}
                    disabled={refreshMutation.isPending}
                    title={t("authors.refreshMetadata")}
                    className="p-2.5 rounded-full border transition-colors hover:opacity-80 disabled:opacity-50"
                    style={{ borderColor: "var(--border)", color: "var(--warm)" }}
                  >
                    <RotateCcw size={16} />
                  </button>
                </div>
              )}
            </div>

            {/* Bio */}
            {bio ? (
              <p
                className="font-display italic leading-relaxed text-sm mt-3"
                style={{ color: "var(--text-dim)" }}
              >
                {bio}
              </p>
            ) : (
              <p className="text-sm italic mt-3" style={{ color: "var(--text-faint)" }}>
                {t("authors.noBio")}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Books section */}
      <h2
        className="font-display text-sm font-semibold mb-3"
        style={{ color: "var(--text)" }}
      >
        {t("authors.booksSection")}
      </h2>
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}
      >
        {author.books.map((book: any) => (
          <BookCard
            key={book.id}
            id={book.id}
            title={book.title}
            author={book.author}
            coverPath={book.coverPath}
          />
        ))}
      </div>
    </div>
  );
}
