import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useRef } from "react";
import { trpc } from "@/trpc";
import { useEpubReader } from "@/hooks/use-epub-reader";
import { useProgressSync } from "@/hooks/use-progress-sync";
import { useReadingTimer } from "@/hooks/use-reading-timer";
import { ReaderTopBar } from "@/components/reader/reader-top-bar";
import { ReaderBottomBar } from "@/components/reader/reader-bottom-bar";
import { TapZones } from "@/components/reader/tap-zones";
import { TOCPanel } from "@/components/reader/toc-panel";
import { SettingsPanel } from "@/components/reader/settings-panel";
import { HighlightToolbar } from "@/components/reader/highlight-toolbar";
import { HighlightPopover } from "@/components/reader/highlight-popover";
import type { Annotation } from "@verso/shared";

export const Route = createFileRoute("/_app/books/$id_/read")({
  component: ReaderPage,
});

function ReaderPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();

  const bookQuery = trpc.books.byId.useQuery({ id });
  const progressQuery = trpc.progress.get.useQuery({ bookId: id });

  const initialCfi = progressQuery.data?.cfiPosition ?? null;
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
  const [tocOpen, setTocOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Annotations
  const annotationsQuery = trpc.annotations.list.useQuery({ bookId: id }, { enabled: isLoaded });
  const createAnnotation = trpc.annotations.create.useMutation({ onSuccess: () => annotationsQuery.refetch() });
  const updateAnnotation = trpc.annotations.update.useMutation({ onSuccess: () => annotationsQuery.refetch() });
  const deleteAnnotation = trpc.annotations.delete.useMutation({ onSuccess: () => annotationsQuery.refetch() });

  const [toolbarPos, setToolbarPos] = useState<{ x: number; y: number } | null>(null);
  const [popoverAnnotation, setPopoverAnnotation] = useState<Annotation | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ x: number; y: number } | null>(null);
  const [selectionData, setSelectionData] = useState<{ text: string; cfiRange: string } | null>(null);

  // Apply existing highlights onto the rendition
  useEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition || !annotationsQuery.data) return;

    const colorMap: Record<string, string> = {
      yellow: "rgba(254,240,138,0.4)",
      green: "rgba(187,247,208,0.4)",
      blue: "rgba(191,219,254,0.4)",
      pink: "rgba(251,207,232,0.4)",
    };

    for (const ann of annotationsQuery.data) {
      if (ann.cfiPosition) {
        try {
          rendition.annotations.highlight(
            ann.cfiPosition,
            { id: ann.id },
            () => {
              setPopoverAnnotation(ann);
              setPopoverPos({
                x: window.innerWidth / 2,
                y: window.innerHeight / 3,
              });
            },
            "hl",
            { fill: colorMap[ann.color || "yellow"] || colorMap.yellow }
          );
        } catch {
          // CFI may be invalid for current chapter
        }
      }
    }
  }, [annotationsQuery.data, isLoaded]);

  // Track mouse position for toolbar placement
  const lastMousePos = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const onMouse = (e: MouseEvent) => { lastMousePos.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener("mouseup", onMouse);
    return () => window.removeEventListener("mouseup", onMouse);
  }, []);

  // Listen for text selection in epub
  useEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition || !isLoaded) return;

    const onSelected = (cfiRange: string, contents: any) => {
      const selection = contents.window.getSelection();
      if (!selection || selection.isCollapsed) return;

      const text = selection.toString().trim();
      if (!text) return;

      setToolbarPos({
        x: lastMousePos.current.x,
        y: lastMousePos.current.y - 20,
      });
      setSelectionData({ text, cfiRange });
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
  };

  const handleDismissToolbar = () => {
    setToolbarPos(null);
    setSelectionData(null);
  };

  // Auto-hide controls after 3s
  useEffect(() => {
    if (!controlsVisible || tocOpen || settingsOpen) return;
    const timer = setTimeout(() => setControlsVisible(false), 3000);
    return () => clearTimeout(timer);
  }, [controlsVisible, tocOpen, settingsOpen]);

  const toggleControls = useCallback(() => {
    setControlsVisible((v) => !v);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      switch (e.key) {
        case "ArrowRight":
        case " ":
          e.preventDefault();
          nextPage();
          syncNow();
          break;
        case "ArrowLeft":
          e.preventDefault();
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
  }, [nextPage, prevPage, navigate, id, syncNow]);

  const handleClose = useCallback(() => {
    navigate({ to: "/books/$id", params: { id } });
  }, [navigate, id]);

  if (!dataReady) {
    return (
      <div
        className="fixed inset-0 flex items-center justify-center"
        style={{ backgroundColor: "var(--bg)" }}
      >
        <p className="text-sm" style={{ color: "var(--text-dim)" }}>
          Loading book...
        </p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50" style={{ backgroundColor: "var(--bg)" }}>
      {/* EPUB container */}
      <div
        ref={containerRef}
        className="absolute inset-0 z-0"
        style={{ top: 0, bottom: 0 }}
      />

      {/* Navigation tap zones */}
      <TapZones
        onPrev={() => { prevPage(); syncNow(); }}
        onNext={() => { nextPage(); syncNow(); }}
        onCenter={toggleControls}
      />

      {/* Hover zone at top to reveal controls */}
      {!controlsVisible && (
        <div
          className="fixed top-0 left-0 right-0 h-12 z-[25]"
          onMouseEnter={() => setControlsVisible(true)}
        />
      )}

      {/* Chrome */}
      <ReaderTopBar
        title={bookQuery.data?.title ?? ""}
        visible={controlsVisible}
        onClose={handleClose}
        onToggleToc={() => { setTocOpen((v) => !v); setControlsVisible(true); }}
        onToggleSettings={() => { setSettingsOpen((v) => !v); setControlsVisible(true); }}
      />
      <ReaderBottomBar
        percentage={percentage}
        visible={controlsVisible}
      />

      {/* Panels */}
      <TOCPanel
        toc={toc}
        currentChapter={currentChapter}
        open={tocOpen}
        onClose={() => setTocOpen(false)}
        onNavigate={(href) => { goTo(href); syncNow(); }}
      />
      <SettingsPanel
        settings={settings}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onUpdate={updateSettings}
      />

      {/* Highlight toolbar and popover */}
      <HighlightToolbar
        position={toolbarPos}
        onHighlight={handleHighlight}
        onDismiss={handleDismissToolbar}
      />
      <HighlightPopover
        annotation={popoverAnnotation}
        position={popoverPos}
        onUpdateColor={(aid, color) => updateAnnotation.mutate({ id: aid, color: color as any })}
        onUpdateNote={(aid, note) => updateAnnotation.mutate({ id: aid, note })}
        onDelete={(aid) => { deleteAnnotation.mutate({ id: aid }); setPopoverAnnotation(null); }}
        onDismiss={() => setPopoverAnnotation(null)}
      />

      {/* Loading overlay */}
      {!isLoaded && (
        <div
          className="absolute inset-0 flex items-center justify-center z-20"
          style={{ backgroundColor: "var(--bg)" }}
        >
          <p className="text-sm" style={{ color: "var(--text-dim)" }}>
            Rendering book...
          </p>
        </div>
      )}
    </div>
  );
}
