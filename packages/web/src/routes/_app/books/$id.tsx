import { useState, useRef, useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { trpc } from "@/trpc";
import { BookCover } from "@/components/books/book-cover";
import { AddToShelfMenu } from "@/components/shelves/add-to-shelf-menu";
import { AnnotationsTab } from "@/components/books/annotations-tab";
import { BookmarksTab } from "@/components/books/bookmarks-tab";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { getAccessToken } from "@/lib/auth";
import { useAuth } from "@/hooks/use-auth";

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
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<"details" | "annotations" | "bookmarks">("details");
  const bookQuery = trpc.books.byId.useQuery({ id });
  const progressQuery = trpc.progress.get.useQuery({ bookId: id });
  const annotationsQuery = trpc.annotations.list.useQuery({ bookId: id });
  const bookmarksQuery = trpc.annotations.listBookmarks.useQuery({ bookId: id });
  const deleteMutation = trpc.books.delete.useMutation({
    onSuccess: () => {
      utils.books.list.invalidate();
      utils.books.currentlyReading.invalidate();
      utils.shelves.list.invalidate();
      utils.shelves.byId.invalidate();
      utils.stats.overview.invalidate();
      navigate({ to: "/" });
    },
  });

  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleDelete = () => {
    setConfirmDelete(true);
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
              updatedAt={book.updatedAt}
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
            {book.series && (
              <p
                className="text-sm mt-1"
                style={{ color: "var(--text-faint)" }}
              >
                Book {book.seriesIndex || "?"} of {book.series}
              </p>
            )}

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
            <div className="flex flex-wrap items-center gap-3 mt-6">
              {book.fileFormat === "epub" && (
                <Link
                  to="/books/$id/read"
                  params={{ id }}
                  search={{ cfi: undefined }}
                  className="inline-flex items-center px-6 py-2.5 rounded-full text-sm font-semibold text-white transition-transform hover:scale-[1.02]"
                  style={{ backgroundColor: "var(--warm)" }}
                >
                  {progressQuery.data?.finishedAt
                    ? "Read Again"
                    : progressQuery.data?.percentage
                      ? `Continue Reading (${Math.round(progressQuery.data.percentage)}%)`
                      : "Start Reading"}
                </Link>
              )}
              <AddToShelfMenu bookId={id} />
              <OverflowMenu
                bookId={id}
                bookTitle={book.title}
                fileFormat={book.fileFormat}
                hasProgress={!!progressQuery.data && progressQuery.data.percentage > 0}
                isFinished={!!progressQuery.data?.finishedAt}
                onDelete={handleDelete}
                isDeleting={deleteMutation.isPending}
                isAdmin={user?.role === "admin"}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Progress section */}
      {progressQuery.data && !progressQuery.data.finishedAt && progressQuery.data.percentage > 0 && (
        <div
          className="rounded-xl p-4 mb-8 flex items-center gap-4"
          style={{ backgroundColor: "var(--card)" }}
        >
          <div className="flex-1">
            <p className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: "var(--text-faint)" }}>
              Reading Progress
            </p>
            <div
              className="h-1.5 rounded-full overflow-hidden mb-1.5"
              style={{ backgroundColor: "var(--progress-bg)" }}
            >
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${progressQuery.data.percentage}%`, backgroundColor: "var(--warm)" }}
              />
            </div>
            <p className="text-xs" style={{ color: "var(--text-dim)" }}>
              {Math.round(progressQuery.data.percentage)}% complete
              {book.pageCount
                ? ` · ${Math.round(book.pageCount * (1 - progressQuery.data.percentage / 100))} pages remaining`
                : ""}
            </p>
          </div>
        </div>
      )}

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
            className="font-display italic leading-relaxed text-sm whitespace-pre-line"
            style={{ color: "var(--text-dim)" }}
          >
            {book.description}
          </p>
        </div>
      )}

      {/* Tab bar */}
      <div
        className="flex gap-6 mb-6 border-b"
        style={{ borderColor: "var(--border)" }}
      >
        <button
          onClick={() => setActiveTab("details")}
          className="pb-2 text-sm font-medium transition-colors"
          style={{
            color: activeTab === "details" ? "var(--warm)" : "var(--text-dim)",
            borderBottom: activeTab === "details" ? "2px solid var(--warm)" : "2px solid transparent",
            marginBottom: "-1px",
          }}
        >
          Details
        </button>
        <button
          onClick={() => setActiveTab("annotations")}
          className="pb-2 text-sm font-medium transition-colors"
          style={{
            color: activeTab === "annotations" ? "var(--warm)" : "var(--text-dim)",
            borderBottom: activeTab === "annotations" ? "2px solid var(--warm)" : "2px solid transparent",
            marginBottom: "-1px",
          }}
        >
          Annotations ({annotationsQuery.data?.length ?? 0})
        </button>
        <button
          onClick={() => setActiveTab("bookmarks")}
          className="pb-2 text-sm font-medium transition-colors"
          style={{
            color: activeTab === "bookmarks" ? "var(--warm)" : "var(--text-dim)",
            borderBottom: activeTab === "bookmarks" ? "2px solid var(--warm)" : "2px solid transparent",
            marginBottom: "-1px",
          }}
        >
          Bookmarks ({bookmarksQuery.data?.length ?? 0})
        </button>
      </div>

      {/* Tab content */}
      {activeTab === "details" ? (
        details.length > 0 ? (
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
        ) : null
      ) : activeTab === "annotations" ? (
        <AnnotationsTab bookId={id} />
      ) : (
        <BookmarksTab bookId={id} />
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete book"
        message="Are you sure you want to delete this book? This cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          setConfirmDelete(false);
          deleteMutation.mutate({ id });
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

function OverflowMenu({
  bookId,
  bookTitle,
  fileFormat,
  hasProgress,
  isFinished,
  onDelete,
  isDeleting,
  isAdmin,
}: {
  bookId: string;
  bookTitle: string;
  fileFormat: string;
  hasProgress: boolean;
  isFinished: boolean;
  onDelete: () => void;
  isDeleting: boolean;
  isAdmin?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const utils = trpc.useUtils();

  const invalidateProgress = () => {
    utils.progress.get.invalidate({ bookId });
    utils.books.currentlyReading.invalidate();
    utils.shelves.list.invalidate();
    utils.shelves.byId.invalidate();
    utils.stats.overview.invalidate();
  };

  const finishMutation = trpc.progress.finish.useMutation({
    onSuccess: invalidateProgress,
  });

  const resetMutation = trpc.progress.reset.useMutation({
    onSuccess: invalidateProgress,
  });

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="px-3 py-2.5 rounded-full text-sm font-medium border transition-colors hover:opacity-80"
        style={{ borderColor: "var(--border)", color: "var(--text-dim)" }}
      >
        ⋯
      </button>
      {open && (
        <div
          className="absolute top-full mt-1 right-0 rounded-xl py-1 min-w-[160px] shadow-lg z-10"
          style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)" }}
        >
          <button
            onClick={async () => {
              const token = getAccessToken();
              const res = await fetch(`/api/books/${bookId}/file?t=${Date.now()}`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
                cache: "no-store",
              });
              if (!res.ok) return;
              const blob = await res.blob();
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `${bookTitle}.${fileFormat}`;
              a.click();
              URL.revokeObjectURL(url);
              setOpen(false);
            }}
            className="w-full text-left px-4 py-2 text-sm hover:opacity-80"
            style={{ color: "var(--text)" }}
          >
            Download
          </button>
          {isAdmin && (
            <Link
              to="/books/$id/edit"
              params={{ id: bookId }}
              className="block px-4 py-2 text-sm hover:opacity-80"
              style={{ color: "var(--text)" }}
              onClick={() => setOpen(false)}
            >
              Edit
            </Link>
          )}
          {!isFinished && (
            <button
              onClick={() => { finishMutation.mutate({ bookId }); setOpen(false); }}
              className="w-full text-left px-4 py-2 text-sm hover:opacity-80"
              style={{ color: "var(--green)" }}
            >
              Mark as Finished
            </button>
          )}
          {hasProgress && (
            <button
              onClick={() => {
                setOpen(false);
                setConfirmReset(true);
              }}
              className="w-full text-left px-4 py-2 text-sm hover:opacity-80"
              style={{ color: "var(--text-dim)" }}
            >
              Reset Progress
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => { onDelete(); setOpen(false); }}
              disabled={isDeleting}
              className="w-full text-left px-4 py-2 text-sm hover:opacity-80"
              style={{ color: "#ef4444" }}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </button>
          )}
        </div>
      )}
      <ConfirmDialog
        open={confirmReset}
        title="Reset progress"
        message="Reset all reading progress for this book? This cannot be undone."
        confirmLabel="Reset"
        destructive
        onConfirm={() => {
          setConfirmReset(false);
          resetMutation.mutate({ bookId });
        }}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  );
}
