import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { trpc } from "@/trpc";
import { FilterBuilder } from "./filter-builder";
import type { SmartFilter } from "@verso/shared";

type Props = {
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
  { label: "Short Reads", filter: { operator: "AND", conditions: [{ field: "pageCount", op: "lte", value: "200" }] } },
  { label: "Long Reads", filter: { operator: "AND", conditions: [{ field: "pageCount", op: "gte", value: "400" }] } },
  { label: "EPUBs Only", filter: { operator: "AND", conditions: [{ field: "fileFormat", op: "eq", value: "epub" }] } },
];

const DEFAULT_FILTER: SmartFilter = {
  operator: "AND",
  conditions: [{ field: "title", op: "contains", value: "" }],
};

export function ShelfForm({ editShelf }: Props) {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const isEdit = !!editShelf;

  const [name, setName] = useState(editShelf?.name ?? "");
  const [emoji, setEmoji] = useState(editShelf?.emoji ?? "📁");
  const [description, setDescription] = useState(editShelf?.description ?? "");
  const [isSmart, setIsSmart] = useState(editShelf?.isSmart ?? false);
  const [smartFilter, setSmartFilter] = useState<SmartFilter>(() => {
    if (editShelf?.smartFilter) {
      try { return JSON.parse(editShelf.smartFilter) as SmartFilter; }
      catch { return { ...DEFAULT_FILTER }; }
    }
    return { ...DEFAULT_FILTER };
  });

  const createMutation = trpc.shelves.create.useMutation({
    onSuccess: (data) => {
      utils.shelves.list.invalidate();
      navigate({ to: "/shelves/$id", params: { id: data.id } });
    },
  });

  const updateMutation = trpc.shelves.update.useMutation({
    onSuccess: () => {
      utils.shelves.list.invalidate();
      if (editShelf) {
        utils.shelves.byId.invalidate({ id: editShelf.id });
        navigate({ to: "/shelves/$id", params: { id: editShelf.id } });
      }
    },
  });

  const isPending = createMutation.isPending || updateMutation.isPending;
  const error = createMutation.isError || updateMutation.isError;

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

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && (
        <div className="rounded-lg px-4 py-3 text-sm" style={{ backgroundColor: "rgba(200,50,50,0.1)", color: "#c44" }}>
          Failed to save. Please try again.
        </div>
      )}

      <div className="flex gap-3">
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-dim)" }}>Emoji</label>
          <input type="text" value={emoji} onChange={(e) => setEmoji(e.target.value)}
            className="w-14 rounded-lg border px-2 py-2 text-center text-lg outline-none"
            style={{ backgroundColor: "var(--bg)", borderColor: "var(--border)" }} maxLength={4} />
        </div>
        <div className="flex-1">
          <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-dim)" }}>Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="My Shelf"
            className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
            style={{ backgroundColor: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }} required />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-dim)" }}>Description (optional)</label>
        <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="A brief description..."
          className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
          style={{ backgroundColor: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }} />
      </div>

      {!isEdit && (
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={isSmart} onChange={(e) => setIsSmart(e.target.checked)} className="rounded" />
          <span className="text-sm" style={{ color: "var(--text-dim)" }}>Smart shelf (auto-populates based on rules)</span>
        </label>
      )}

      {isSmart && (
        <div className="rounded-xl p-4" style={{ backgroundColor: "var(--bg)" }}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-medium" style={{ color: "var(--text-dim)" }}>Presets:</span>
            {PRESETS.map((p) => (
              <button key={p.label} type="button" onClick={() => setSmartFilter({ operator: p.filter.operator, conditions: [...p.filter.conditions] })}
                className="px-2 py-0.5 rounded text-[11px] font-medium transition-colors hover:opacity-80"
                style={{ backgroundColor: "var(--surface)", color: "var(--text-dim)" }}>
                {p.label}
              </button>
            ))}
          </div>
          <FilterBuilder filter={smartFilter} onChange={setSmartFilter} />
        </div>
      )}

      <div className="flex justify-end mt-2">
        <button type="submit" disabled={isPending || !name.trim()}
          className="px-5 py-2 rounded-full text-sm font-semibold text-white transition-transform hover:scale-[1.02] disabled:opacity-50"
          style={{ backgroundColor: "var(--warm)" }}>
          {isPending ? "Saving..." : isEdit ? "Save" : "Create"}
        </button>
      </div>
    </form>
  );
}
