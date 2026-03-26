import { useState } from "react";
import type { NavItem } from "epubjs";
import type { Annotation } from "@verso/shared";
import { BookCover } from "@/components/books/book-cover";

type ReaderSidebarProps = {
  open: boolean;
  onClose: () => void;
  // Book info for header
  book: { id: string; title: string; author: string; coverPath?: string | null; updatedAt?: string | null } | null;
  // Contents tab
  toc: NavItem[];
  currentChapter: string;
  onNavigate: (href: string) => void;
  // Bookmarks tab
  bookmarks: Annotation[];
  onDeleteBookmark: (id: string) => void;
  onBookmarkNavigate: (cfi: string) => void;
  // Annotations tab
  annotations: Annotation[];
  onDeleteAnnotation: (id: string) => void;
  onAnnotationNavigate: (cfi: string) => void;
};

type Tab = "contents" | "bookmarks" | "annotations";

const COLOR_MAP: Record<string, string> = {
  yellow: "#eab308",
  green: "#22c55e",
  blue: "#3b82f6",
  pink: "#ec4899",
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function ReaderSidebar({
  open,
  onClose,
  book,
  toc,
  currentChapter,
  onNavigate,
  bookmarks,
  onDeleteBookmark,
  onBookmarkNavigate,
  annotations,
  onDeleteAnnotation,
  onAnnotationNavigate,
}: ReaderSidebarProps) {
  const [activeTab, setActiveTab] = useState<Tab>("contents");

  const tabs: { key: Tab; label: string }[] = [
    { key: "contents", label: "Contents" },
    { key: "bookmarks", label: "Bookmarks" },
    { key: "annotations", label: "Annotations" },
  ];

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      )}
      <div
        className="fixed inset-y-0 left-0 w-80 z-50 flex flex-col transition-transform duration-300"
        style={{
          backgroundColor: "var(--sidebar-bg)",
          transform: open ? "translateX(0)" : "translateX(-100%)",
        }}
      >
        {/* Book header */}
        {book && (
          <div
            className="flex items-center gap-3 px-4 py-3 shrink-0"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <BookCover
              bookId={book.id}
              title={book.title}
              author={book.author}
              coverPath={book.coverPath}
              updatedAt={book.updatedAt}
              size="sm"
            />
            <div className="min-w-0">
              <p
                className="text-sm font-semibold truncate"
                style={{ color: "var(--text)" }}
              >
                {book.title}
              </p>
              <p
                className="text-xs truncate"
                style={{ color: "var(--text-dim)" }}
              >
                {book.author}
              </p>
            </div>
          </div>
        )}

        {/* Tab bar */}
        <div className="flex shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="flex-1 py-3 text-xs font-medium transition-colors"
              style={{
                color: activeTab === tab.key ? "var(--warm)" : "var(--text-faint)",
                borderBottom: activeTab === tab.key ? "2px solid var(--warm)" : "2px solid transparent",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === "contents" && (
            <ContentsTab
              toc={toc}
              currentChapter={currentChapter}
              onNavigate={onNavigate}
              onClose={onClose}
            />
          )}
          {activeTab === "bookmarks" && (
            <BookmarksTab
              bookmarks={bookmarks}
              onDelete={onDeleteBookmark}
              onNavigate={onBookmarkNavigate}
              onClose={onClose}
            />
          )}
          {activeTab === "annotations" && (
            <AnnotationsTab
              annotations={annotations}
              onDelete={onDeleteAnnotation}
              onNavigate={onAnnotationNavigate}
              onClose={onClose}
            />
          )}
        </div>
      </div>
    </>
  );
}

