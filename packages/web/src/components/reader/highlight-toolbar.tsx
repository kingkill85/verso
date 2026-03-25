import { useState } from "react";

const COLORS = [
  { name: "yellow", bg: "#fef08a", ring: "#eab308" },
  { name: "green", bg: "#bbf7d0", ring: "#22c55e" },
  { name: "blue", bg: "#bfdbfe", ring: "#3b82f6" },
  { name: "pink", bg: "#fbcfe8", ring: "#ec4899" },
] as const;

type HighlightToolbarProps = {
  position: { x: number; y: number } | null;
  onHighlight: (color: string, note?: string) => void;
  onDismiss: () => void;
};

export function HighlightToolbar({ position, onHighlight, onDismiss }: HighlightToolbarProps) {
  const [showNote, setShowNote] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [noteColor, setNoteColor] = useState("yellow");

  if (!position) return null;

  const handleColorClick = (color: string) => {
    if (showNote) {
      setNoteColor(color);
    } else {
      onHighlight(color);
    }
  };

  const handleDismiss = () => {
    setShowNote(false);
    setNoteText("");
    setNoteColor("yellow");
    onDismiss();
  };

  return (
    <>
      <div className="fixed inset-0 z-[59]" onClick={handleDismiss} />

      <div
        className="fixed z-[60] flex flex-col items-center"
        style={{ left: position.x, top: position.y, transform: "translate(-50%, -100%)" }}
      >
        {/* Fixed dark bg — always visible regardless of reader theme */}
        <div className="rounded-xl px-3 py-2.5 shadow-2xl flex items-center gap-3" style={{ backgroundColor: "#1c1917", border: "1px solid #44403c" }}>
          {COLORS.map((c) => (
            <button
              key={c.name}
              className="w-8 h-8 rounded-full transition-transform hover:scale-110"
              style={{
                backgroundColor: c.bg,
                outline: showNote && noteColor === c.name ? `3px solid ${c.ring}` : "none",
                outlineOffset: "2px",
              }}
              onClick={() => handleColorClick(c.name)}
            />
          ))}
          <div className="w-px h-6 bg-stone-600" />
          <button
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-stone-700"
            style={{ color: showNote ? "#d97706" : "#a8a29e" }}
            onClick={() => setShowNote(true)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
          </button>
        </div>

        {showNote && (
          <div className="rounded-xl p-3 shadow-2xl w-64 mt-2" style={{ backgroundColor: "#1c1917", border: "1px solid #44403c" }}>
            <textarea
              className="w-full rounded-lg px-2 py-1.5 text-sm resize-none focus:outline-none bg-stone-800 text-stone-200 border border-stone-600"
              rows={3}
              placeholder="Add a note..."
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              autoFocus
            />
            <div className="flex justify-end mt-2">
              <button
                className="px-3 py-1 rounded-lg text-xs font-medium bg-amber-700 text-white"
                onClick={() => {
                  onHighlight(noteColor, noteText.trim() || undefined);
                  setShowNote(false);
                  setNoteText("");
                  setNoteColor("yellow");
                }}
              >
                Save
              </button>
            </div>
          </div>
        )}

        {/* Arrow */}
        <div className="w-0 h-0 mt-0" style={{ borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderTop: "6px solid #1c1917" }} />
      </div>
    </>
  );
}
