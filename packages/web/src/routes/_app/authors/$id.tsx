import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { trpc } from "@/trpc";
import { useAuth } from "@/hooks/use-auth";
import { BookCard } from "@/components/books/book-card";

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
  if (query.isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p style={{ color: "var(--text-dim)" }}>Loading...</p>
      </div>
    );
  }

  const author = query.data;
  if (!author) return null;

  // Locale fallback: user locale → "en" → first available → null
  const currentLocale = i18n.language?.split("-")[0] ?? "en";
  const bio =
    author.descriptions.find((d: any) => d.locale === currentLocale)?.description ??
    author.descriptions.find((d: any) => d.locale === "en")?.description ??
    author.descriptions[0]?.description ??
    null;

  return (
    <div>
      {/* Author header */}
      <div className="flex gap-4 md:gap-6 mb-6 md:mb-8">
        <div
          className="w-24 h-24 md:w-40 md:h-40 rounded-full flex items-center justify-center text-2xl md:text-5xl font-bold text-white shrink-0 overflow-hidden"
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
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h1
                className="font-display text-xl md:text-2xl font-bold"
                style={{ color: "var(--text)" }}
              >
                {author.name}
              </h1>
              <p className="text-sm mt-0.5" style={{ color: "var(--text-dim)" }}>
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
            {isAdmin && (
              <div className="flex gap-2 shrink-0">
                <Link
                  to="/authors/$id/edit"
                  params={{ id }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors hover:opacity-80"
                  style={{ borderColor: "var(--border)", color: "var(--text-dim)" }}
                >
                  {t("authors.edit")}
                </Link>
                <button
                  onClick={() => refreshMutation.mutate({ id })}
                  disabled={refreshMutation.isPending}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors hover:opacity-80"
                  style={{ borderColor: "var(--border)", color: "var(--warm)" }}
                >
                  {refreshMutation.isPending ? "..." : t("authors.refreshMetadata")}
                </button>
              </div>
            )}
          </div>
          {bio ? (
            <p
              className="text-sm mt-3 leading-relaxed line-clamp-3"
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

      {/* Books section */}
      <h2
        className="font-display text-base font-bold mb-3"
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
