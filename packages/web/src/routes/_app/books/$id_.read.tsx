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

const HIGHLIGHT_COLORS: Record<string, string> = {
  yellow: "rgba(250,204,21,0.6)",
  green: "rgba(34,197,94,0.55)",
  blue: "rgba(59,130,246,0.5)",
  pink: "rgba(236,72,153,0.5)",
};

function getIframeRect(rendition: any): DOMRect {
  const iframe = rendition?.manager?.container?.querySelector("iframe");
  return iframe?.getBoundingClientRect() || new DOMRect(0, 0, 0, 0);
}

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

  // ─── Annotations ───
  const annotationsQuery = trpc.annotations.list.useQuery({ bookId: id }, { enabled: isLoaded });
  const createAnnotation = trpc.annotations.create.useMutation({ onSuccess: () => annotationsQuery.refetch() });
  const updateAnnotation = trpc.annotations.update.useMutation({ onSuccess: () => annotationsQuery.refetch() });
  const deleteAnnotation = trpc.annotations.delete.useMutation({ onSuccess: () => annotationsQuery.refetch() });

  const [toolbarPos, setToolbarPos] = useState<{ x: number; y: number } | null>(null);
  const [popoverAnnotation, setPopoverAnnotation] = useState<Annotation | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ x: number; y: number } | null>(null);
  const [selectionData, setSelectionData] = useState<{ text: string; cfiRange: string } | null>(null);

  // Keep annotations ref current for use in iframe event handlers
  const annotationsRef = useRef(annotationsQuery.data);
  annotationsRef.current = annotationsQuery.data;

  // Render existing highlights
  useEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition || !annotationsQuery.data) return;

    for (const ann of annotationsQuery.data) {
      if (ann.cfiPosition) {
        try {
          rendition.annotations.highlight(
            ann.cfiPosition,
            {},
            undefined,
            "epubjs-hl",
            { fill: HIGHLIGHT_COLORS[ann.color || "yellow"] || HIGHLIGHT_COLORS.yellow }
          );
        } catch { /* CFI invalid for current chapter */ }
      }
    }
  }, [annotationsQuery.data, isLoaded]);

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

        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const iframeRect = getIframeRect(rendition);

        setToolbarPos({
          x: iframeRect.left + rect.left + rect.width / 2,
          y: iframeRect.top + rect.top - 20,
        });
        setSelectionData({ text, cfiRange });
      } catch { /* ignore */ }
    };

    rendition.on("selected", onSelected);
    return () => rendition.off("selected", onSelected);
  }, [isLoaded]);

  // Click on highlight → show popover
  useEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition || !isLoaded) return;

    const onClick = (e: MouseEvent) => {
      // epub.js highlights render as <svg> or <mark> elements with epubjs-hl class
      const el = e.target as HTMLElement;
      const hlEl = el.closest(".epubjs-hl") || (el.tagName === "mark" ? el : null);
      if (!hlEl) return;

      // Find which annotation this is by matching CFI to position on page
      const annotations = annotationsRef.current;
      if (!annotations?.length) return;

      // Use click position for the popover
      const iframeRect = getIframeRect(rendition);
      setPopoverPos({
        x: iframeRect.left + e.clientX,
        y: iframeRect.top + e.clientY - 20,
      });

      // Pick the first annotation (best effort — exact match would need CFI comparison)
      setPopoverAnnotation(annotations[0]);
    };

    // Listen on each iframe that renders
    const attach = () => {
      const iframes = rendition?.manager?.container?.querySelectorAll("iframe") || [];
      for (const iframe of Array.from(iframes)) {
        try {
          (iframe as HTMLIFrameElement).contentDocument?.addEventListener("click", onClick);
        } catch { /* cross-origin */ }
      }
    };

    const detach = () => {
      const iframes = rendition?.manager?.container?.querySelectorAll("iframe") || [];
      for (const iframe of Array.from(iframes)) {
        try {
          (iframe as HTMLIFrameElement).contentDocument?.removeEventListener("click", onClick);
        } catch { /* cross-origin */ }
      }
    };

    attach();
    rendition.on("rendered", attach);
    return () => { detach(); rendition.off("rendered", attach); };
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

  // ─── Reader chrome ───

  useEffect(() => {
    if (!controlsVisible || tocOpen || settingsOpen) return;
    const timer = setTimeout(() => setControlsVisible(false), 3000);
    return () => clearTimeout(timer);
  }, [controlsVisible, tocOpen, settingsOpen]);

  const toggleControls = useCallback(() => setControlsVisible((v) => !v), []);

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
      <div ref={containerRef} className="absolute inset-0 z-0" style={{ top: 0, bottom: 0 }} />

      <TapZones
        onPrev={() => { prevPage(); syncNow(); }}
        onNext={() => { nextPage(); syncNow(); }}
        onCenter={toggleControls}
      />

      {!controlsVisible && (
        <div className="fixed top-0 left-0 right-0 h-12 z-[25]" onMouseEnter={() => setControlsVisible(true)} />
      )}

      <ReaderTopBar
        title={bookQuery.data?.title ?? ""}
        visible={controlsVisible}
        onClose={handleClose}
        onToggleToc={() => { setTocOpen((v) => !v); setControlsVisible(true); }}
        onToggleSettings={() => { setSettingsOpen((v) => !v); setControlsVisible(true); }}
      />
      <ReaderBottomBar percentage={percentage} visible={controlsVisible} />

      <TOCPanel toc={toc} currentChapter={currentChapter} open={tocOpen} onClose={() => setTocOpen(false)} onNavigate={(href) => { goTo(href); syncNow(); }} />
      <SettingsPanel settings={settings} open={settingsOpen} onClose={() => setSettingsOpen(false)} onUpdate={updateSettings} />

      <HighlightToolbar position={toolbarPos} onHighlight={handleHighlight} onDismiss={handleDismissToolbar} />
      <HighlightPopover
        annotation={popoverAnnotation}
        position={popoverPos}
        onUpdateColor={(aid, color) => updateAnnotation.mutate({ id: aid, color: color as any })}
        onUpdateNote={(aid, note) => updateAnnotation.mutate({ id: aid, note })}
        onDelete={(aid) => { deleteAnnotation.mutate({ id: aid }); setPopoverAnnotation(null); }}
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
