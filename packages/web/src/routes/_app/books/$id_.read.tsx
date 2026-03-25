import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/trpc";
import { useEpubReader } from "@/hooks/use-epub-reader";
import { useProgressSync } from "@/hooks/use-progress-sync";
import { ReaderTopBar } from "@/components/reader/reader-top-bar";
import { ReaderBottomBar } from "@/components/reader/reader-bottom-bar";
import { TapZones } from "@/components/reader/tap-zones";
import { TOCPanel } from "@/components/reader/toc-panel";
import { SettingsPanel } from "@/components/reader/settings-panel";

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

  const { syncNow } = useProgressSync({
    bookId: id,
    percentage,
    cfiPosition: currentCfi,
    enabled: isLoaded,
  });

  const [controlsVisible, setControlsVisible] = useState(true);
  const [tocOpen, setTocOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

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
        className="absolute inset-0"
        style={{ top: 0, bottom: 0 }}
      />

      {/* Navigation tap zones */}
      <TapZones
        onPrev={() => { prevPage(); syncNow(); }}
        onNext={() => { nextPage(); syncNow(); }}
        onCenter={toggleControls}
      />

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