function ContentsTab({
  toc,
  currentChapter,
  onNavigate,
  onClose,
}: {
  toc: NavItem[];
  currentChapter: string;
  onNavigate: (href: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="p-2">
      {toc.map((item) => {
        const isActive = item.label.trim() === currentChapter;
        return (
          <button
            key={item.id}
            onClick={() => { onClose(); setTimeout(() => onNavigate(item.href), 350); }}
            className="w-full text-left px-3 py-2 rounded-md text-[13px] transition-colors hover:opacity-80"
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
  );
}

function BookmarksTab({
  bookmarks,
  onDelete,
  onNavigate,
  onClose,
}: {
  bookmarks: Annotation[];
  onDelete: (id: string) => void;
  onNavigate: (cfi: string) => void;
  onClose: () => void;
}) {
  if (bookmarks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4">
        <p className="text-sm font-medium" style={{ color: "var(--text-dim)" }}>No bookmarks yet</p>
        <p className="text-xs mt-1" style={{ color: "var(--text-faint)" }}>
          Use the bookmark button in the top bar
        </p>
      </div>
    );
  }

  return (
    <div className="py-1">
      {bookmarks.map((bm) => (
        <div
          key={bm.id}
          className="flex items-center justify-between px-4 py-3 hover:opacity-80 transition-opacity cursor-pointer"
          style={{ borderBottom: "1px solid var(--border)" }}
          onClick={() => { onClose(); setTimeout(() => onNavigate(bm.cfiPosition), 350); }}
        >
          <div className="min-w-0 flex-1">
            <p className="text-[13px] truncate" style={{ color: "var(--text)" }}>
              {bm.chapter ?? "Unknown Chapter"}
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--text-faint)" }}>
              {bm.content ? `${bm.content}%` : ""}{bm.content && " · "}{formatDate(bm.createdAt)}
            </p>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(bm.id); }}
            className="shrink-0 ml-3 text-sm hover:opacity-80"
            style={{ color: "var(--text-faint)" }}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

function AnnotationsTab({
  annotations,
  onDelete,
  onNavigate,
  onClose,
}: {
  annotations: Annotation[];
  onDelete: (id: string) => void;
  onNavigate: (cfi: string) => void;
  onClose: () => void;
}) {
  if (annotations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4">
        <p className="text-sm font-medium" style={{ color: "var(--text-dim)" }}>No annotations yet</p>
        <p className="text-xs mt-1" style={{ color: "var(--text-faint)" }}>
          Select text in the reader to create a highlight
        </p>
      </div>
    );
  }

  // Group by chapter
  const grouped = new Map<string, Annotation[]>();
  for (const ann of annotations) {
    const chapter = ann.chapter ?? "Unknown Chapter";
    if (!grouped.has(chapter)) grouped.set(chapter, []);
    grouped.get(chapter)!.push(ann);
  }

  return (
    <div className="py-1">
      {Array.from(grouped.entries()).map(([chapter, items]) => (
        <div key={chapter}>
          <p
            className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--text-faint)" }}
          >
            {chapter}
          </p>
          {items.map((ann) => {
            const borderColor = COLOR_MAP[ann.color ?? "yellow"] ?? COLOR_MAP.yellow;
            const text = ann.content ?? "";
            const truncated = text.length > 120 ? text.slice(0, 120) + "\u2026" : text;

            return (
              <div
                key={ann.id}
                className="flex items-start gap-2 mx-3 my-1 px-3 py-2 rounded cursor-pointer hover:opacity-80 transition-opacity"
                style={{ borderLeft: `3px solid ${borderColor}` }}
                onClick={() => { onClose(); setTimeout(() => onNavigate(ann.cfiPosition), 350); }}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs leading-relaxed" style={{ color: "var(--text)" }}>
                    &ldquo;{truncated}&rdquo;
                  </p>
                  {ann.note && (
                    <p className="text-[11px] italic mt-1" style={{ color: "var(--text-dim)" }}>
                      {ann.note}
                    </p>
                  )}
                  <p className="text-[11px] mt-1" style={{ color: "var(--text-faint)" }}>
                    {formatDate(ann.createdAt)}
                  </p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(ann.id); }}
                  className="shrink-0 text-sm hover:opacity-80 pt-0.5"
                  style={{ color: "var(--text-faint)" }}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
