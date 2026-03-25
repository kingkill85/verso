import { useState } from "react";

const COLORS = [
  { name: "yellow", bg: "#fef08a", border: "#eab308" },
  { name: "green", bg: "#bbf7d0", border: "#22c55e" },
  { name: "blue", bg: "#bfdbfe", border: "#3b82f6" },
  { name: "pink", bg: "#fbcfe8", border: "#ec4899" },
] as const;

type HighlightToolbarProps = {
  position: { x: number; y: number } | null;
  onHighlight: (color: string, note?: string) => void;
  onDismiss: () => void;
};

export function HighlightToolbar({ position, onHighlight, onDismiss }: HighlightToolbarProps) {
  const [showNote, setShowNote] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [noteColor, setNoteColor] = useState<string>("yellow");

  if (!position) return null;

  const handleColorClick = (color: string) => {
    if (showNote) {
      setNoteColor(color);
    } else {
      onHighlight(color);
    }
  };

  const handleNoteToggle = () => {
    setShowNote(true);
  };

  const handleNoteSave = () => {
    onHighlight(noteColor, noteText.trim() || undefined);
    setShowNote(false);
    setNoteText("");
    setNoteColor("yellow");
  };

  const handleDismiss = () => {
    setShowNote(false);
    setNoteText("");
    setNoteColor("yellow");
    onDismiss();
  };

  return (
    <>
      {/* Backdrop to catch outside clicks */}
      <div className="fixed inset-0 z-[59]" onClick={handleDismiss} />

      <div
        className="fixed z-[60] flex flex-col items-center gap-2"
        style={{
          left: position.x,
          top: position.y,
          transform: "translate(-50%, -100%)",
        }}
      >
        <div
          className="rounded-lg px-3 py-2 shadow-lg flex items-center gap-2"
          style={{
            backgroundColor: "var(--card)",
            border: "1px solid var(--border)",
          }}
        >
          {COLORS.map((c) => (
            <button
              key={c.name}
              className="w-7 h-7 rounded-full transition-transform hover:scale-110 focus:outline-none"
              style={{
                backgroundColor: c.bg,
                border: `2px solid ${showNote && noteColor === c.name ? c.border : "transparent"}`,
                boxShadow: showNote && noteColor === c.name ? `0 0 0 2px ${c.border}` : undefined,
              }}
              onClick={() => handleColorClick(c.name)}
              title={`Highlight ${c.name}`}
            />
          ))}

          {/* Note icon / divider */}
          <div className="w-px h-5 mx-1" style={{ backgroundColor: "var(--border)" }} />
          <button
            className="w-7 h-7 rounded-full flex items-center justify-center transition-colors hover:opacity-80 focus:outline-none"
            style={{
              backgroundColor: showNote ? "var(--warm)" : "transparent",
              color: showNote ? "var(--card)" : "var(--text-dim)",
            }}
            onClick={handleNoteToggle}
            title="Add note"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
          </button>
        </div>

        {/* Note input area */}
        {showNote && (
          <div
            className="rounded-lg p-3 shadow-lg w-64"
            style={{
              backgroundColor: "var(--card)",
              border: "1px solid var(--border)",
            }}
          >
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
            <div className="flex justify-end mt-2">
              <button
                className="px-3 py-1 rounded-md text-xs font-medium transition-colors"
                style={{
                  backgroundColor: "var(--warm)",
                  color: "white",
                }}
                onClick={handleNoteSave}
              >
                Save
              </button>
            </div>
          </div>
        )}

        {/* Arrow pointing down */}
        <div
          className="w-0 h-0 -mt-2"
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
