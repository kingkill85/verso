type ReaderTopBarProps = {
  title: string;
  visible: boolean;
  onClose: () => void;
  onToggleSidebar: () => void;
  onToggleSettings: () => void;
  onToggleBookmark: () => void;
  isBookmarked: boolean;
};

export function ReaderTopBar({
  title,
  visible,
  onClose,
  onToggleSidebar,
  onToggleSettings,
  onToggleBookmark,
  isBookmarked,
}: ReaderTopBarProps) {
  return (
    <div
      className="fixed top-0 left-0 right-0 h-12 flex items-center justify-between px-4 z-30 transition-opacity duration-300"
      style={{
        backgroundColor: "rgba(18,17,15,0.92)",
        backdropFilter: "blur(8px)",
        borderBottom: "1px solid rgba(46,42,36,0.5)",
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      <div className="flex items-center gap-4">
        <button
          onClick={onToggleSidebar}
          className="text-lg hover:opacity-80 transition-opacity"
          style={{ color: "var(--text-dim)" }}
          title="Table of Contents"
        >
          ☰
        </button>
        <span
          className="font-display text-sm truncate max-w-[200px] md:max-w-[400px]"
          style={{ color: "var(--text)" }}
        >
          {title}
        </span>
      </div>
      <div className="flex items-center gap-5">
        <button
          onClick={onToggleBookmark}
          className="text-lg hover:opacity-80 transition-opacity"
          style={{ color: isBookmarked ? "var(--warm)" : "var(--text-dim)" }}
          title={isBookmarked ? "Remove bookmark" : "Bookmark this page"}
        >
          🔖
        </button>
        <button
          onClick={onToggleSettings}
          className="text-lg hover:opacity-80 transition-opacity"
          style={{ color: "var(--text-dim)" }}
          title="Settings"
        >
          ⚙
        </button>
        <button
          onClick={onClose}
          className="text-lg hover:opacity-80 transition-opacity"
          style={{ color: "var(--text-dim)" }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
