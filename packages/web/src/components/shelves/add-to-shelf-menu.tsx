import { useState, useRef, useEffect } from "react";
import { trpc } from "@/trpc";

type AddToShelfMenuProps = {
  bookId: string;
};

export function AddToShelfMenu({ bookId }: AddToShelfMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const shelvesQuery = trpc.shelves.list.useQuery();
  const utils = trpc.useUtils();

  const addBookMutation = trpc.shelves.addBook.useMutation({
    onSuccess: () => {
      utils.shelves.list.invalidate();
      setOpen(false);
    },
  });

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const manualShelves = (shelvesQuery.data ?? []).filter((s) => !s.isSmart);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className="px-5 py-2.5 rounded-full text-sm font-medium border transition-colors hover:opacity-80"
        style={{ borderColor: "var(--border)", color: "var(--text-dim)" }}
      >
        Add to shelf
      </button>

      {open && (
        <div
          className="absolute top-full left-0 mt-2 w-56 rounded-xl border shadow-lg overflow-hidden z-40"
          style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}
        >
          {manualShelves.length === 0 ? (
            <div className="px-4 py-3 text-xs" style={{ color: "var(--text-faint)" }}>
              No shelves yet
            </div>
          ) : (
            manualShelves.map((shelf) => (
              <button
                key={shelf.id}
                onClick={() => addBookMutation.mutate({ shelfId: shelf.id, bookId })}
                disabled={addBookMutation.isPending}
                className="w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 transition-colors hover:opacity-80"
                style={{ color: "var(--text)" }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--card)")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
              >
                <span>{shelf.emoji ?? "📁"}</span>
                <span className="flex-1 truncate">{shelf.name}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
