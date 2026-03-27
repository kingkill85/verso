import { useState, useMemo } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { trpc } from "@/trpc";
import { BookGrid } from "@/components/books/book-grid";
import { BookCard } from "@/components/books/book-card";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { MoreHorizontalIcon, XIcon, renderShelfIcon, translateShelfName } from "@/components/icons";

export const Route = createFileRoute("/_app/shelves/$id")({
  component: ShelfDetailPage,
});

function ShelfDetailPage() {
  const { t } = useTranslation();
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const shelfQuery = trpc.shelves.byId.useQuery({ id });
  const [search, setSearch] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  const deleteMutation = trpc.shelves.delete.useMutation({
    onSuccess: () => {
      utils.shelves.list.invalidate();
      navigate({ to: "/library" });
    },
  });

  const removeBookMutation = trpc.shelves.removeBook.useMutation({
    onSuccess: () => {
      utils.shelves.byId.invalidate({ id });
      utils.shelves.list.invalidate();
    },
  });

  const [confirmDelete, setConfirmDelete] = useState(false);

  const filteredBooks = useMemo(() => {
    if (!shelfQuery.data?.books) return [];
    if (!search.trim()) return shelfQuery.data.books;
    const term = search.toLowerCase();
    return shelfQuery.data.books.filter(
      (b) =>
        b.title.toLowerCase().includes(term) ||
        (b.author && b.author.toLowerCase().includes(term))
    );
  }, [shelfQuery.data?.books, search]);

  if (shelfQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-20" style={{ color: "var(--text-dim)" }}>
        <p className="text-sm">{t("shelf.loading")}</p>
      </div>
    );
  }

  if (shelfQuery.error || !shelfQuery.data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="font-display text-lg" style={{ color: "var(--text)" }}>{t("shelf.notFound")}</p>
        <button onClick={() => window.history.back()} className="text-sm mt-2" style={{ color: "var(--warm)" }}>{t("common.back")}</button>
      </div>
    );
  }

  const shelf = shelfQuery.data;
  const books = shelf.books ?? [];
  const showSearch = books.length > 5;
  const canEdit = !shelf.isDefault && !shelf.isSmart;
  const canEditSmart = !shelf.isDefault && shelf.isSmart;
  const canManageBooks = !shelf.isSmart; // manual shelves only

  const handleDelete = () => {
    setConfirmDelete(true);
  };

  return (
    <div className="animate-in fade-in">
      <button
        onClick={() => window.history.back()}
        className="inline-flex items-center text-sm mb-6 transition-colors hover:opacity-80"
        style={{ color: "var(--text-dim)" }}
      >
        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        {t("common.back")}
      </button>

      <div className="mb-6">
        <div className="flex items-center gap-3">
          <span className="text-2xl" style={{ color: "var(--text-dim)" }}>{renderShelfIcon(shelf.emoji, shelf.name, 24)}</span>
          <h1 className="font-display text-[26px] font-bold flex-1" style={{ color: "var(--text)" }}>
            {translateShelfName(shelf.name, t)}
          </h1>
          {shelf.isSmart && (
            <span
              className="px-2 py-0.5 rounded-full text-[11px] italic font-medium"
              style={{ backgroundColor: "var(--card)", color: "var(--text-dim)" }}
            >
              {t("shelf.smartShelf")}
            </span>
          )}
          {(canEdit || canEditSmart) && (
            <div className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:opacity-80"
                style={{ color: "var(--text-dim)" }}
              >
                <MoreHorizontalIcon size={18} />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                  <div
                    className="absolute right-0 top-full mt-1 w-36 rounded-xl border shadow-lg overflow-hidden z-40"
                    style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}
                  >
                    <Link to="/shelves/$id/edit" params={{ id }}
                      onClick={() => setMenuOpen(false)}
                      className="w-full block text-left px-4 py-2.5 text-sm transition-colors"
                      style={{ color: "var(--text)" }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--card)")}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}>
                      {t("book.edit")}
                    </Link>
                    <button
                      onClick={() => { setMenuOpen(false); handleDelete(); }}
                      className="w-full text-left px-4 py-2.5 text-sm transition-colors"
                      style={{ color: "#c44" }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--card)")}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                    >
                      {t("book.delete")}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        <p className="text-sm mt-1" style={{ color: "var(--text-dim)" }}>
          {t("shelf.book", { count: books.length })}
        </p>
        {shelf.description && (
          <p className="text-sm mt-1 italic" style={{ color: "var(--text-faint)" }}>
            {shelf.description}
          </p>
        )}
      </div>

      {showSearch && (
        <div className="mb-6 max-w-md">
          <input
            type="text"
            placeholder={t("shelf.filterBooks")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-[10px] border px-4 py-2.5 text-sm outline-none transition-colors"
            style={{ backgroundColor: "var(--card)", borderColor: "var(--border)", color: "var(--text)" }}
          />
        </div>
      )}

      {canManageBooks ? (
        <RemovableBookGrid
          books={filteredBooks}
          onRemove={(bookId) => removeBookMutation.mutate({ shelfId: id, bookId })}
          isRemoving={removeBookMutation.isPending}
        />
      ) : (
        <BookGrid books={filteredBooks} />
      )}

      <ConfirmDialog
        open={confirmDelete}
        title={t("confirm.deleteShelf")}
        message={t("confirm.deleteShelfMsg", { name: shelf.name })}
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

function RemovableBookGrid({ books, onRemove, isRemoving }: {
  books: any[];
  onRemove: (bookId: string) => void;
  isRemoving: boolean;
}) {
  const { t } = useTranslation();
  if (books.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center" style={{ color: "var(--text-dim)" }}>
        <p className="font-display text-lg">{t("shelf.noBooks")}</p>
        <p className="text-sm mt-1">{t("shelf.addFromDetail")}</p>
      </div>
    );
  }

  return (
    <div
      className="grid gap-[22px]"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(135px, 1fr))" }}
    >
      {books.map((book, index) => (
        <div
          key={book.id}
          className="relative group animate-in fade-in"
          style={{ animationDelay: `${index * 30}ms` }}
        >
          <BookCard
            id={book.id}
            title={book.title}
            author={book.author}
            coverPath={book.coverPath}
          />
          <button
            onClick={() => onRemove(book.id)}
            disabled={isRemoving}
            className="absolute top-1 right-1 w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-xs"
            style={{ backgroundColor: "rgba(0,0,0,0.6)", color: "white" }}
            title={t("shelf.removeFromShelf")}
          >
            <XIcon size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
