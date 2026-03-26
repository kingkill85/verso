import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useRef } from "react";
import { trpc } from "@/trpc";
import { useEpubReader } from "@/hooks/use-epub-reader";
import { useProgressSync } from "@/hooks/use-progress-sync";
import { useReadingTimer } from "@/hooks/use-reading-timer";
import { ReaderTopBar } from "@/components/reader/reader-top-bar";
import { ReaderBottomBar } from "@/components/reader/reader-bottom-bar";
import { TapZones } from "@/components/reader/tap-zones";
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

const HL_COLORS: Record<string, Record<string, string>> = {
  yellow: { fill: "rgb(250,204,21)", "fill-opacity": "0.4", "mix-blend-mode": "multiply" },
  green:  { fill: "rgb(34,197,94)",  "fill-opacity": "0.4", "mix-blend-mode": "multiply" },
  blue:   { fill: "rgb(59,130,246)", "fill-opacity": "0.35", "mix-blend-mode": "multiply" },
  pink:   { fill: "rgb(236,72,153)", "fill-opacity": "0.35", "mix-blend-mode": "multiply" },
};

function ReaderPage() {
  const { id } = Route.useParams();
  const { cfi: searchCfi } = Route.useSearch();
  const navigate = useNavigate();

  const bookQuery = trpc.books.byId.useQuery({ id });
  const progressQuery = trpc.progress.get.useQuery({ bookId: id });

  const initialCfi = searchCfi ?? progressQuery.data?.cfiPosition ?? null;
  const dataReady = bookQuery.isSuccess && progressQuery.isSuccess;

  const {
    containerRef,
    renditionRef,
    isLoaded,
    currentCfi,
    percentage,
    toc,
    currentChapter,
    settings,
    nextPage,
    prevPage,
    goTo,
    updateSettings,
    settingsVersion,
  } = useEpubReader({
    bookId: id,
    initialCfi: dataReady ? initialCfi : undefined,
    enabled: dataReady,
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

  const [toolbarPos, setToolbarPos] = useState<{ x: number; y: number } | null>(null);
  const [popoverAnnotation, setPopoverAnnotation] = useState<Annotation | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ x: number; y: number } | null>(null);
  const [selectionData, setSelectionData] = useState<{ text: string; cfiRange: string } | null>(null);

  // Keep ref to annotations for use in highlight click callbacks
  const annotationsRef = useRef<Annotation[]>([]);
  useEffect(() => {
    annotationsRef.current = annotationsQuery.data || [];
    // Keep popover in sync with latest annotation data after mutations
    if (popoverAnnotation) {
      const updated = annotationsQuery.data?.find((a) => a.id === popoverAnnotation.id);
      if (updated && (updated.color !== popoverAnnotation.color || updated.note !== popoverAnnotation.note)) {
        setPopoverAnnotation(updated);
      }
    }
  }, [annotationsQuery.data]);

  // Track which CFIs we've already added to avoid duplicates
  const addedHighlightsRef = useRef(new Set<string>());

  // Render highlights — re-add when annotations or settings change
  useEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition || !annotationsQuery.data) return;

    // Clear existing highlights on settings change so SVG rects get recalculated
    if (addedHighlightsRef.current.size > 0) {
      for (const cfi of addedHighlightsRef.current) {
        try { rendition.annotations.remove(cfi, "highlight"); } catch { /* ok */ }
      }
      addedHighlightsRef.current.clear();
    }

    // Small delay to let epub.js finish re-rendering after settings change
    const timer = setTimeout(() => {
    for (const ann of annotationsQuery.data) {
      if (!ann.cfiPosition || addedHighlightsRef.current.has(ann.cfiPosition)) continue;
      addedHighlightsRef.current.add(ann.cfiPosition);

      try {
        rendition.annotations.highlight(
          ann.cfiPosition,
          { id: ann.id },
          undefined,
          "epubjs-hl",
          HL_COLORS[ann.color || "yellow"] || HL_COLORS.yellow,
        );
      } catch { /* CFI not in current chapter — epub.js handles this */ }
    }

    }, 200);

    return () => clearTimeout(timer);
  }, [annotationsQuery.data, isLoaded, settingsVersion]);

  // After page navigation, force SVG highlight rects to recalculate positions.
  // epub.js calculates rects before layout fully settles — this fixes the offset.
  useEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition || !isLoaded) return;

    const onRelocated = () => {
      const container = containerRef.current;
      const svgs = container?.querySelectorAll<SVGSVGElement>("svg");
      // Instantly hide, then fade in after recalculation
      svgs?.forEach((svg) => {
        if (svg.querySelector("g.epubjs-hl")) {
          svg.style.transition = "none";
          svg.style.opacity = "0";
        }
      });

      setTimeout(() => {
        try {
          const views = rendition.views();
          if (views?.forEach) {
            views.forEach((view: any) => {
              if (view.pane) view.pane.render();
            });
          }
        } catch { /* ignore */ }
        svgs?.forEach((svg) => {
          if (svg.querySelector("g.epubjs-hl")) {
            svg.style.transition = "opacity 150ms ease-in";
            svg.style.opacity = "1";
          }
        });
      }, 150);
    };

    rendition.on("relocated", onRelocated);
    return () => rendition.off("relocated", onRelocated);
  }, [isLoaded]);

  // Enable pointer-events on highlight <g> elements so clicks reach them
  // directly instead of relying on marks-pane's broken mouse proxy.
  // Uses MutationObserver to catch highlights added by epub.js on page turns.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !isLoaded) return;

    const enablePointerEvents = () => {
      container.querySelectorAll<SVGGElement>("g.epubjs-hl").forEach((g) => {
        if (!g.style.pointerEvents) {
          g.style.pointerEvents = "auto";
          g.style.cursor = "pointer";
        }
      });
    };

    enablePointerEvents();

    const observer = new MutationObserver(enablePointerEvents);
    observer.observe(container, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [isLoaded]);

  // Handle highlight clicks via rendition markClicked event
  useEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition || !isLoaded) return;

    const onMarkClicked = (cfiRange: string, data: { id?: string }, contents: any) => {
      if (!data?.id) return;
      const matched = annotationsRef.current.find((a) => a.id === data.id);
      if (!matched) return;

      try {
        const range = contents.range(cfiRange);
        const rect = range.getBoundingClientRect();
        const iframe = contents.document.defaultView.frameElement as HTMLIFrameElement | null;
        if (!iframe) return;
        const iframeRect = iframe.getBoundingClientRect();

        setPopoverAnnotation(matched);
        setPopoverPos({
          x: iframeRect.left + rect.left + rect.width / 2,
          y: iframeRect.top + rect.top - 10,
        });
        setToolbarPos(null);
      } catch { /* ignore */ }
    };

    rendition.on("markClicked", onMarkClicked);
    return () => rendition.off("markClicked", onMarkClicked);
  }, [isLoaded]);

  // Text selection → show toolbar
  useEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition || !isLoaded) return;

    const onSelected = (cfiRange: string, contents: any) => {
      try {
        const sel = contents.window.getSelection();
        if (!sel || sel.isCollapsed) return;
        const text = sel.toString().trim();
        if (!text) return;

        // Get rect from the CFI range via contents.range()
        const range = contents.range(cfiRange);
        const rect = range.getBoundingClientRect();

        // Get iframe position in the outer document
        const iframe = contents.document.defaultView.frameElement;
        if (!iframe) return;
        const iframeRect = iframe.getBoundingClientRect();

        setToolbarPos({
          x: iframeRect.left + rect.left + rect.width / 2,
          y: iframeRect.top + rect.top - 20,
        });
        setSelectionData({ text, cfiRange });
        setPopoverAnnotation(null); // dismiss any open popover
      } catch { /* ignore */ }
    };

    rendition.on("selected", onSelected);
    return () => rendition.off("selected", onSelected);
  }, [isLoaded]);

  const handleHighlight = (color: string, note?: string) => {
    if (!selectionData) return;
    createAnnotation.mutate({
      bookId: id,
      cfiPosition: selectionData.cfiRange,
      content: selectionData.text,
      color: color as any,
      note,
      chapter: currentChapter,
    });
    setToolbarPos(null);
    setSelectionData(null);
    // Clear selection in iframe
    try {
      renditionRef.current?.manager?.container
        ?.querySelector("iframe")
        ?.contentWindow?.getSelection()
        ?.removeAllRanges();
    } catch { /* ignore */ }
  };

  const handleDismissToolbar = () => {
    setToolbarPos(null);
    setSelectionData(null);
  };

  // Clear any active text selection + toolbar/popover — call before any navigation
  const clearSelection = useCallback(() => {
    setToolbarPos(null);
    setSelectionData(null);
    setPopoverAnnotation(null);
    try {
      renditionRef.current?.manager?.container
        ?.querySelector("iframe")
        ?.contentWindow?.getSelection()
        ?.removeAllRanges();
    } catch { /* ignore */ }
  }, []);

  // ─── Reader chrome ───

  useEffect(() => {
    if (!controlsVisible || sidebarOpen || settingsOpen) return;
    const timer = setTimeout(() => setControlsVisible(false), 3000);
    return () => clearTimeout(timer);
  }, [controlsVisible, sidebarOpen, settingsOpen]);

  const toggleControls = useCallback(() => setControlsVisible((v) => !v), []);

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
          navigate({ to: "/books/$id", params: { id } });
          break;
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nextPage, prevPage, navigate, id, syncNow, clearSelection]);

  const handleClose = useCallback(() => navigate({ to: "/books/$id", params: { id } }), [navigate, id]);

  if (!dataReady) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ backgroundColor: "var(--bg)" }}>
        <p className="text-sm" style={{ color: "var(--text-dim)" }}>Loading book...</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50" style={{ backgroundColor: "var(--bg)" }}>
      <div ref={containerRef} className="absolute inset-0 z-0" />

      <TapZones
        renditionRef={renditionRef}
        isLoaded={isLoaded}
        onPrev={() => { clearSelection(); prevPage(); syncNow(); }}
        onNext={() => { clearSelection(); nextPage(); syncNow(); }}
        onCenter={toggleControls}
      />

      {!controlsVisible && (
        <div className="fixed top-0 left-0 right-0 h-12 z-[25]" onMouseEnter={() => setControlsVisible(true)} />
      )}

      <ReaderTopBar
        title={bookQuery.data?.title ?? ""}
        visible={controlsVisible}
        onClose={handleClose}
        onToggleSidebar={() => { setSidebarOpen((v) => !v); setControlsVisible(true); }}
        onToggleSettings={() => { setSettingsOpen((v) => !v); setControlsVisible(true); }}
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
          if (ann) {
            try { renditionRef.current?.annotations.remove(ann.cfiPosition, "highlight"); } catch {}
            addedHighlightsRef.current.delete(ann.cfiPosition);
          }
          deleteAnnotation.mutate({ id: annId });
        }}
        onAnnotationNavigate={(cfi) => { clearSelection(); goTo(cfi); syncNow(); }}
      />
      <SettingsPanel settings={settings} open={settingsOpen} onClose={() => setSettingsOpen(false)} onUpdate={updateSettings} />

      <HighlightToolbar position={toolbarPos} onHighlight={handleHighlight} onDismiss={handleDismissToolbar} />
      <HighlightPopover
        annotation={popoverAnnotation}
        position={popoverPos}
        onUpdateColor={(aid, color) => updateAnnotation.mutate({ id: aid, color: color as any })}
        onUpdateNote={(aid, note) => updateAnnotation.mutate({ id: aid, note })}
        onDelete={(aid) => {
          const ann = annotationsQuery.data?.find((a) => a.id === aid);
          if (ann) {
            try { renditionRef.current?.annotations.remove(ann.cfiPosition, "highlight"); } catch {}
            addedHighlightsRef.current.delete(ann.cfiPosition);
          }
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
