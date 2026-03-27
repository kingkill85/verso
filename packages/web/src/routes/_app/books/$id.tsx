import { useState, useRef, useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { trpc } from "@/trpc";
import { BookCover } from "@/components/books/book-cover";
import { AddToShelfMenu } from "@/components/shelves/add-to-shelf-menu";
import { AnnotationsTab } from "@/components/books/annotations-tab";
import { BookmarksTab } from "@/components/books/bookmarks-tab";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { getAccessToken } from "@/lib/auth";
import { useAuth } from "@/hooks/use-auth";
import { MoreHorizontalIcon } from "@/components/icons";

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
  const { t } = useTranslation();
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
      navigate({ to: "/home" });
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
        <p className="text-sm">{t("book.loading")}</p>
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
          {t("book.notFound")}
        </p>
        <button
          onClick={() => window.history.back()}
          className="text-sm mt-2"
          style={{ color: "var(--warm)" }}
        >
          {t("book.back")}
        </button>
      </div>
    );
  }

  const book = bookQuery.data;
  const tags: string[] = [];
  if (book.genre) tags.push(book.genre);
  if (book.year) tags.push(String(book.year));
  if (book.pageCount) tags.push(t("book.pages", { count: book.pageCount }));
  tags.push(book.fileFormat.toUpperCase());

  const details = [
    { label: t("detail.publisher"), value: book.publisher },
    { label: t("detail.year"), value: book.year ? String(book.year) : null },
    { label: t("detail.language"), value: book.language?.toUpperCase() },
    { label: t("detail.isbn"), value: book.isbn },
    { label: t("detail.format"), value: book.fileFormat.toUpperCase() },
    { label: t("detail.fileSize"), value: formatFileSize(book.fileSize) },
    { label: t("detail.added"), value: formatDate(book.createdAt) },
  ].filter((d) => d.value);

  return (
    <div className="max-w-4xl mx-auto animate-in fade-in">
      {/* Back link */}
      <button
        onClick={() => window.history.back()}
        className="inline-flex items-center text-sm mb-4 transition-colors hover:opacity-80"
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
        {t("book.back")}
      </button>

      {/* Hero section — always side by side */}
      <div
        className="rounded-xl p-4 md:p-6 mb-5"
        style={{ backgroundColor: "var(--card)" }}
      >
        <div className="flex gap-4 md:gap-6">
          {/* Cover — lg on mobile, xl on desktop */}
          <div className="shrink-0 block md:hidden">
            <BookCover
              bookId={book.id}
              title={book.title}
              author={book.author}
              coverPath={book.coverPath}
              updatedAt={book.updatedAt}
              size="lg"
            />
          </div>
          <div className="shrink-0 hidden md:block">
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
              className="font-display text-lg md:text-2xl font-bold leading-tight"
              style={{ color: "var(--text)" }}
            >
              {book.title}
            </h1>
            <p
              className="font-display italic text-sm md:text-base mt-0.5"
              style={{ color: "var(--text-dim)" }}
            >
              {book.author}
            </p>
            {book.series && (
              <p
                className="text-xs mt-0.5"
                style={{ color: "var(--text-faint)" }}
              >
                Book {book.seriesIndex || "?"} of {book.series}
              </p>
            )}

            {/* Tags */}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 rounded-full text-[11px] font-medium"
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

            {/* Actions — hidden on mobile, shown on md+ */}
            <div className="hidden md:flex flex-wrap items-center gap-2 mt-4">
              {book.fileFormat === "epub" && (
                <Link
                  to="/books/$id/read"
                  params={{ id }}
                  search={{ cfi: undefined }}
                  className="inline-flex items-center px-5 py-2 rounded-full text-sm font-semibold text-white transition-transform hover:scale-[1.02]"
                  style={{ backgroundColor: "var(--warm)" }}
                >
                  {progressQuery.data?.finishedAt
                    ? t("book.readAgain")
                    : progressQuery.data?.percentage
                      ? t("book.continueReading", { percent: Math.round(progressQuery.data.percentage) })
                      : t("book.startReading")}
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

      {/* Mobile actions — below hero card */}
      <div className="flex md:hidden flex-wrap items-center gap-2 mb-4">
        {book.fileFormat === "epub" && (
          <Link
            to="/books/$id/read"
            params={{ id }}
            search={{ cfi: undefined }}
            className="inline-flex items-center px-5 py-2 rounded-full text-sm font-semibold text-white transition-transform hover:scale-[1.02]"
            style={{ backgroundColor: "var(--warm)" }}
          >
            {progressQuery.data?.finishedAt
              ? t("book.readAgain")
              : progressQuery.data?.percentage
                ? t("book.continueReading", { percent: Math.round(progressQuery.data.percentage) })
                : t("book.startReading")}
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

      {/* Progress section */}
      {progressQuery.data && !progressQuery.data.finishedAt && progressQuery.data.percentage > 0 && (
        <div
          className="rounded-xl p-4 mb-5 flex items-center gap-4"
          style={{ backgroundColor: "var(--card)" }}
        >
          <div className="flex-1">
            <p className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: "var(--text-faint)" }}>
              {t("book.progress")}
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
              {t("book.complete", { percent: Math.round(progressQuery.data.percentage) })}
              {book.pageCount
                ? ` · ${t("book.pagesRemaining", { count: Math.round(book.pageCount * (1 - progressQuery.data.percentage / 100)) })}`
                : ""}
            </p>
          </div>
        </div>
      )}

      {/* Description */}
      {book.description && (
        <div className="mb-5">
          <h2
            className="font-display text-sm font-semibold mb-2"
            style={{ color: "var(--text)" }}
          >
            {t("book.description")}
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
          {t("book.details")}
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
          {t("book.annotations", { count: annotationsQuery.data?.length ?? 0 })}
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
          {t("book.bookmarks", { count: bookmarksQuery.data?.length ?? 0 })}
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
        title={t("confirm.deleteBook")}
        message={t("confirm.deleteBookMsg")}
        confirmLabel={t("confirm.delete")}
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
  const { t } = useTranslation();
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
        <MoreHorizontalIcon size={20} />
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
            {t("book.download")}
          </button>
          {isAdmin && (
            <Link
              to="/books/$id/edit"
              params={{ id: bookId }}
              className="block px-4 py-2 text-sm hover:opacity-80"
              style={{ color: "var(--text)" }}
              onClick={() => setOpen(false)}
            >
              {t("book.edit")}
            </Link>
          )}
          {!isFinished && (
            <button
              onClick={() => { finishMutation.mutate({ bookId }); setOpen(false); }}
              className="w-full text-left px-4 py-2 text-sm hover:opacity-80"
              style={{ color: "var(--green)" }}
            >
              {t("book.markFinished")}
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
              {t("book.resetProgress")}
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => { onDelete(); setOpen(false); }}
              disabled={isDeleting}
              className="w-full text-left px-4 py-2 text-sm hover:opacity-80"
              style={{ color: "#ef4444" }}
            >
              {isDeleting ? t("book.deleting") : t("book.delete")}
            </button>
          )}
        </div>
      )}
      <ConfirmDialog
        open={confirmReset}
        title={t("confirm.resetProgress")}
        message={t("confirm.resetProgressMsg")}
        confirmLabel={t("confirm.reset")}
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
