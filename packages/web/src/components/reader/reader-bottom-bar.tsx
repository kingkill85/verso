type ReaderBottomBarProps = {
  percentage: number;
  visible: boolean;
};

export function ReaderBottomBar({ percentage, visible }: ReaderBottomBarProps) {
  return (
    <div
      className="fixed bottom-0 left-0 right-0 h-10 flex items-center px-4 z-30 transition-opacity duration-300"
      style={{
        backgroundColor: "var(--sidebar-bg)",
        backdropFilter: "blur(8px)",
        borderTop: "1px solid var(--border)",
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      <div className="flex-1 flex items-center gap-3">
        <div
          className="flex-1 h-[3px] rounded-full overflow-hidden"
          style={{ backgroundColor: "var(--progress-bg)" }}
        >
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{
              width: `${percentage}%`,
              backgroundColor: "var(--warm)",
            }}
          />
        </div>
        <span
          className="text-[11px] whitespace-nowrap"
          style={{ color: "var(--text-dim)" }}
        >
          {percentage}%
        </span>
      </div>
    </div>
  );
}
