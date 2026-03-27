import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Annotation } from "@verso/shared";

const COLORS = [
  { name: "yellow", bg: "#fef08a", ring: "#eab308" },
  { name: "green", bg: "#bbf7d0", ring: "#22c55e" },
  { name: "blue", bg: "#bfdbfe", ring: "#3b82f6" },
  { name: "pink", bg: "#fbcfe8", ring: "#ec4899" },
] as const;

type HighlightPopoverProps = {
  annotation: Annotation | null;
  position: { x: number; y: number } | null;
  onUpdateColor: (id: string, color: string) => void;
  onUpdateNote: (id: string, note: string) => void;
  onDelete: (id: string) => void;
  onDismiss: () => void;
};

export function HighlightPopover({
  annotation,
  position,
  onUpdateColor,
  onUpdateNote,
  onDelete,
  onDismiss,
}: HighlightPopoverProps) {
  const { t } = useTranslation();
  const [editingNote, setEditingNote] = useState(false);
  const [noteText, setNoteText] = useState("");

  if (!annotation || !position) return null;

  return (
    <>
      <div className="fixed inset-0 z-[59]" onClick={() => { setEditingNote(false); onDismiss(); }} />

      <div
        className="fixed z-[60]"
        style={{ left: position.x, top: position.y, transform: "translate(-50%, -100%)" }}
      >
        {/* Use a fixed white/dark bg instead of theme vars so it's always visible */}
        <div
          className="rounded-xl p-3 shadow-2xl w-60"
          style={{ backgroundColor: "#1c1917", border: "1px solid #44403c" }}
        >
          {/* Highlighted text */}
          {annotation.content && (
            <p className="text-xs mb-3 px-1 text-stone-200 leading-relaxed line-clamp-4">
              "{annotation.content}"
            </p>
          )}

          {/* Color swatches */}
          <div className="flex items-center justify-center gap-3 mb-3">
            {COLORS.map((c) => (
              <button
                key={c.name}
                className="w-8 h-8 rounded-full transition-transform hover:scale-110"
                style={{
                  backgroundColor: c.bg,
                  outline: annotation.color === c.name ? `3px solid ${c.ring}` : "none",
                  outlineOffset: "2px",
                }}
                onClick={() => onUpdateColor(annotation.id, c.name)}
              />
            ))}
          </div>

          {/* Note display */}
          {annotation.note && !editingNote && (
            <p className="text-xs mb-2 px-1 text-stone-400 italic line-clamp-2">
              {annotation.note}
            </p>
          )}

          {/* Note editor */}
          {editingNote ? (
            <div className="mb-2">
              <textarea
                className="w-full rounded-lg px-2 py-1.5 text-sm resize-none focus:outline-none bg-stone-800 text-stone-200 border border-stone-600"
                rows={3}
                placeholder={t("reader.addNote")}
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                autoFocus
              />
              <div className="flex justify-end gap-2 mt-1">
                <button className="px-2 py-1 rounded text-xs text-stone-400" onClick={() => setEditingNote(false)}>
                  {t("reader.cancel")}
                </button>
                <button
                  className="px-3 py-1 rounded text-xs font-medium bg-amber-700 text-white"
                  onClick={() => { onUpdateNote(annotation.id, noteText.trim()); setEditingNote(false); }}
                >
                  {t("reader.save")}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                className="flex-1 px-2 py-1.5 rounded-lg text-xs text-stone-300 bg-stone-800 hover:bg-stone-700"
                onClick={() => { setNoteText(annotation.note || ""); setEditingNote(true); }}
              >
                {annotation.note ? t("reader.editNote") : t("reader.addNote")}
              </button>
              <button
                className="px-2 py-1.5 rounded-lg text-xs text-red-400 bg-stone-800 hover:bg-stone-700"
                onClick={() => onDelete(annotation.id)}
              >
                {t("reader.delete")}
              </button>
            </div>
          )}
        </div>

        {/* Arrow */}
        <div className="w-0 h-0 mx-auto" style={{ borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderTop: "6px solid #1c1917" }} />
      </div>
    </>
  );
}
