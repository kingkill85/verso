import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { trpc } from "@/trpc";
import { BookCover } from "@/components/books/book-cover";

export const Route = createFileRoute("/_app/books/$id")({
  component: BookDetailPage,
});

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function BookDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const utils = trpc.useUtils();

  const bookQuery = trpc.books.byId.useQuery({ id });
  const deleteMutation = trpc.books.delete.useMutation({
    onSuccess: () => {
      utils.books.list.invalidate();
      navigate({ to: "/" });
    },
  });

  const handleDelete = () => {
    if (window.confirm("Are you sure you want to delete this book? This cannot be undone.")) {
      deleteMutation.mutate({ id });
    }
  };

  if (bookQuery.isLoading) {
    return (
      <div
        className="flex items-center justify-center py-20"
        style={{ color: "var(--text-dim)" }}
      >
        <p className="text-sm">Loading book...</p>
      </div>
    );
  }

  if (bookQuery.error || !bookQuery.data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p
          className="font-display text-lg"
          style={{ color: "var(--text)" }}
        >
          Book not found
        </p>
        <Link
          to="/"
          className="text-sm mt-2"
          style={{ color: "var(--warm)" }}
        >
          Back to library
        </Link>
      </div>
    );
  }

  const book = bookQuery.data;
  const tags: string[] = [];
  if (book.genre) tags.push(book.genre);
  if (book.year) tags.push(String(book.year));
  if (book.pageCount) tags.push(`${book.pageCount} pages`);
  tags.push(book.fileFormat.toUpperCase());

  const details = [
    { label: "Publisher", value: book.publisher },
    { label: "Year", value: book.year ? String(book.year) : null },
    { label: "Language", value: book.language?.toUpperCase() },
    { label: "ISBN", value: book.isbn },
    { label: "Format", value: book.fileFormat.toUpperCase() },
    { label: "File Size", value: formatFileSize(book.fileSize) },
    { label: "Added", value: formatDate(book.createdAt) },
  ].filter((d) => d.value);

  return (
    <div className="max-w-4xl mx-auto animate-in fade-in">
      {/* Back link */}
      <Link
        to="/"
        className="inline-flex items-center text-sm mb-6 transition-colors hover:opacity-80"
        style={{ color: "var(--text-dim)" }}
      >
        <svg
          className="w-4 h-4 mr-1"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 19l-7-7 7-7"
          />
        </svg>
        Back to library
      </Link>

      {/* Hero section */}
      <div
        className="rounded-2xl p-6 md:p-8 mb-8"
        style={{ backgroundColor: "var(--card)" }}
      >
        <div className="flex flex-col md:flex-row gap-6 md:gap-8">
          {/* Cover */}
          <div className="shrink-0 self-center md:self-start">
            <BookCover
              bookId={book.id}
              title={book.title}
              author={book.author}
              coverPath={book.coverPath}
              size="xl"
            />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <h1
              className="font-display text-[28px] font-bold leading-tight"
              style={{ color: "var(--text)" }}
            >
              {book.title}
            </h1>
            <p
              className="font-display italic text-lg mt-1"
              style={{ color: "var(--text-dim)" }}
            >
              {book.author}
            </p>

            {/* Tags */}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-3 py-1 rounded-full text-xs font-medium"
                    style={{
                      backgroundColor: "var(--bg)",
                      color: "var(--text-dim)",
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-3 mt-6">
              <button
                disabled
                className="px-6 py-2.5 rounded-full text-sm font-semibold text-white opacity-50 cursor-not-allowed"
                style={{ backgroundColor: "var(--warm)" }}
              >
                Start Reading
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                className="px-5 py-2.5 rounded-full text-sm font-medium border transition-colors hover:opacity-80"
                style={{
                  borderColor: "var(--border)",
                  color: "var(--text-dim)",
                }}
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Description */}
      {book.description && (
        <div className="mb-8">
          <h2
            className="font-display text-lg font-semibold mb-3"
            style={{ color: "var(--text)" }}
          >
            Description
          </h2>
          <p
            className="font-display italic leading-relaxed text-sm"
            style={{ color: "var(--text-dim)" }}
          >
            {book.description}
          </p>
        </div>
      )}

      {/* Details grid */}
      {details.length > 0 && (
        <div>
          <h2
            className="font-display text-lg font-semibold mb-3"
            style={{ color: "var(--text)" }}
          >
            Details
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {details.map((detail) => (
              <div
                key={detail.label}
                className="rounded-xl p-4"
                style={{ backgroundColor: "var(--card)" }}
              >
                <p
                  className="text-xs font-medium uppercase tracking-wider mb-1"
                  style={{ color: "var(--text-faint)" }}
                >
                  {detail.label}
                </p>
                <p
                  className="text-sm font-medium"
                  style={{ color: "var(--text)" }}
                >
                  {detail.value}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
