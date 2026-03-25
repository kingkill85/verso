import { useState } from "react";
import type { Annotation } from "@verso/shared";

const COLORS = [
  { name: "yellow", bg: "#fef08a", border: "#eab308" },
  { name: "green", bg: "#bbf7d0", border: "#22c55e" },
  { name: "blue", bg: "#bfdbfe", border: "#3b82f6" },
  { name: "pink", bg: "#fbcfe8", border: "#ec4899" },
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
  const [editingNote, setEditingNote] = useState(false);
  const [noteText, setNoteText] = useState("");

  if (!annotation || !position) return null;

  const handleEditNote = () => {
    setNoteText(annotation.note || "");
    setEditingNote(true);
  };

  const handleSaveNote = () => {
    onUpdateNote(annotation.id, noteText.trim());
    setEditingNote(false);
  };

  const handleDismiss = () => {
    setEditingNote(false);
    setNoteText("");
    onDismiss();
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[59]" onClick={handleDismiss} />

      <div
        className="fixed z-[60]"
        style={{
          left: position.x,
          top: position.y,
          transform: "translate(-50%, -100%)",
        }}
      >
        <div
          className="rounded-lg p-3 shadow-lg w-64"
          style={{
            backgroundColor: "var(--card)",
            border: "1px solid var(--border)",
          }}
        >
          {/* Highlighted text preview */}
          {annotation.content && (
            <p
              className="text-xs italic mb-3 line-clamp-2"
              style={{ color: "var(--text-dim)" }}
            >
              "{annotation.content}"
            </p>
          )}

          {/* Color swatches */}
          <div className="flex items-center gap-2 mb-3">
            {COLORS.map((c) => (
              <button
                key={c.name}
                className="w-6 h-6 rounded-full transition-transform hover:scale-110 focus:outline-none"
                style={{
                  backgroundColor: c.bg,
                  border: `2px solid ${annotation.color === c.name ? c.border : "transparent"}`,
                  boxShadow: annotation.color === c.name ? `0 0 0 2px ${c.border}` : undefined,
                }}
                onClick={() => onUpdateColor(annotation.id, c.name)}
                title={`Change to ${c.name}`}
              />
            ))}
          </div>

          {/* Existing note display */}
          {annotation.note && !editingNote && (
            <div
              className="text-xs rounded-md p-2 mb-3"
              style={{
                backgroundColor: "var(--bg)",
                color: "var(--text)",
              }}
            >
              {annotation.note}
            </div>
          )}

          {/* Note editor */}
          {editingNote && (
            <div className="mb-3">
              <textarea
                className="w-full rounded-md px-2 py-1.5 text-sm resize-none focus:outline-none"
                style={{
                  backgroundColor: "var(--bg)",
                  color: "var(--text)",
                  border: "1px solid var(--border)",
                }}
                rows={3}
                placeholder="Add a note..."
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                autoFocus
              />
              <div className="flex justify-end gap-2 mt-1">
                <button
                  className="px-2 py-1 rounded text-xs"
                  style={{ color: "var(--text-dim)" }}
                  onClick={() => setEditingNote(false)}
                >
                  Cancel
                </button>
                <button
                  className="px-2 py-1 rounded text-xs font-medium"
                  style={{
                    backgroundColor: "var(--warm)",
                    color: "white",
                  }}
                  onClick={handleSaveNote}
                >
                  Save
                </button>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              className="flex-1 px-2 py-1.5 rounded-md text-xs transition-colors hover:opacity-80"
              style={{
                backgroundColor: "var(--bg)",
                color: "var(--text)",
                border: "1px solid var(--border)",
              }}
              onClick={handleEditNote}
            >
              {annotation.note ? "Edit note" : "Add note"}
            </button>
            <button
              className="px-2 py-1.5 rounded-md text-xs transition-colors hover:opacity-80"
              style={{
                backgroundColor: "var(--bg)",
                color: "#ef4444",
                border: "1px solid var(--border)",
              }}
              onClick={() => onDelete(annotation.id)}
              title="Delete highlight"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          </div>
        </div>

        {/* Arrow */}
        <div
          className="w-0 h-0 mx-auto"
          style={{
            borderLeft: "6px solid transparent",
            borderRight: "6px solid transparent",
            borderTop: "6px solid var(--card)",
          }}
        />
      </div>
    </>
  );
}
