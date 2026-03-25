import type { NavItem } from "epubjs";

type TOCPanelProps = {
  toc: NavItem[];
  currentChapter: string;
  open: boolean;
  onClose: () => void;
  onNavigate: (href: string) => void;
};

export function TOCPanel({ toc, currentChapter, open, onClose, onNavigate }: TOCPanelProps) {
  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40"
          onClick={onClose}
        />
      )}
      <div
        className="fixed inset-y-0 left-0 w-72 z-50 overflow-y-auto transition-transform duration-300"
        style={{
          backgroundColor: "var(--sidebar-bg)",
          transform: open ? "translateX(0)" : "translateX(-100%)",
        }}
      >
        <div className="p-4">
          <p
            className="text-[10px] font-medium uppercase tracking-[1.5px] mb-4"
            style={{ color: "var(--text-faint)" }}
          >
            Contents
          </p>
          <div className="flex flex-col gap-0.5">
            {toc.map((item) => {
              const isActive = item.label.trim() === currentChapter;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onNavigate(item.href);
                    onClose();
                  }}
                  className="text-left px-3 py-2 rounded-md text-[13px] transition-colors hover:opacity-80"
                  style={{
                    backgroundColor: isActive ? "var(--warm-glow)" : "transparent",
                    color: isActive ? "var(--warm)" : "var(--text-dim)",
                    fontWeight: isActive ? 500 : 400,
                  }}
                >
                  {item.label.trim()}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
