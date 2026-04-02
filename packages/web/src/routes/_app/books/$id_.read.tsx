import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useRef } from "react";
import { trpc } from "@/trpc";
import { useReader, type TextSelection } from "@/hooks/use-reader";
import { useProgressSync } from "@/hooks/use-progress-sync";
import { useReadingTimer } from "@/hooks/use-reading-timer";
import { ReaderTopBar } from "@/components/reader/reader-top-bar";
import { ReaderBottomBar } from "@/components/reader/reader-bottom-bar";
import { ReaderSidebar } from "@/components/reader/reader-sidebar";
import { SettingsPanel } from "@/components/reader/settings-panel";
import { HighlightToolbar } from "@/components/reader/highlight-toolbar";
import { HighlightPopover } from "@/components/reader/highlight-popover";
import type { Annotation } from "@verso/shared";

export const Route = createFileRoute("/_app/books/$id_/read")({
  component: ReaderPage,
  validateSearch: (search: Record<string, unknown>) => ({
    cfi: typeof search.cfi === "string" ? search.cfi : undefined,
  }),
});

function ReaderPage() {
  const { id } = Route.useParams();
  const { cfi: searchCfi } = Route.useSearch();
  const navigate = useNavigate();

  const bookQuery = trpc.books.byId.useQuery({ id });
  const progressQuery = trpc.progress.get.useQuery({ bookId: id });

  const initialCfi = searchCfi ?? progressQuery.data?.cfiPosition ?? null;
  const initialPercentage = (!initialCfi && progressQuery.data?.percentage) ? progressQuery.data.percentage : null;
  const dataReady = bookQuery.isSuccess && progressQuery.isSuccess;

  // Declare before useReader so callbacks can reference them
  const [toolbarPos, setToolbarPos] = useState<{ x: number; y: number } | null>(null);
  const pendingSelectionRef = useRef<{ range: Range; doc: Document; index: number } | null>(null);
  const tapHandlerRef = useRef<(zone: "prev" | "next" | "center") => void>(() => {});

  const {
    containerRef,
    viewRef,
    isLoaded,
    isPDF,
    currentCfi,
    percentage,
    toc,
    currentChapter,
    settings,
    nextPage,
    prevPage,
    goTo,
    getCFI,
    addAnnotation,
    removeAnnotation,
    updateSettings,
    settingsVersion,
  } = useReader({
    bookId: id,
    format: (bookQuery.data?.fileFormat as "epub" | "pdf") ?? "epub",
    initialCfi: dataReady ? initialCfi : undefined,
    initialPercentage: dataReady ? initialPercentage : undefined,
    enabled: dataReady,
    onTextSelect: useCallback((sel: TextSelection | null) => {
      if (!sel) {
        setToolbarPos(null);
        return;
      }
      setToolbarPos(sel.pos);
      pendingSelectionRef.current = { range: sel.range, doc: sel.doc, index: sel.index };
    }, []),
    onTap: useCallback((zone: "prev" | "next" | "center") => {
      tapHandlerRef.current(zone);
    }, []),
  });

  const { consumeMinutes } = useReadingTimer();
  const { syncNow } = useProgressSync({
    bookId: id,
    percentage,
    cfiPosition: currentCfi,
    enabled: isLoaded,
    getTimeMinutes: consumeMinutes,
  });

  const [controlsVisible, setControlsVisible] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // ─── Annotations ───
  const annotationsQuery = trpc.annotations.list.useQuery({ bookId: id }, { enabled: isLoaded });
  const createAnnotation = trpc.annotations.create.useMutation({ onSuccess: () => annotationsQuery.refetch() });
  const updateAnnotation = trpc.annotations.update.useMutation({ onSuccess: () => annotationsQuery.refetch() });
  const deleteAnnotation = trpc.annotations.delete.useMutation({ onSuccess: () => annotationsQuery.refetch() });

  // ─── Bookmarks ───
  const bookmarksQuery = trpc.annotations.listBookmarks.useQuery({ bookId: id }, { enabled: isLoaded });
  const createBookmark = trpc.annotations.createBookmark.useMutation({
    onSuccess: () => bookmarksQuery.refetch(),
  });
  const deleteBookmark = trpc.annotations.deleteBookmark.useMutation({
    onSuccess: () => bookmarksQuery.refetch(),
  });

  const isBookmarked = bookmarksQuery.data?.some((bm) => bm.cfiPosition === currentCfi) ?? false;

  const handleToggleBookmark = useCallback(() => {
    if (!currentCfi) return;
    const existing = bookmarksQuery.data?.find((bm) => bm.cfiPosition === currentCfi);
    if (existing) {
      deleteBookmark.mutate({ id: existing.id });
    } else {
      createBookmark.mutate({
        bookId: id,
        cfiPosition: currentCfi,
        chapter: currentChapter,
        percentage,
      });
    }
  }, [currentCfi, bookmarksQuery.data, id, currentChapter, percentage]);

  const [popoverAnnotation, setPopoverAnnotation] = useState<Annotation | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ x: number; y: number } | null>(null);

  // Keep popover in sync with latest annotation data after mutations
  useEffect(() => {
    if (popoverAnnotation) {
      const updated = annotationsQuery.data?.find((a) => a.id === popoverAnnotation.id);
      if (updated && (updated.color !== popoverAnnotation.color || updated.note !== popoverAnnotation.note)) {
        setPopoverAnnotation(updated);
      }
    }
  }, [annotationsQuery.data]);

  // Render existing annotations via foliate-js
  useEffect(() => {
    if (!isLoaded || !annotationsQuery.data) return;
    // Use rAF to ensure the overlayer is attached before drawing
    const id = requestAnimationFrame(() => {
      for (const ann of annotationsQuery.data) {
        if (!ann.cfiPosition) continue;
        addAnnotation(ann.cfiPosition, ann.color ?? "yellow");
      }
    });
    return () => cancelAnimationFrame(id);
  }, [annotationsQuery.data, isLoaded, settingsVersion, addAnnotation]);

  // Handle annotation clicks via foliate-js show-annotation event
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !isLoaded) return;

    const handleShowAnnotation = ({ detail }: any) => {
      const { value, range } = detail;
      const ann = annotationsQuery.data?.find((a) => a.cfiPosition === value);
      if (!ann) return;

      const rect = range.getBoundingClientRect();
      const contents = view.renderer?.getContents?.();
      const iframe = contents?.[0]?.doc?.defaultView?.frameElement;
      const iframeRect = iframe?.getBoundingClientRect();

      setPopoverAnnotation(ann);
      setPopoverPos({
        x: (iframeRect?.left ?? 0) + rect.left + rect.width / 2,
        y: (iframeRect?.top ?? 0) + rect.top - 10,
      });
    };

    view.addEventListener("show-annotation", handleShowAnnotation);
    return () => view.removeEventListener("show-annotation", handleShowAnnotation);
  }, [viewRef, isLoaded, annotationsQuery.data]);

  const handleHighlight = (color: string, note?: string) => {
    if (!pendingSelectionRef.current) return;
    const { range, doc, index } = pendingSelectionRef.current;
    const cfi = getCFI(index, range);
    if (!cfi) return;

    const text = range.toString();
    addAnnotation(cfi, color);

    createAnnotation.mutate({
      bookId: id,
      cfiPosition: cfi,
      content: text.slice(0, 500),
      color: color as any,
      note,
      chapter: currentChapter,
    });

    doc.getSelection()?.removeAllRanges();
    setToolbarPos(null);
    pendingSelectionRef.current = null;
  };

  const handleDismissToolbar = () => {
    setToolbarPos(null);
    pendingSelectionRef.current = null;
  };

  const clearSelection = useCallback(() => {
    setToolbarPos(null);
    pendingSelectionRef.current = null;
    setPopoverAnnotation(null);
  }, []);

  // ─── Reader chrome ───

  useEffect(() => {
    if (!controlsVisible || sidebarOpen || settingsOpen) return;
    const timer = setTimeout(() => setControlsVisible(false), 3000);
    return () => clearTimeout(timer);
  }, [controlsVisible, sidebarOpen, settingsOpen]);

  const toggleControls = useCallback(() => setControlsVisible((v) => !v), []);

  // Update tap handler ref — called from the hook's load event listener
  tapHandlerRef.current = (zone) => {
    if (zone === "prev") { clearSelection(); prevPage(); syncNow(); }
    else if (zone === "next") { clearSelection(); nextPage(); syncNow(); }
    else { toggleControls(); }
  };

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      switch (e.key) {
        case "ArrowRight":
        case " ":
          e.preventDefault();
          clearSelection();
          nextPage();
          syncNow();
          break;
        case "ArrowLeft":
          e.preventDefault();
          clearSelection();
          prevPage();
          syncNow();
          break;
        case "Escape":
          window.history.back();
          break;
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nextPage, prevPage, navigate, id, syncNow, clearSelection]);

  const handleClose = useCallback(() => window.history.back(), []);

  if (!dataReady) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ backgroundColor: "var(--bg)" }}>
        <p className="text-sm" style={{ color: "var(--text-dim)" }}>Loading book...</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 safe-top safe-bottom" style={{ backgroundColor: "var(--bg)" }}>
      <div ref={containerRef} className="absolute inset-0 z-0" />



      {!controlsVisible && (
        <div className="fixed top-0 left-0 right-0 h-12 z-[25]" onMouseEnter={() => setControlsVisible(true)} />
      )}

      <ReaderTopBar
        title={bookQuery.data?.title ?? ""}
        visible={controlsVisible}
        onClose={handleClose}
        onToggleSidebar={() => { setSidebarOpen((v) => !v); setControlsVisible(true); }}
        onToggleSettings={isPDF ? undefined : () => { setSettingsOpen((v) => !v); setControlsVisible(true); }}
        onToggleBookmark={handleToggleBookmark}
        isBookmarked={isBookmarked}
      />
      <ReaderBottomBar percentage={percentage} visible={controlsVisible} />

      <ReaderSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        book={bookQuery.data ? {
          id: bookQuery.data.id,
          title: bookQuery.data.title,
          author: bookQuery.data.author,
          coverPath: bookQuery.data.coverPath,
          updatedAt: bookQuery.data.updatedAt,
        } : null}
        toc={toc}
        currentChapter={currentChapter}
        onNavigate={(href) => { clearSelection(); goTo(href); syncNow(); }}
        bookmarks={bookmarksQuery.data ?? []}
        onDeleteBookmark={(bmId) => deleteBookmark.mutate({ id: bmId })}
        onBookmarkNavigate={(cfi) => { clearSelection(); goTo(cfi); syncNow(); }}
        annotations={annotationsQuery.data ?? []}
        onDeleteAnnotation={(annId) => {
          const ann = annotationsQuery.data?.find((a) => a.id === annId);
          if (ann?.cfiPosition) removeAnnotation(ann.cfiPosition);
          deleteAnnotation.mutate({ id: annId });
        }}
        onAnnotationNavigate={(cfi) => { clearSelection(); goTo(cfi); syncNow(); }}
      />
      {!isPDF && <SettingsPanel settings={settings} open={settingsOpen} onClose={() => setSettingsOpen(false)} onUpdate={updateSettings} />}

      <HighlightToolbar position={toolbarPos} onHighlight={handleHighlight} onDismiss={handleDismissToolbar} />
      <HighlightPopover
        annotation={popoverAnnotation}
        position={popoverPos}
        onUpdateColor={(aid, color) => updateAnnotation.mutate({ id: aid, color: color as any })}
        onUpdateNote={(aid, note) => updateAnnotation.mutate({ id: aid, note })}
        onDelete={(aid) => {
          const ann = annotationsQuery.data?.find((a) => a.id === aid);
          if (ann?.cfiPosition) removeAnnotation(ann.cfiPosition);
          deleteAnnotation.mutate({ id: aid });
          setPopoverAnnotation(null);
        }}
        onDismiss={() => setPopoverAnnotation(null)}
      />

      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center z-20" style={{ backgroundColor: "var(--bg)" }}>
          <p className="text-sm" style={{ color: "var(--text-dim)" }}>Rendering book...</p>
        </div>
      )}
    </div>
  );
}
