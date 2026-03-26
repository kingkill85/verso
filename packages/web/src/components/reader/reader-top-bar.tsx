type ReaderTopBarProps = {
  title: string;
  visible: boolean;
  onClose: () => void;
  onToggleSidebar: () => void;
  onToggleSettings: () => void;
  onToggleBookmark: () => void;
  isBookmarked: boolean;
};

function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

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
        backgroundColor: "var(--sidebar-bg)",
        backdropFilter: "blur(8px)",
        borderBottom: "1px solid var(--border)",
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
        <button
          onClick={onToggleBookmark}
          className="hover:opacity-80 transition-opacity"
          style={{ color: isBookmarked ? "var(--warm)" : "var(--text-dim)" }}
          title={isBookmarked ? "Remove bookmark" : "Bookmark this page"}
        >
          <BookmarkIcon filled={isBookmarked} />
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
