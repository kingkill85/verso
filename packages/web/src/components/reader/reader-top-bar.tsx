type ReaderTopBarProps = {
  title: string;
  visible: boolean;
  onClose: () => void;
  onToggleToc: () => void;
  onToggleSettings: () => void;
};

export function ReaderTopBar({ title, visible, onClose, onToggleToc, onToggleSettings }: ReaderTopBarProps) {
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
      <div className="flex items-center gap-3">
        <button
          onClick={onClose}
          className="text-sm hover:opacity-80 transition-opacity"
          style={{ color: "var(--text-dim)" }}
        >
          ✕
        </button>
        <span
          className="font-display text-sm truncate max-w-[200px] md:max-w-[400px]"
          style={{ color: "var(--text)" }}
        >
          {title}
        </span>
      </div>
      <div className="flex gap-4">
        <button
          onClick={onToggleToc}
          className="text-sm hover:opacity-80 transition-opacity"
          style={{ color: "var(--text-dim)" }}
          title="Table of Contents"
        >
          ☰
        </button>
        <button
          onClick={onToggleSettings}
          className="text-sm hover:opacity-80 transition-opacity"
          style={{ color: "var(--text-dim)" }}
          title="Settings"
        >
          ⚙
        </button>
      </div>
    </div>
  );
}
