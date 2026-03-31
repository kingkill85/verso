import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { trpc } from "@/trpc";
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

function AuthorDetailPage() {
  const { t } = useTranslation();
  const { id } = Route.useParams();
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

  return (
    <div>
      {/* Author header */}
      <div className="flex gap-4 md:gap-6 mb-6 md:mb-8">
        <div
          className="w-20 h-20 md:w-[120px] md:h-[120px] rounded-full flex items-center justify-center text-2xl md:text-4xl font-bold text-white shrink-0 overflow-hidden"
          style={{ backgroundColor: hashColor(author.name) }}
        >
          {author.imagePath ? (
            <img
              src={`/api/storage/${author.imagePath}`}
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
          <h1
            className="font-display text-xl md:text-2xl font-bold"
            style={{ color: "var(--text)" }}
          >
            {author.name}
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-dim)" }}>
            {t("authors.books", { count: author.books.length })}
          </p>
          {author.description ? (
            <p
              className="text-sm mt-3 leading-relaxed line-clamp-3"
              style={{ color: "var(--text-dim)" }}
            >
              {author.description}
            </p>
          ) : (
            <div className="flex items-center gap-2 mt-3">
              <p className="text-sm italic" style={{ color: "var(--text-faint)" }}>
                {t("authors.noBio")}
              </p>
              <button
                onClick={() => refreshMutation.mutate({ id })}
                disabled={refreshMutation.isPending}
                className="text-xs underline"
                style={{ color: "var(--warm)" }}
              >
                {refreshMutation.isPending ? "..." : t("authors.refreshMetadata")}
              </button>
            </div>
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
        {author.books.map((book) => (
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
