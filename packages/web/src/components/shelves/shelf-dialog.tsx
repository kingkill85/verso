import { useState } from "react";
import { trpc } from "@/trpc";
import { FilterBuilder } from "./filter-builder";
import type { SmartFilter } from "@verso/shared";

type ShelfDialogProps = {
  onClose: () => void;
  editShelf?: {
    id: string;
    name: string;
    emoji: string | null;
    description: string | null;
    isSmart: boolean | null;
    smartFilter: string | null;
  };
};

const PRESETS: { label: string; filter: SmartFilter }[] = [
  {
    label: "Short Reads",
    filter: { operator: "AND", conditions: [{ field: "pageCount", op: "lte", value: "200" }] },
  },
  {
    label: "Long Reads",
    filter: { operator: "AND", conditions: [{ field: "pageCount", op: "gte", value: "400" }] },
  },
  {
    label: "EPUBs Only",
    filter: { operator: "AND", conditions: [{ field: "fileFormat", op: "eq", value: "epub" }] },
  },
];

const DEFAULT_FILTER: SmartFilter = {
  operator: "AND",
  conditions: [{ field: "title", op: "contains", value: "" }],
};

export function ShelfDialog({ onClose, editShelf }: ShelfDialogProps) {
  const utils = trpc.useUtils();

  const isEdit = !!editShelf;
  const [name, setName] = useState(editShelf?.name ?? "");
  const [emoji, setEmoji] = useState(editShelf?.emoji ?? "📁");
  const [description, setDescription] = useState(editShelf?.description ?? "");
  const [isSmart, setIsSmart] = useState(editShelf?.isSmart ?? false);
  const [smartFilter, setSmartFilter] = useState<SmartFilter>(() => {
    if (editShelf?.smartFilter) {
      try {
        return JSON.parse(editShelf.smartFilter) as SmartFilter;
      } catch {
        return { ...DEFAULT_FILTER };
      }
    }
    return { ...DEFAULT_FILTER };
  });

  const createMutation = trpc.shelves.create.useMutation({
    onSuccess: () => {
      utils.shelves.list.invalidate();
      onClose();
    },
  });

  const updateMutation = trpc.shelves.update.useMutation({
    onSuccess: () => {
      utils.shelves.list.invalidate();
      if (editShelf) utils.shelves.byId.invalidate({ id: editShelf.id });
      onClose();
    },
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (isEdit && editShelf) {
      updateMutation.mutate({
        id: editShelf.id,
        name: name.trim(),
        emoji,
        description: description.trim() || undefined,
        smartFilter: isSmart ? smartFilter : undefined,
      });
    } else {
      createMutation.mutate({
        name: name.trim(),
        emoji,
        description: description.trim() || undefined,
        isSmart,
        smartFilter: isSmart ? smartFilter : undefined,
      });
    }
  };

  const applyPreset = (preset: SmartFilter) => {
    setSmartFilter({ operator: preset.operator, conditions: [...preset.conditions] });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-lg mx-4 rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
        style={{ backgroundColor: "var(--surface)" }}
      >
        <h2 className="font-display text-lg font-bold mb-4" style={{ color: "var(--text)" }}>
          {isEdit ? "Edit Shelf" : "Create Shelf"}
        </h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-dim)" }}>
                Emoji
              </label>
              <input
                type="text"
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                className="w-14 rounded-lg border px-2 py-2 text-center text-lg outline-none"
                style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
                maxLength={4}
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-dim)" }}>
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Shelf"
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                style={{ backgroundColor: "var(--card)", borderColor: "var(--border)", color: "var(--text)" }}
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-dim)" }}>
              Description (optional)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A brief description..."
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ backgroundColor: "var(--card)", borderColor: "var(--border)", color: "var(--text)" }}
            />
          </div>

          {!isEdit && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isSmart}
                onChange={(e) => setIsSmart(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm" style={{ color: "var(--text-dim)" }}>
                Smart shelf (auto-populates based on rules)
              </span>
            </label>
          )}

          {isSmart && (
            <div className="rounded-xl p-4" style={{ backgroundColor: "var(--card)" }}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-medium" style={{ color: "var(--text-dim)" }}>Presets:</span>
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => applyPreset(p.filter)}
                    className="px-2 py-0.5 rounded text-[11px] font-medium transition-colors hover:opacity-80"
                    style={{ backgroundColor: "var(--bg)", color: "var(--text-dim)" }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <FilterBuilder filter={smartFilter} onChange={setSmartFilter} />
            </div>
          )}

          <div className="flex justify-end gap-3 mt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-full text-sm font-medium border transition-colors hover:opacity-80"
              style={{ borderColor: "var(--border)", color: "var(--text-dim)" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending || !name.trim()}
              className="px-5 py-2 rounded-full text-sm font-semibold text-white transition-transform hover:scale-[1.02] disabled:opacity-50"
              style={{ backgroundColor: "var(--warm)" }}
            >
              {isPending ? "Saving..." : isEdit ? "Update" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
