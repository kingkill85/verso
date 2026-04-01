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
import { BackButton } from "@/components/back-button";
import { formatDate } from "@/lib/format-date";
import { useAuth } from "@/hooks/use-auth";
import { Download, Pencil, CheckCircle, RotateCcw, Trash2, Tablet, Check } from "lucide-react";

export const Route = createFileRoute("/_app/books/$id")({
  component: BookDetailPage,
});

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}


function BookDetailPage() {
  const { t, i18n } = useTranslation();
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<"details" | "annotations" | "bookmarks">("details");
  const bookQuery = trpc.books.byId.useQuery({ id });
  const authorsQuery = trpc.authors.list.useQuery({});
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

  if (!bookQuery.data) {
    if (bookQuery.isLoading || bookQuery.isFetching) {
      return (
        <div className="flex items-center justify-center py-20" style={{ color: "var(--text-dim)" }}>
          <p className="text-sm">{t("book.loading")}</p>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="font-display text-lg" style={{ color: "var(--text)" }}>{t("book.notFound")}</p>
        <BackButton className="mt-2" />
      </div>
    );
  }

  const book = bookQuery.data;
  const genreChips: { id: string; slug: string; name: string }[] = (book as any).genres ?? [];

  const details = [
    { label: t("detail.publisher"), value: book.publisher },
    { label: t("detail.year"), value: book.year ? String(book.year) : null },
    { label: t("detail.language"), value: book.language ? (t(`language.${book.language}`) !== `language.${book.language}` ? t(`language.${book.language}`) : book.language.toUpperCase()) : null },
    { label: t("detail.isbn"), value: book.isbn },
    { label: t("detail.format"), value: book.fileFormat.toUpperCase() },
    { label: t("detail.fileSize"), value: formatFileSize(book.fileSize) },
    { label: t("detail.added"), value: formatDate(book.createdAt, i18n.language) },
  ].filter((d) => d.value);

  return (
    <div className="max-w-4xl mx-auto animate-in fade-in">
      <BackButton />

      {/* Hero section — always side by side */}
      <div
        className="rounded-xl p-4 md:p-6 mb-5"
        style={{ backgroundColor: "var(--card)" }}
      >
        <div className="flex gap-4 md:gap-6">
          {/* Cover + Read button */}
          <div className="shrink-0 flex flex-col items-stretch gap-2">
            <div className="relative block md:hidden">
              <BookCover
                bookId={book.id}
                title={book.title}
                author={book.author}
                coverPath={book.coverPath}
                updatedAt={book.updatedAt}
                size="lg"
              />
              {progressQuery.data?.finishedAt && (
                <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.7)" }}>
                  <Check size={12} strokeWidth={3} color="white" />
                </div>
              )}
            </div>
            <div className="relative hidden md:block">
              <BookCover
                bookId={book.id}
                title={book.title}
                author={book.author}
                coverPath={book.coverPath}
                updatedAt={book.updatedAt}
                size="xl"
              />
              {progressQuery.data?.finishedAt && (
                <div className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.7)" }}>
                  <Check size={14} style={{ color: "rgba(255,255,255,0.85)" }} />
                </div>
              )}
            </div>
            {(book.fileFormat === "epub" || book.fileFormat === "pdf") && (
              <Link
                to="/books/$id/read"
                params={{ id }}
                search={{ cfi: undefined }}
                className="inline-flex items-center justify-center px-5 py-2 rounded-full text-sm font-semibold text-white transition-transform hover:scale-[1.02]"
                style={{ backgroundColor: "var(--warm)" }}
              >
                {progressQuery.data?.finishedAt
                  ? t("book.readAgain")
                  : progressQuery.data?.percentage
                    ? t("book.continueReading", { percent: Math.round(progressQuery.data.percentage) })
                    : t("book.startReading")}
              </Link>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-start gap-2">
              <div className="min-w-0">
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
                  {book.author.split(",").map((name, i, arr) => {
                    const trimmed = name.trim();
                    const match = authorsQuery.data?.find(
                      (a) => a.name.toLowerCase() === trimmed.toLowerCase()
                    );
                    return (
                      <span key={trimmed}>
                        {match ? (
                          <Link
                            to="/authors/$id"
                            params={{ id: match.id }}
                            className="hover:underline"
                            style={{ color: "var(--warm)" }}
                          >
                            {trimmed}
                          </Link>
                        ) : (
                          trimmed
                        )}
                        {i < arr.length - 1 && ", "}
                      </span>
                    );
                  })}
                </p>
                {book.series && (
                  <p
                    className="text-xs mt-0.5"
                    style={{ color: "var(--text-faint)" }}
                  >
                    {t("book.seriesInfoPrefix", { index: book.seriesIndex || "?" })}{" "}
                    <Link
                      to="/search"
                      search={{ q: "", series: book.series }}
                      className="hover:opacity-80 transition-opacity underline"
                      style={{ color: "var(--warm)" }}
                    >
                      {book.series}
                    </Link>
                  </p>
                )}
              </div>
              {/* Icon actions — top right */}
              <div className="flex gap-1 shrink-0">
                <AddToShelfMenu bookId={id} compact />
                <BookActionButtons
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

            {/* Genres */}
            {genreChips.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {genreChips.map((genre) => (
                  <Link
                    key={genre.id}
                    to="/search"
                    search={{ q: "", genre: genre.slug }}
                    className="px-2 py-0.5 rounded-full text-[11px] font-medium hover:opacity-80 transition-opacity"
                    style={{
                      backgroundColor: "var(--bg)",
                      color: "var(--text-dim)",
                    }}
                  >
                    {t(`genre.${genre.slug}`) !== `genre.${genre.slug}` ? t(`genre.${genre.slug}`) : genre.name}
                  </Link>
                ))}
              </div>
            )}

            {/* Description */}
            {book.description && (
              <p
                className="font-display italic leading-relaxed text-sm mt-3"
                style={{ color: "var(--text-dim)" }}
              >
                {book.description}
              </p>
            )}
          </div>
        </div>

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

function ActionButton({ onClick, title, icon, color, disabled }: {
  onClick: () => void;
  title: string;
  icon: React.ReactNode;
  color?: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="p-2.5 rounded-full border transition-colors hover:opacity-80 disabled:opacity-50"
      style={{ borderColor: "var(--border)", color: color ?? "var(--text-dim)" }}
    >
      {icon}
    </button>
  );
}

function BookActionButtons({
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
  const [confirmReset, setConfirmReset] = useState(false);
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

  const kindleSettings = trpc.kindle.getSettings.useQuery();
  const [kindleStatus, setKindleStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const sendToKindleMut = trpc.kindle.sendBook.useMutation({
    onSuccess: () => {
      setKindleStatus("sent");
      setTimeout(() => setKindleStatus("idle"), 3000);
    },
    onError: () => {
      setKindleStatus("error");
      setTimeout(() => setKindleStatus("idle"), 3000);
    },
  });

  const handleDownload = async () => {
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
  };

  return (
    <>
      <ActionButton
        onClick={handleDownload}
        title={t("book.download")}
        icon={<Download size={16} />}
      />
      {kindleSettings.data && (
        <div className="relative">
          <ActionButton
            onClick={() => { setKindleStatus("sending"); sendToKindleMut.mutate({ bookId }); }}
            title={t("kindle.sendToKindle")}
            icon={<Tablet size={16} />}
            disabled={sendToKindleMut.isPending}
          />
          {kindleStatus === "sent" && (
            <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 px-2 py-1 rounded-lg text-[10px] whitespace-nowrap"
              style={{ backgroundColor: "rgba(74,138,90,0.15)", color: "var(--green)" }}>
              {t("kindle.sent")}
            </div>
          )}
          {kindleStatus === "error" && (
            <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 px-2 py-1 rounded-lg text-[10px] whitespace-nowrap"
              style={{ backgroundColor: "rgba(220,38,38,0.1)", color: "#ef4444" }}>
              {t("kindle.sendFailed")}
            </div>
          )}
        </div>
      )}
      {isAdmin && (
        <Link
          to="/books/$id/edit"
          params={{ id: bookId }}
          title={t("book.edit")}
          className="p-2.5 rounded-full border transition-colors hover:opacity-80"
          style={{ borderColor: "var(--border)", color: "var(--text-dim)" }}
        >
          <Pencil size={16} />
        </Link>
      )}
      {!isFinished && (
        <ActionButton
          onClick={() => finishMutation.mutate({ bookId })}
          title={t("book.markFinished")}
          icon={<CheckCircle size={16} />}
          color="var(--green)"
        />
      )}
      {hasProgress && (
        <ActionButton
          onClick={() => setConfirmReset(true)}
          title={t("book.resetProgress")}
          icon={<RotateCcw size={16} />}
        />
      )}
      {isAdmin && (
        <ActionButton
          onClick={onDelete}
          title={t("book.delete")}
          icon={<Trash2 size={16} />}
          color="#ef4444"
          disabled={isDeleting}
        />
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
    </>
  );
}
