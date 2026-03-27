import { useTranslation } from "react-i18next";

type ReaderTopBarProps = {
  title: string;
  visible: boolean;
  onClose: () => void;
  onToggleSidebar: () => void;
  onToggleSettings: () => void;
  onToggleBookmark: () => void;
  isBookmarked: boolean;
};

const ICON_BUTTON = "flex items-center justify-center w-8 h-8 hover:opacity-80 transition-opacity";

function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
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
  const { t } = useTranslation();
  return (
    <div
      className="fixed top-0 left-0 right-0 h-12 flex items-center justify-between px-3 z-30 transition-opacity duration-300"
      style={{
        backgroundColor: "var(--sidebar-bg)",
        backdropFilter: "blur(8px)",
        borderBottom: "1px solid var(--border)",
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      <div className="flex items-center gap-1">
        <button
          onClick={onToggleSidebar}
          className={ICON_BUTTON}
          style={{ color: "var(--text-dim)" }}
          title={t("reader.toc")}
        >
          <MenuIcon />
        </button>
        <button
          onClick={onToggleBookmark}
          className={ICON_BUTTON}
          style={{ color: isBookmarked ? "var(--warm)" : "var(--text-dim)" }}
          title={isBookmarked ? t("reader.removeBookmark") : t("reader.addBookmark")}
        >
          <BookmarkIcon filled={isBookmarked} />
        </button>
        <span
          className="font-display text-sm truncate max-w-[200px] md:max-w-[400px] ml-2"
          style={{ color: "var(--text)" }}
        >
          {title}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={onToggleSettings}
          className={ICON_BUTTON}
          style={{ color: "var(--text-dim)" }}
          title={t("reader.settings")}
        >
          <SettingsIcon />
        </button>
        <button
          onClick={onClose}
          className={ICON_BUTTON}
          style={{ color: "var(--text-dim)" }}
          title={t("reader.close")}
        >
          <CloseIcon />
        </button>
      </div>
    </div>
  );
}
