import { useState, useMemo } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { trpc } from "@/trpc";
import { BookGrid } from "@/components/books/book-grid";
import { BackButton } from "@/components/back-button";
import { BookCard } from "@/components/books/book-card";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { XIcon, renderShelfIcon, translateShelfName } from "@/components/icons";
import { Pencil, Trash2 } from "lucide-react";

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
        <BackButton className="mt-2" />
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
    <div className="max-w-4xl mx-auto animate-in fade-in">
      <BackButton />

      {/* Hero card */}
      <div
        className="rounded-xl p-4 md:p-6 mb-5"
        style={{ backgroundColor: "var(--card)" }}
      >
        <div className="flex gap-4 md:gap-6">
          {/* Shelf icon */}
          <div className="shrink-0 flex items-start pt-1">
            <span className="text-3xl" style={{ color: "var(--text-dim)" }}>
              {renderShelfIcon(shelf.emoji, shelf.name, 32)}
            </span>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-start gap-2">
              <div className="min-w-0">
                <h1
                  className="font-display text-lg md:text-2xl font-bold leading-tight"
                  style={{ color: "var(--text)" }}
                >
                  {translateShelfName(shelf.name, t)}
                </h1>
                <p
                  className="font-display text-sm md:text-base mt-0.5"
                  style={{ color: "var(--text-dim)" }}
                >
                  {t("shelf.book", { count: books.length })}
                </p>
              </div>
              {/* Icon actions — top right */}
              <div className="flex gap-1 shrink-0">
                {shelf.isSmart && (
                  <span
                    className="px-2 py-0.5 rounded-full text-[11px] italic font-medium self-center mr-1"
                    style={{ backgroundColor: "var(--bg)", color: "var(--text-dim)" }}
                  >
                    {t("shelf.smartShelf")}
                  </span>
                )}
                {(canEdit || canEditSmart) && (
                  <Link
                    to="/shelves/$id/edit"
                    params={{ id }}
                    title={t("book.edit")}
                    className="p-2.5 rounded-full border transition-colors hover:opacity-80"
                    style={{ borderColor: "var(--border)", color: "var(--text-dim)" }}
                  >
                    <Pencil size={16} />
                  </Link>
                )}
                {canEdit && (
                  <button
                    onClick={handleDelete}
                    title={t("book.delete")}
                    className="p-2.5 rounded-full border transition-colors hover:opacity-80"
                    style={{ borderColor: "var(--border)", color: "#ef4444" }}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>

            {shelf.description && (
              <p
                className="font-display italic text-sm mt-2"
                style={{ color: "var(--text-faint)" }}
              >
                {shelf.description}
              </p>
            )}
          </div>
        </div>
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
