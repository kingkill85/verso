import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { trpc } from "@/trpc";
import { formatDate } from "@/lib/format-date";

interface BookmarksTabProps {
  bookId: string;
}

export function BookmarksTab({ bookId }: BookmarksTabProps) {
  const { i18n } = useTranslation();
  const bookmarksQuery = trpc.annotations.listBookmarks.useQuery({ bookId });
  const utils = trpc.useUtils();
  const deleteBookmark = trpc.annotations.deleteBookmark.useMutation({
    onSuccess: () => utils.annotations.listBookmarks.invalidate({ bookId }),
  });

  if (bookmarksQuery.isLoading) {
    return (
      <p className="text-sm py-6 text-center" style={{ color: "var(--text-dim)" }}>
        Loading bookmarks...
      </p>
    );
  }

  const bookmarks = bookmarksQuery.data ?? [];

  if (bookmarks.length === 0) {
    return (
      <p className="text-sm py-6 text-center" style={{ color: "var(--text-dim)" }}>
        No bookmarks yet. Open the reader and tap the bookmark button to save a page.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {bookmarks.map((bm) => (
        <div
          key={bm.id}
          className="rounded-xl p-4 flex items-center justify-between"
          style={{ backgroundColor: "var(--card)" }}
        >
          <Link
            to="/books/$id/read"
            params={{ id: bookId }}
            search={{ cfi: bm.cfiPosition ?? undefined }}
            className="flex-1 min-w-0 hover:opacity-80 transition-opacity"
          >
            <p className="text-sm" style={{ color: "var(--text)" }}>
              {bm.chapter ?? "Unknown Chapter"}
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--text-faint)" }}>
              {bm.content ? `${bm.content}%` : ""}{bm.content && " · "}{formatDate(bm.createdAt, i18n.language, true)}
            </p>
          </Link>
          <button
            onClick={() => deleteBookmark.mutate({ id: bm.id })}
            disabled={deleteBookmark.isPending}
            className="shrink-0 ml-4 px-2 py-1 rounded text-xs font-medium transition-opacity hover:opacity-80"
            style={{ color: "#ef4444" }}
            aria-label="Delete bookmark"
          >
            Delete
          </button>
        </div>
      ))}
    </div>
  );
}
